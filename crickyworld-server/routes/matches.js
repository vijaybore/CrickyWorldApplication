const express = require('express')
const router  = express.Router()
const Match   = require('../models/Match')
const Player  = require('../models/Player')
const jwt     = require('jsonwebtoken')
const { buildCareerMap, normalizeName, getTotalsForName } = require('../utils/playerStats')
const { recomputeInnings, recomputeMatchStatus } = require('../utils/recompute')

function flexAuth(req, res, next) {
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET)
      req.user = { id: payload.id, type: 'user' }
      return next()
    } catch {}
  }
  const deviceId = req.body?.deviceId || req.query?.deviceId
  if (deviceId) {
    req.user = { id: deviceId, type: 'guest' }
    return next()
  }
  return res.status(401).json({ message: 'No token provided' })
}

function ownerQuery(req) {
  return req.user.type === 'user' ? { createdBy: req.user.id } : { deviceId: req.user.id }
}

async function ensurePlayerExists(name, req) {
  if (!name) return
  try {
    const trimmed = String(name).trim()
    if (!trimmed) return
    const existing = await Player.findOne({
      ...ownerQuery(req),
      name: { $regex: `^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
    })
    if (existing) return
    await new Player({ name: trimmed, role: 'allrounder', ...ownerQuery(req) }).save()
  } catch (err) {
    console.error('Auto-create player failed for', name, err.message)
  }
}

async function syncPlayersByName(names, req) {
  const uniqueNames = [...new Set((names || []).filter(Boolean))]
  if (!uniqueNames.length) return
  try {
    const matches = await Match.find(ownerQuery(req))
    const map = buildCareerMap(matches)
    await Promise.all(uniqueNames.map(async name => {
      const trimmed = String(name).trim()
      if (!trimmed) return
      const player = await Player.findOne({
        ...ownerQuery(req),
        name: { $regex: `^${trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      })
      if (!player) return
      const totals = getTotalsForName(map, player.name)
      Object.assign(player, totals)
      await player.save()
    }))
  } catch (err) {
    console.error('Auto-sync after ball failed:', err.message)
  }
}

// Small helper: given a match doc + a 'innings1'|'innings2' string, return
// the actual innings subdocument, validating the key so a bad inningsKey
// from the client gives a clean 400 instead of a crash.
function getInnings(match, inningsKey) {
  if (inningsKey !== 'innings1' && inningsKey !== 'innings2') return null
  return match[inningsKey]
}

