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
// FIX: Always initialize innings1.battingTeam = battingFirst (= team1)
//      and innings2.battingTeam = team2, and set status = 'innings1'
//      so ScoringScreen always knows which team bats first.
router.post('/', flexAuth, async (req, res) => {
  try {
    const matchData = { ...req.body }

    // Tag match to user/device
    if (req.user.type === 'user') {
      matchData.createdBy = req.user.id
    } else {
      matchData.deviceId = req.user.id
    }

    // ── FIX: Derive battingFirst from request (defaults to team1) ─────────────
    const battingFirst  = matchData.battingFirst  || matchData.team1
    const team1         = matchData.team1
    const team2         = matchData.team2
    const battingSecond = battingFirst === team1 ? team2 : team1

    // ── FIX: Always initialize innings battingTeam fields ─────────────────────
    matchData.battingFirst = battingFirst
    matchData.status       = 'innings1'   // match starts immediately in innings1
    matchData.isLive       = true
    matchData.innings1 = {
      ...(matchData.innings1 || {}),
      battingTeam: battingFirst,           // team that bats first
    }
    matchData.innings2 = {
      ...(matchData.innings2 || {}),
      battingTeam: battingSecond,          // team that bats second
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

    // ── FIX: Repair battingTeam if it was blank (old matches created before fix) ─
    if (!match.innings1.battingTeam) {
      match.innings1.battingTeam = match.battingFirst || match.team1
      match.markModified('innings1')
    }
    if (!match.innings2.battingTeam) {
      const bt1 = match.innings1.battingTeam
      match.innings2.battingTeam = bt1 === match.team1 ? match.team2 : match.team1
      match.markModified('innings2')
    }

    const inningsKey = match.status === 'innings1' ? 'innings1' : 'innings2'
    const innings = match[inningsKey]
    const { runs = 0, isWicket = false, isWide = false, isNoBall = false,
            wicketType, assistPlayer, batsmanName, bowlerName, extraRuns = 0 } = req.body

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
        // innings2.battingTeam is already set; no need to re-derive
      } else {
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
    } else {
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

    const inningsKey = match.status === 'innings2' && match.innings2.balls > 0 ? 'innings2' : 'innings1'
    const innings = match[inningsKey]
    if (!innings.ballByBall || innings.ballByBall.length === 0)
      return res.status(400).json({ message: 'Nothing to undo' })

    const lastBall = innings.ballByBall.pop()
    const { runs = 0, isWide, isNoBall, isWicket, batsmanName, bowlerName, extraRuns = 0 } = lastBall

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

    innings.runs -= (runs + extraRuns)
    if (!isWide && !isNoBall) { innings.balls -= 1; innings.wickets -= isWicket ? 1 : 0 }
    innings.overs = `${Math.floor(innings.balls / 6)}.${innings.balls % 6}`
    innings.crr = innings.balls > 0 ? (innings.runs / (innings.balls / 6)).toFixed(2) : '0.00'

    match.markModified(inningsKey)
    await match.save()
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

    const updateData = { ...req.body }

    // ── FIX: When transitioning to innings2, ensure innings2.battingTeam is set ─
    if (updateData.status === 'innings2') {
      const existing = await Match.findOne(query)
      if (existing && !existing.innings2?.battingTeam) {
        const bt1 = existing.innings1?.battingTeam || existing.battingFirst || existing.team1
        updateData['innings2.battingTeam'] = bt1 === existing.team1 ? existing.team2 : existing.team1
      }
    }

    const match = await Match.findOneAndUpdate(
      query,
      { ...updateData },
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