// utils/recompute.js
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for turning a list of balls into innings totals,
// batting/bowling stats, and crease state — and for deriving match
// status/result from both innings.
//
// WHY THIS EXISTS
// Previously /ball and /undo each had their own hand-written "+1 here,
// -1 there" logic. That's how the innings-selector bug happened (undo
// guessed which innings to act on instead of being told), and it made
// "edit a ball in the middle of the innings" or "delete a ball" impossible
// to support correctly — there's no way to subtract out one ball from
// pre-summed totals if a later ball's stats depend on order (e.g. strike
// rotation, over-completion, who's on strike for the *next* ball).
//
// recomputeInnings() instead replays the ENTIRE ballByBall array from
// scratch every time it's called. This is the only approach that's
// correct regardless of whether you just appended a ball, popped the
// last one, edited ball #12 of 40, or deleted it outright — the result
// is always "what the numbers would be if exactly this sequence of balls
// had been bowled," with no drift.
// ─────────────────────────────────────────────────────────────────────────────

function emptyBatStat(name) {
  return { name, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, wicketType: '', bowlerName: '', assistPlayer: '' }
}
function emptyBowlStat(name) {
  return { name, overs: 0, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0 }
}

// Replays innings.ballByBall into runs/wickets/balls/stats/crease state.
// Mutates and returns `innings`. Does NOT touch ballByBall itself — caller
// is responsible for the array being in its final desired state (after
// push, pop, splice, or edit) before calling this.
function recomputeInnings(innings) {
  const balls = innings.ballByBall || []

  innings.runs = 0
  innings.wickets = 0
  innings.balls = 0
  innings.battingStats = []
  innings.bowlingStats = []

  // Track crease as we replay, so the final values are "whoever's actually
  // at the crease after this exact sequence of balls" — not a guess.
  let striker = ''
  let nonStriker = ''
  let bowler = ''

  for (const ball of balls) {
    const {
      runs = 0, isWicket = false, isWide = false, isNoBall = false,
      wicketType = '', assistPlayer = '', batsmanName = '', bowlerName = '',
      nonStrikerName = '', extraRuns = 0,
    } = ball

    if (batsmanName) striker = batsmanName
    if (nonStrikerName) nonStriker = nonStrikerName
    if (bowlerName) bowler = bowlerName

    // Batting stats
    if (batsmanName) {
      let bat = innings.battingStats.find(p => p.name === batsmanName)
      if (!bat) { innings.battingStats.push(emptyBatStat(batsmanName)); bat = innings.battingStats[innings.battingStats.length - 1] }
      if (!isWide) bat.balls += 1
      bat.runs += runs
      if (runs === 4) bat.fours += 1
      if (runs === 6) bat.sixes += 1
      if (isWicket) { bat.isOut = true; bat.wicketType = wicketType; bat.bowlerName = bowlerName; bat.assistPlayer = assistPlayer }
    }

    // Bowling stats
    if (bowlerName) {
      let bowl = innings.bowlingStats.find(p => p.name === bowlerName)
      if (!bowl) { innings.bowlingStats.push(emptyBowlStat(bowlerName)); bowl = innings.bowlingStats[innings.bowlingStats.length - 1] }
      bowl.runs += runs + extraRuns
      if (!isWide && !isNoBall) bowl.balls += 1
      if (isWide) bowl.wides += 1
      if (isNoBall) bowl.noBalls += 1
      if (isWicket) bowl.wickets += 1
      bowl.overs = bowl.balls / 6
    }

    // Innings totals
    innings.runs += runs + extraRuns
    if (!isWide && !isNoBall) {
      innings.balls += 1
      if (isWicket) innings.wickets += 1
    }

    // Strike rotation — mirrors the client's optimistic logic in
    // ScoringScreen.submitBall, but now it's the server's call since the
    // server is replaying balls the client never directly scored (e.g.
    // after editing an earlier ball, everything after it must re-rotate
    // exactly as it would have live).
    const isLegal = !isWide && !isNoBall
    if (isLegal && runs % 2 !== 0 && !isWicket) {
      const tmp = striker; striker = nonStriker; nonStriker = tmp
    }
    // On a wicket, the incoming batsman's name is the *next* ball's
    // batsmanName, so we don't need special-case handling here — the next
    // iteration's `if (batsmanName) striker = batsmanName` line picks it
    // up naturally as long as the client always sends the new batsman's
    // name as batsmanName on the next ball, which it does.
  }

  innings.overs = `${Math.floor(innings.balls / 6)}.${innings.balls % 6}`
  innings.crr = innings.balls > 0 ? (innings.runs / (innings.balls / 6)).toFixed(2) : '0.00'

  innings.currentStriker = striker
  innings.currentNonStriker = nonStriker
  innings.currentBowler = bowler

  return innings
}

// Derives match.status/result/isLive/isCompleted from innings1/innings2 +
// match.overs. This is the ONLY place that decides those fields — both
// /ball and undo/redo/edit/delete all funnel through here afterward, so
// "the match thinks it's completed" can never drift from "the numbers say
// it's completed."
function recomputeMatchStatus(match) {
  const inn1 = match.innings1
  const inn2 = match.innings2
  const totalBalls = match.overs * 6
  const maxWickets = 10

  const inn1Done = inn1.balls >= totalBalls || inn1.wickets >= maxWickets
  const inn2Started = (inn2.ballByBall || []).length > 0
  const inn2ChasingDone = (() => {
    if (!inn2Started) return false
    const target = inn1.runs + 1
    return inn2.runs >= target || inn2.balls >= totalBalls || inn2.wickets >= maxWickets
  })()

  if (!inn1Done && !inn2Started) {
    match.status = inn1.ballByBall?.length || inn1.runs ? 'innings1' : (match.status === 'setup' ? 'setup' : 'innings1')
  } else if (inn1Done && !inn2ChasingDone) {
    match.status = 'innings2'
  } else if (inn2ChasingDone || (inn1Done && inn2Started)) {
    // covers: chasing team reached target, OR 2nd innings ran out of
    // balls/wickets, OR (defensive) both innings finished simultaneously
    if (inn2.balls >= totalBalls || inn2.wickets >= maxWickets || inn2.runs >= inn1.runs + 1) {
      match.status = 'completed'
    } else {
      match.status = 'innings2'
    }
  }

  if (match.status === 'completed') {
    match.isCompleted = true
    match.isLive = false
    if (inn2.runs > inn1.runs) {
      const wktsLeft = 10 - inn2.wickets
      match.result = `${inn2.battingTeam} won by ${wktsLeft} wicket${wktsLeft !== 1 ? 's' : ''}`
    } else if (inn1.runs > inn2.runs) {
      match.result = `${inn1.battingTeam} won by ${inn1.runs - inn2.runs} run${inn1.runs - inn2.runs !== 1 ? 's' : ''}`
    } else {
      match.result = 'Match Tied'
    }
  } else {
    match.isCompleted = false
    match.isLive = match.status === 'innings1' || match.status === 'innings2'
    match.result = ''
  }

  // innings2.battingTeam needs to be set the moment innings2 starts, same
  // as the original /ball route did — recompute doesn't know team names,
  // so only set it if it's not already set.
  if (match.status === 'innings2' && !inn2.battingTeam) {
    inn2.battingTeam = inn1.battingTeam === match.team1 ? match.team2 : match.team1
  }

  return match
}

module.exports = { recomputeInnings, recomputeMatchStatus }