// ── GET /api/matches ──────────────────────────────────────────────────────────
router.get('/', flexAuth, async (req, res) => {
  try {
    const matches = await Match.find(ownerQuery(req)).sort({ createdAt: -1 })
    res.json(matches)
  } catch (err) {
    console.error('GET /matches error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── GET /api/matches/:id ──────────────────────────────────────────────────────
router.get('/:id', flexAuth, async (req, res) => {
  try {
    const match = await Match.findOne({ _id: req.params.id, ...ownerQuery(req) })
    if (!match) return res.status(404).json({ message: 'Match not found' })
    res.json(match)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/matches ─────────────────────────────────────────────────────────
router.post('/', flexAuth, async (req, res) => {
  try {
    const matchData = { ...req.body, ...ownerQuery(req) }
    const match = new Match(matchData)
    await match.save()
    res.status(201).json(match)
  } catch (err) {
    console.error('POST /matches error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/matches/:id/ball ────────────────────────────────────────────────
router.post('/:id/ball', flexAuth, async (req, res) => {
  try {
    const match = await Match.findOne({ _id: req.params.id, ...ownerQuery(req) })
    if (!match) return res.status(404).json({ message: 'Match not found' })

    const inningsKey = match.status === 'innings1' ? 'innings1' : 'innings2'
    const innings = match[inningsKey]
    let { runs = 0, isWicket = false, isWide = false, isNoBall = false,
          wicketType, assistPlayer, batsmanName, bowlerName, nonStrikerName, extraRuns = 0 } = req.body
    batsmanName    = batsmanName?.trim()
    bowlerName     = bowlerName?.trim()
    assistPlayer   = assistPlayer?.trim()
    nonStrikerName = nonStrikerName?.trim()

    await Promise.all([
      ensurePlayerExists(batsmanName, req),
      ensurePlayerExists(bowlerName, req),
      ensurePlayerExists(assistPlayer, req),
    ])

    innings.ballByBall.push({
      runs, isWicket, isWide, isNoBall, wicketType, assistPlayer,
      batsmanName, bowlerName, nonStrikerName, extraRuns,
    })
    // A new ball invalidates whatever redo history existed for this innings.
    innings.redoStack = []

    recomputeInnings(innings)
    recomputeMatchStatus(match)

    match.markModified(inningsKey)
    await match.save()

    await syncPlayersByName([batsmanName, bowlerName, assistPlayer], req)

    res.json(match)
  } catch (err) {
    console.error('POST /matches/:id/ball error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/matches/:id/undo-last ───────────────────────────────────────────
// Innings-specific undo. Body: { inningsKey: 'innings1' | 'innings2' }.
// Pops the last ball from THAT innings (never guesses), pushes it onto
// redoStack so redo-last can restore it, then replays via recompute and
// re-derives match status/result. This is what lets you undo your way out
// of a completed/tied match — recomputeMatchStatus will naturally flip
// status back to 'innings2' or 'innings1' once the numbers no longer say
// the match is over.
router.post('/:id/undo-last', flexAuth, async (req, res) => {
  try {
    const match = await Match.findOne({ _id: req.params.id, ...ownerQuery(req) })
    if (!match) return res.status(404).json({ message: 'Match not found' })

    const { inningsKey } = req.body
    const innings = getInnings(match, inningsKey)
    if (!innings) return res.status(400).json({ message: 'Invalid inningsKey' })

    if (!innings.ballByBall || innings.ballByBall.length === 0) {
      return res.status(400).json({ message: `Nothing to undo in ${inningsKey === 'innings1' ? '1st Innings' : '2nd Innings'}` })
    }

    const lastBall = innings.ballByBall.pop()
    innings.redoStack = innings.redoStack || []
    innings.redoStack.push(lastBall)

    recomputeInnings(innings)
    recomputeMatchStatus(match)

    match.markModified(inningsKey)
    await match.save()

    await syncPlayersByName(
      [lastBall.batsmanName, lastBall.bowlerName, lastBall.assistPlayer],
      req
    )

    res.json(match)
  } catch (err) {
    console.error('POST /matches/:id/undo-last error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/matches/:id/redo-last ───────────────────────────────────────────
// Innings-specific redo. Body: { inningsKey: 'innings1' | 'innings2' }.
// Pops from that innings' redoStack and pushes it back onto ballByBall.
router.post('/:id/redo-last', flexAuth, async (req, res) => {
  try {
    const match = await Match.findOne({ _id: req.params.id, ...ownerQuery(req) })
    if (!match) return res.status(404).json({ message: 'Match not found' })

    const { inningsKey } = req.body
    const innings = getInnings(match, inningsKey)
    if (!innings) return res.status(400).json({ message: 'Invalid inningsKey' })

    if (!innings.redoStack || innings.redoStack.length === 0) {
      return res.status(400).json({ message: `Nothing to redo in ${inningsKey === 'innings1' ? '1st Innings' : '2nd Innings'}` })
    }

    const ball = innings.redoStack.pop()
    innings.ballByBall.push(ball)

    recomputeInnings(innings)
    recomputeMatchStatus(match)

    match.markModified(inningsKey)
    await match.save()

    await syncPlayersByName(
      [ball.batsmanName, ball.bowlerName, ball.assistPlayer],
      req
    )

    res.json(match)
  } catch (err) {
    console.error('POST /matches/:id/redo-last error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── PATCH /api/matches/:id/balls/:inningsKey/:index ───────────────────────────
// Edits a single ball anywhere in the innings (not just the last one).
// Replays the whole innings afterward, so totals/stats/crease/match status
// are exactly consistent with the edited list regardless of where the
// edited ball sits.
router.patch('/:id/balls/:inningsKey/:index', flexAuth, async (req, res) => {
  try {
    const match = await Match.findOne({ _id: req.params.id, ...ownerQuery(req) })
    if (!match) return res.status(404).json({ message: 'Match not found' })

    const { inningsKey, index } = req.params
    const innings = getInnings(match, inningsKey)
    if (!innings) return res.status(400).json({ message: 'Invalid inningsKey' })

    const idx = parseInt(index, 10)
    if (!Number.isInteger(idx) || idx < 0 || idx >= innings.ballByBall.length) {
      return res.status(400).json({ message: 'Invalid ball index' })
    }

    const existing = innings.ballByBall[idx]
    const {
      runs, isWicket, isWide, isNoBall, wicketType, assistPlayer,
      batsmanName, bowlerName, nonStrikerName,
    } = req.body

    if (runs !== undefined) existing.runs = runs
    if (isWicket !== undefined) existing.isWicket = isWicket
    if (isWide !== undefined) existing.isWide = isWide
    if (isNoBall !== undefined) existing.isNoBall = isNoBall
    if (wicketType !== undefined) existing.wicketType = wicketType
    if (assistPlayer !== undefined) existing.assistPlayer = assistPlayer
    if (batsmanName !== undefined) existing.batsmanName = batsmanName?.trim()
    if (bowlerName !== undefined) existing.bowlerName = bowlerName?.trim()
    if (nonStrikerName !== undefined) existing.nonStrikerName = nonStrikerName?.trim()
    existing.extraRuns = (existing.isWide || existing.isNoBall) ? 1 : 0

    // Editing the past invalidates any redo history for this innings —
    // the redo balls were recorded against the pre-edit sequence and can
    // no longer be replayed onto the edited one.
    innings.redoStack = []

    await Promise.all([
      ensurePlayerExists(existing.batsmanName, req),
      ensurePlayerExists(existing.bowlerName, req),
      ensurePlayerExists(existing.assistPlayer, req),
    ])

    recomputeInnings(innings)
    recomputeMatchStatus(match)

    match.markModified(inningsKey)
    await match.save()

    await syncPlayersByName(
      [existing.batsmanName, existing.bowlerName, existing.assistPlayer],
      req
    )

    res.json(match)
  } catch (err) {
    console.error('PATCH /matches/:id/balls/:inningsKey/:index error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── DELETE /api/matches/:id/balls/:inningsKey/:index ──────────────────────────
// Removes one ball entirely (e.g. a mis-recorded ball that shouldn't have
// counted at all) and replays everything after it.
router.delete('/:id/balls/:inningsKey/:index', flexAuth, async (req, res) => {
  try {
    const match = await Match.findOne({ _id: req.params.id, ...ownerQuery(req) })
    if (!match) return res.status(404).json({ message: 'Match not found' })

    const { inningsKey, index } = req.params
    const innings = getInnings(match, inningsKey)
    if (!innings) return res.status(400).json({ message: 'Invalid inningsKey' })

    const idx = parseInt(index, 10)
    if (!Number.isInteger(idx) || idx < 0 || idx >= innings.ballByBall.length) {
      return res.status(400).json({ message: 'Invalid ball index' })
    }

    const [removed] = innings.ballByBall.splice(idx, 1)
    innings.redoStack = []

    recomputeInnings(innings)
    recomputeMatchStatus(match)

    match.markModified(inningsKey)
    await match.save()

    await syncPlayersByName(
      [removed.batsmanName, removed.bowlerName, removed.assistPlayer],
      req
    )

    res.json(match)
  } catch (err) {
    console.error('DELETE /matches/:id/balls/:inningsKey/:index error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── PATCH /api/matches/:id/overs ─────────────────────────────────────────────
router.patch('/:id/overs', flexAuth, async (req, res) => {
  try {
    const { overs } = req.body
    if (!overs || overs < 1 || overs > 50)
      return res.status(400).json({ message: 'Overs must be between 1 and 50' })

    const match = await Match.findOne({ _id: req.params.id, ...ownerQuery(req) })
    if (!match) return res.status(404).json({ message: 'Match not found' })

    match.overs = parseInt(overs)
    // Overs changing can flip whether an innings counts as "done" (e.g.
    // reducing overs below balls already bowled), so re-derive status too.
    recomputeMatchStatus(match)
    await match.save()

    res.json(match)
  } catch (err) {
    console.error('PATCH /matches/:id/overs error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── PUT /api/matches/:id ──────────────────────────────────────────────────────
router.put('/:id', flexAuth, async (req, res) => {
  try {
    const match = await Match.findOneAndUpdate(
      { _id: req.params.id, ...ownerQuery(req) },
      { ...req.body },
      { new: true, runValidators: true }
    )
    if (!match) return res.status(404).json({ message: 'Match not found' })
    res.json(match)
  } catch (err) {
    console.error('PUT /matches/:id error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── DELETE /api/matches/:id ───────────────────────────────────────────────────
router.delete('/:id', flexAuth, async (req, res) => {
  try {
    const match = await Match.findOneAndDelete({ _id: req.params.id, ...ownerQuery(req) })
    if (!match) return res.status(404).json({ message: 'Match not found' })
    res.json({ message: 'Match deleted' })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router