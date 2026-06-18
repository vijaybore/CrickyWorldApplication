//C:\Users\ajayb\OneDrive\Desktop\CrickyWorldApp-main\crickyworld-server\routes\matches.js
const express = require('express')
const router  = express.Router()
const Match   = require('../models/Match')
const jwt     = require('jsonwebtoken')

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

// ── GET /api/matches ──────────────────────────────────────────────────────────
router.get('/', flexAuth, async (req, res) => {
  try {
    const query = req.user.type === 'user'
      ? { createdBy: req.user.id }
      : { deviceId: req.user.id }
    const matches = await Match.find(query).sort({ createdAt: -1 })
    res.json(matches)
  } catch (err) {
    console.error('GET /matches error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── GET /api/matches/:id ──────────────────────────────────────────────────────
router.get('/:id', flexAuth, async (req, res) => {
  try {
    const query = req.user.type === 'user'
      ? { _id: req.params.id, createdBy: req.user.id }
      : { _id: req.params.id }
    const match = await Match.findOne(query)
    if (!match) return res.status(404).json({ message: 'Match not found' })
    res.json(match)
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/matches ─────────────────────────────────────────────────────────
router.post('/', flexAuth, async (req, res) => {
  try {
    const matchData = { ...req.body }
    if (req.user.type === 'user') {
      matchData.createdBy = req.user.id
    } else {
      matchData.deviceId = req.user.id
    }
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
    const query = req.user.type === 'user'
      ? { _id: req.params.id, createdBy: req.user.id }
      : { _id: req.params.id }
    const match = await Match.findOne(query)
    if (!match) return res.status(404).json({ message: 'Match not found' })

    const inningsKey = match.status === 'innings1' ? 'innings1' : 'innings2'
    const innings = match[inningsKey]
    const { runs = 0, isWicket = false, isWide = false, isNoBall = false,
            wicketType, assistPlayer, batsmanName, nonStrikerName, bowlerName, extraRuns = 0,
            // The CLIENT determines who's on strike/non-strike/bowling AFTER
            // this ball resolves (it already knows odd-run rotation,
            // over-boundary swap, and new-batsman-after-wicket rules) — we
            // just persist whatever it tells us, rather than duplicating
            // that logic here and risking drift.
            resultingStriker, resultingNonStriker, resultingBowler } = req.body

    // Add ball to ballByBall
    innings.ballByBall.push({ runs, isWicket, isWide, isNoBall, wicketType, assistPlayer, batsmanName, nonStrikerName, bowlerName, extraRuns })

    // A new ball means the timeline has branched forward — any previously
    // undone balls can no longer be meaningfully redone onto this state.
    innings.undoStack = []

    // Update batting stats
    if (batsmanName && !isWide) {
      let bat = innings.battingStats.find(p => p.name === batsmanName)
      if (!bat) { innings.battingStats.push({ name: batsmanName, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false }); bat = innings.battingStats[innings.battingStats.length - 1] }
      if (!isWide) bat.balls += 1
      bat.runs += runs
      if (runs === 4) bat.fours += 1
      if (runs === 6) bat.sixes += 1
      if (isWicket) { bat.isOut = true; bat.wicketType = wicketType; bat.bowlerName = bowlerName }
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

    // ── Persist crease state ───────────────────────────────────────────────
    // Only written when the innings the ball was recorded against is still
    // the CURRENT innings after the completion check above (i.e. this ball
    // didn't itself end the innings) — otherwise the next innings hasn't
    // had its players chosen yet and should stay blank until they are.
    const postBallInningsKey = match.status === 'innings1' ? 'innings1' : 'innings2'
    if (postBallInningsKey === inningsKey) {
      if (resultingStriker    !== undefined) innings.currentStriker    = resultingStriker
      if (resultingNonStriker !== undefined) innings.currentNonStriker = resultingNonStriker
      if (resultingBowler     !== undefined) innings.currentBowler     = resultingBowler
    }

    match.markModified(inningsKey)
    await match.save()
    res.json(match)
  } catch (err) {
    console.error('POST /matches/:id/ball error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/matches/:id/undo ────────────────────────────────────────────────
router.post('/:id/undo', flexAuth, async (req, res) => {
  try {
    const query = req.user.type === 'user'
      ? { _id: req.params.id, createdBy: req.user.id }
      : { _id: req.params.id }
    const match = await Match.findOne(query)
    if (!match) return res.status(404).json({ message: 'Match not found' })

    // ── FIX: innings selection must NOT depend on match.status. The old
    // check (`match.status === 'innings2' && innings2.balls > 0`) broke the
    // moment a match finished, because status flips to 'completed' on the
    // very ball that ends it — so undo on any completed match always fell
    // through to innings1, even when the match was decided entirely in the
    // 2nd innings. Correct rule: prefer innings2 whenever IT has balls to
    // undo, regardless of overall match status; only fall back to
    // innings1 once innings2 is exhausted or never started.
    const inningsKey = (match.innings2?.ballByBall?.length ?? 0) > 0 ? 'innings2' : 'innings1'
    const innings = match[inningsKey]
    if (!innings.ballByBall || innings.ballByBall.length === 0)
      return res.status(400).json({ message: 'Nothing to undo' })

    const wasCompleted = match.status === 'completed'

    const lastBall = innings.ballByBall.pop()
    const { runs = 0, isWide, isNoBall, isWicket, batsmanName, bowlerName, extraRuns = 0 } = lastBall

    // Reverse batting stats
    if (batsmanName) {
      const bat = innings.battingStats.find(p => p.name === batsmanName)
      if (bat) {
        bat.runs -= runs
        if (!isWide) bat.balls -= 1
        if (runs === 4) bat.fours -= 1
        if (runs === 6) bat.sixes -= 1
        if (isWicket) { bat.isOut = false; bat.wicketType = ''; bat.bowlerName = '' }
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

    // ── Stash the undone ball so /redo can bring it back ───────────────────
    if (!innings.undoStack) innings.undoStack = []
    innings.undoStack.push(lastBall)

    // ── Restore crease state to reflect the ball BEFORE the one just
    // undone (not the one we removed). If there's an earlier ball left in
    // this innings, use its recorded batsman/non-striker/bowler; if the
    // undone ball was the innings' very first ball, fall back to that
    // ball's own lineup, since that's who was at the crease before any
    // ball had been bowled.
    const priorBall = innings.ballByBall[innings.ballByBall.length - 1]
    if (priorBall) {
      innings.currentStriker    = priorBall.batsmanName    || innings.currentStriker
      innings.currentNonStriker = priorBall.nonStrikerName || innings.currentNonStriker
      innings.currentBowler     = priorBall.bowlerName     || innings.currentBowler
    } else {
      innings.currentStriker    = lastBall.batsmanName    || ''
      innings.currentNonStriker = lastBall.nonStrikerName || ''
      innings.currentBowler     = lastBall.bowlerName     || ''
    }

    // ── Un-complete the match if the ball we just undid was the one that
    // decided the result or ended an innings. Without this, undoing the
    // winning ball of a finished match left status stuck on 'completed'
    // with stale result text even though the score no longer supports it.
    if (wasCompleted) {
      match.status      = inningsKey
      match.isCompleted = false
      match.isLive       = true
      match.result        = ''
    } else if (match.status === 'innings2' && inningsKey === 'innings1') {
      // Undid innings1's last ball, but match had already moved to
      // innings2 with zero balls bowled there yet — move status back.
      match.status = 'innings1'
      match.isLive  = true
    }

    match.markModified(inningsKey)
    await match.save()
    res.json(match)
  } catch (err) {
    console.error('POST /matches/:id/undo error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── POST /api/matches/:id/redo ────────────────────────────────────────────────
// Re-applies the most recently undone ball from undoStack, through the same
// totals/stats/completion logic as a fresh /ball post.
router.post('/:id/redo', flexAuth, async (req, res) => {
  try {
    const query = req.user.type === 'user'
      ? { _id: req.params.id, createdBy: req.user.id }
      : { _id: req.params.id }
    const match = await Match.findOne(query)
    if (!match) return res.status(404).json({ message: 'Match not found' })

    // Mirrors undo's "innings2 first" preference.
    const inningsKey = (match.innings2?.undoStack?.length ?? 0) > 0 ? 'innings2' : 'innings1'
    const innings = match[inningsKey]
    if (!innings.undoStack || innings.undoStack.length === 0)
      return res.status(400).json({ message: 'Nothing to redo' })

    const ball = innings.undoStack.pop()
    const { runs = 0, isWicket = false, isWide = false, isNoBall = false,
            wicketType, assistPlayer, batsmanName, nonStrikerName, bowlerName, extraRuns = 0 } = ball

    innings.ballByBall.push({ runs, isWicket, isWide, isNoBall, wicketType, assistPlayer, batsmanName, nonStrikerName, bowlerName, extraRuns })

    if (batsmanName && !isWide) {
      let bat = innings.battingStats.find(p => p.name === batsmanName)
      if (!bat) { innings.battingStats.push({ name: batsmanName, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false }); bat = innings.battingStats[innings.battingStats.length - 1] }
      bat.balls += 1
      bat.runs += runs
      if (runs === 4) bat.fours += 1
      if (runs === 6) bat.sixes += 1
      if (isWicket) { bat.isOut = true; bat.wicketType = wicketType; bat.bowlerName = bowlerName }
    }

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

    innings.runs += runs + extraRuns
    if (!isWide && !isNoBall) { innings.balls += 1; innings.wickets += isWicket ? 1 : 0 }
    innings.overs = `${Math.floor(innings.balls / 6)}.${innings.balls % 6}`
    innings.crr = innings.balls > 0 ? (innings.runs / (innings.balls / 6)).toFixed(2) : '0.00'

    innings.currentStriker    = batsmanName    || innings.currentStriker
    innings.currentNonStriker = nonStrikerName || innings.currentNonStriker
    innings.currentBowler     = bowlerName     || innings.currentBowler

    const totalBalls = match.overs * 6
    const maxWickets  = 10
    if (innings.balls >= totalBalls || innings.wickets >= maxWickets) {
      if (inningsKey === 'innings1' && match.status === 'innings1') {
        match.status = 'innings2'
        match.innings2.battingTeam = match.innings1.battingTeam === match.team1 ? match.team2 : match.team1
      } else if (inningsKey === 'innings2') {
        match.status = 'completed'
        match.isCompleted = true
        match.isLive = false
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
    } else if (inningsKey === 'innings2') {
      const target = match.innings1.runs + 1
      if (innings.runs >= target) {
        match.status = 'completed'
        match.isCompleted = true
        match.isLive = false
        const wktsLeft = 10 - innings.wickets
        match.result = `${innings.battingTeam} won by ${wktsLeft} wicket${wktsLeft !== 1 ? 's' : ''}`
      }
    }

    match.markModified(inningsKey)
    await match.save()
    res.json(match)
  } catch (err) {
    console.error('POST /matches/:id/redo error:', err)
    res.status(500).json({ message: 'Server error' })
  }
})

// ── PATCH /api/matches/:id/overs ─────────────────────────────────────────────
router.patch('/:id/overs', flexAuth, async (req, res) => {
  try {
    const { overs } = req.body
    if (!overs || overs < 1 || overs > 50)
      return res.status(400).json({ message: 'Overs must be between 1 and 50' })

    const query = req.user.type === 'user'
      ? { _id: req.params.id, createdBy: req.user.id }
      : { _id: req.params.id }
    const match = await Match.findOneAndUpdate(
      query,
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
    const query = req.user.type === 'user'
      ? { _id: req.params.id, createdBy: req.user.id }
      : { _id: req.params.id }
    const match = await Match.findOneAndUpdate(
      query,
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
    const query = req.user.type === 'user'
      ? { _id: req.params.id, createdBy: req.user.id }
      : { _id: req.params.id }
    const match = await Match.findOneAndDelete(query)
    if (!match) return res.status(404).json({ message: 'Match not found' })
    res.json({ message: 'Match deleted' })
  } catch (err) {
    res.status(500).json({ message: 'Server error' })
  }
})

module.exports = router