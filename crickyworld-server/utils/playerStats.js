// crickyworld-server/utils/playerStats.js
//
// Shared career-stat math for the backend. This is the server-side
// counterpart to what RecordsScreen used to compute only on the client —
// having it here means we can persist totals onto the Player document
// instead of relying on a /sync endpoint that never actually existed.

function emptyTotals() {
  return {
    totalMatches: 0, totalRuns: 0, totalBallsFaced: 0, totalFours: 0, totalSixes: 0,
    highestScore: 0, timesOut: 0, totalFifties: 0, totalHundreds: 0,
    totalWickets: 0, totalBallsBowled: 0, totalRunsConceded: 0, totalWides: 0,
    fiveWickets: 0, bestBowlingW: 0, bestBowlingR: 999,
    catches: 0, stumpings: 0, runOuts: 0,
  }
}

// Credits whoever made a dismissal happen. Matches on substrings of
// wicketType so small wording differences still resolve. If the Scoring
// screen ever changes how it writes these strings, adjust the checks here.
function creditFielder(ensure, wicketType, bowlerName, assistPlayer) {
  if (!wicketType) return
  const wt = wicketType.toLowerCase()
  if (wt.includes('run out')) {
    if (assistPlayer) ensure(assistPlayer).runOuts++
  } else if (wt.includes('stump')) {
    if (assistPlayer) ensure(assistPlayer).stumpings++
  } else if (wt.includes('caught')) {
    if (wt.includes('and bowled') && bowlerName) ensure(bowlerName).catches++
    else if (assistPlayer) ensure(assistPlayer).catches++
  }
}

// Walks every match's two innings and returns a name -> totals map for every
// player who batted, bowled, or fielded across the given matches.
function buildCareerMap(matches) {
  const map = {}
  const ensure = name => {
    if (!map[name]) map[name] = { ...emptyTotals(), matchIds: new Set() }
    return map[name]
  }

  ;(matches || []).forEach(m => {
    ;[m.innings1, m.innings2].forEach(inn => {
      if (!inn) return

      ;(inn.battingStats || []).forEach(b => {
        if (!b.name) return
        const s = ensure(b.name)
        s.matchIds.add(String(m._id))
        const runs = b.runs || 0
        s.totalRuns += runs
        s.totalBallsFaced += b.balls || 0
        s.totalFours += b.fours || 0
        s.totalSixes += b.sixes || 0
        if (runs > s.highestScore) s.highestScore = runs
        if (b.isOut) {
          s.timesOut++
          creditFielder(ensure, b.wicketType, b.bowlerName, b.assistPlayer)
        }
        if (runs >= 100) s.totalHundreds++
        else if (runs >= 50) s.totalFifties++
      })

      ;(inn.bowlingStats || []).forEach(bw => {
        if (!bw.name) return
        const s = ensure(bw.name)
        s.matchIds.add(String(m._id))
        const wkts = bw.wickets || 0, runs = bw.runs || 0
        s.totalWickets += wkts
        s.totalBallsBowled += bw.balls || 0
        s.totalRunsConceded += runs
        s.totalWides += bw.wides || 0
        if (wkts >= 5) s.fiveWickets++
        if (wkts > s.bestBowlingW || (wkts === s.bestBowlingW && runs < s.bestBowlingR && wkts > 0)) {
          s.bestBowlingW = wkts
          s.bestBowlingR = runs
        }
      })
    })
  })

  Object.values(map).forEach(s => {
    s.totalMatches = s.matchIds.size
    delete s.matchIds
    if (s.bestBowlingW === 0) s.bestBowlingR = 0
  })

  return map
}

module.exports = { buildCareerMap, emptyTotals }