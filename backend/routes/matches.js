const express = require('express')
const router  = express.Router()
const Match   = require('../models/Match')
const Player  = require('../models/Player')
const jwt     = require('jsonwebtoken')
const { buildCareerMap } = require('../utils/playerStats')

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

// Creates a Player document the first time a name is used in this account's
// scoring, if one doesn't already exist. This is what makes a player typed
// in during Scoring show up on the Manage Players screen automatically —
// previously team1Players/team2Players were just throwaway strings with no
// link to the Player collection at all.
async function ensurePlayerExists(name, req) {
  if (!name) return
  try {
    const existing = await Player.findOne({ name, ...ownerQuery(req) })
    if (existing) return
    await new Player({ name, role: 'allrounder', ...ownerQuery(req) }).save()
  } catch (err) {
    console.error('Auto-create player failed for', name, err.message)
  }
}

// Recomputes and persists career totals for the given names, from every
// match this account owns. Called after every ball (and after undo) so
// Profile/Records/Manage Players never need a manual "Sync" tap to reflect
// what was just scored.
async function syncPlayersByName(names, req) {
  const uniqueNames = [...new Set((names || []).filter(Boolean))]
  if (!uniqueNames.length) return
  try {
    const matches = await Match.find(ownerQuery(req))
    const map = buildCareerMap(matches)
    await Promise.all(uniqueNames.map(async name => {
      const totals = map[name]
      if (!totals) return
      const player = await Player.findOne({ name, ...ownerQuery(req) })
      if (!player) return
      Object.assign(player, totals)
      await player.save()
    }))
  } catch (err) {
    console.error('Auto-sync after ball failed:', err.message)
  }
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
          wicketType, assistPlayer, batsmanName, bowlerName, extraRuns = 0 } = req.body
    batsmanName  = batsmanName?.trim()
    bowlerName   = bowlerName?.trim()
    assistPlayer = assistPlayer?.trim()

    // Make sure everyone involved in this ball has a real Player record.
    await Promise.all([
      ensurePlayerExists(batsmanName, req),
      ensurePlayerExists(bowlerName, req),
      ensurePlayerExists(assistPlayer, req),
    ])

    // Add ball to ballByBall
    innings.ballByBall.push({ runs, isWicket, isWide, isNoBall, wicketType, assistPlayer, batsmanName, bowlerName, extraRuns })

    // Update batting stats
    if (batsmanName && !isWide) {
      let bat = innings.battingStats.find(p => p.name === batsmanName)
      if (!bat) { innings.battingStats.push({ name: batsmanName, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false }); bat = innings.battingStats[innings.battingStats.length - 1] }
      if (!isWide) bat.balls += 1
      bat.runs += runs
      if (runs === 4) bat.fours += 1
      if (runs === 6) bat.sixes += 1
      if (isWicket) { bat.isOut = true; bat.wicketType = wicketType; bat.bowlerName = bowlerName; bat.assistPlayer = assistPlayer }
    }

    // Update bowling stats
    if (bowlerName) {
      let bowl = innings.bowlingStats.find(p => p.name === bowlerName)
      if (!bowl) { innings.bowlingStats.push({ name: bowlerName, overs: 0, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 }); bowl = innings.bowlingStats[innings.bowlingStats.length - 1] }
      bowl.runs += runs + extraRuns
      if (!isWide && !isNoBall) bowl.balls += 1
      if (isWide) bowl.wides += 1
      if (isNoBall) bowl.noBalls += 1
      if (isWicket) bowl.wickets += 1
      bowl.overs = bowl.balls / 6
    }

    // Update innings totals
    innings.runs += runs + extraRuns
    if (!isWide && !isNoBall) { innings.balls += 1; innings.wickets += isWicket ? 1 : 0 }
    innings.overs = `${Math.floor(innings.balls / 6)}.${innings.balls % 6}`
    innings.crr = innings.balls > 0 ? (innings.runs / (innings.balls / 6)).toFixed(2) : '0.00'

    // Check innings completion
    const totalBalls = match.overs * 6
    const maxWickets = 10
    if (innings.balls >= totalBalls || innings.wickets >= maxWickets) {
      if (match.status === 'innings1') {
        match.status = 'innings2'
        match.innings2.battingTeam = match.innings1.battingTeam === match.team1 ? match.team2 : match.team1
      } else {
        match.status = 'completed'
        match.isCompleted = true
        match.isLive = false
        // Calculate result
        const inn1 = match.innings1, inn2 = match.innings2
        if (inn2.runs > inn1.runs) {
          const wktsLeft = 10 - inn2.wickets
          match.result = `${inn2.battingTeam} won by ${wktsLeft} wicket${wktsLeft !== 1 ? 's' : ''}`
        } else if (inn1.runs > inn2.runs) {
          match.result = `${inn1.battingTeam} won by ${inn1.runs - inn2.runs} runs`
        } else {
          match.result = 'Match Tied'
        }
      }
    } else {
      // Check if chasing team won
      if (match.status === 'innings2') {
        const target = match.innings1.runs + 1
        if (innings.runs >= target) {
          match.status = 'completed'
          match.isCompleted = true
          match.isLive = false
          const wktsLeft = 10 - innings.wickets
          match.result = `${innings.battingTeam} won by ${wktsLeft} wicket${wktsLeft !== 1 ? 's' : ''}`
        }
      }
      if (match.status !== 'completed') match.isLive = true
    }

    match.markModified(inningsKey)
    await match.save()

    // Keep career stats current the moment a run/wicket is scored, instead
    // of requiring a manual Sync tap on some other screen later.
    await syncPlayersByName([batsmanName, bowlerName, assistPlayer], req)

    res.json(match)
  } catch (err) {
    console.error('POST /matches/:id/ball error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/matches/:id/undo ────────────────────────────────────────────────
router.post('/:id/undo', flexAuth, async (req, res) => {
  try {
    const match = await Match.findOne({ _id: req.params.id, ...ownerQuery(req) })
    if (!match) return res.status(404).json({ message: 'Match not found' })

    const inningsKey = match.status === 'innings2' && match.innings2.balls > 0 ? 'innings2' : 'innings1'
    const innings = match[inningsKey]
    if (!innings.ballByBall || innings.ballByBall.length === 0)
      return res.status(400).json({ message: 'Nothing to undo' })

    const lastBall = innings.ballByBall.pop()
    const { runs = 0, isWide, isNoBall, isWicket, batsmanName, bowlerName, assistPlayer, extraRuns = 0 } = lastBall

    // Reverse batting stats
    if (batsmanName) {
      const bat = innings.battingStats.find(p => p.name === batsmanName)
      if (bat) {
        bat.runs -= runs
        if (!isWide) bat.balls -= 1
        if (runs === 4) bat.fours -= 1
        if (runs === 6) bat.sixes -= 1
        if (isWicket) { bat.isOut = false; bat.wicketType = ''; bat.bowlerName = ''; bat.assistPlayer = '' }
      }
    }

    // Reverse bowling stats
    if (bowlerName) {
      const bowl = innings.bowlingStats.find(p => p.name === bowlerName)
      if (bowl) {
        bowl.runs -= (runs + extraRuns)
        if (!isWide && !isNoBall) bowl.balls -= 1
        if (isWide) bowl.wides -= 1
        if (isNoBall) bowl.noBalls -= 1
        if (isWicket) bowl.wickets -= 1
        bowl.overs = bowl.balls / 6
      }
    }

    // Reverse innings totals
    innings.runs -= (runs + extraRuns)
    if (!isWide && !isNoBall) { innings.balls -= 1; innings.wickets -= isWicket ? 1 : 0 }
    innings.overs = `${Math.floor(innings.balls / 6)}.${innings.balls % 6}`
    innings.crr = innings.balls > 0 ? (innings.runs / (innings.balls / 6)).toFixed(2) : '0.00'

    match.markModified(inningsKey)
    await match.save()

    // Re-sync so a reversed ball doesn't leave stale (too-high) totals.
    await syncPlayersByName([batsmanName, bowlerName, assistPlayer], req)

    res.json(match)
  } catch (err) {
    console.error('POST /matches/:id/undo error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── PATCH /api/matches/:id/overs ─────────────────────────────────────────────
router.patch('/:id/overs', flexAuth, async (req, res) => {
  try {
    const { overs } = req.body
    if (!overs || overs < 1 || overs > 50)
      return res.status(400).json({ message: 'Overs must be between 1 and 50' })

    const match = await Match.findOneAndUpdate(
      { _id: req.params.id, ...ownerQuery(req) },
      { overs: parseInt(overs) },
      { new: true }
    )
    if (!match) return res.status(404).json({ message: 'Match not found' })
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