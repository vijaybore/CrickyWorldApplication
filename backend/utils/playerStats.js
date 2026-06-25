// crickyworld-server/utils/playerStats.js
//
// Shared career-stat math for the backend. Used by routes/players.js
// (POST /api/players/:id/sync) and routes/matches.js (automatic per-ball
// sync after every scored ball).

function emptyTotals() {
  return {
    totalMatches: 0, totalRuns: 0, totalBallsFaced: 0, totalFours: 0, totalSixes: 0,
    highestScore: 0, timesOut: 0, totalFifties: 0, totalHundreds: 0,
    totalWickets: 0, totalBallsBowled: 0, totalRunsConceded: 0, totalWides: 0,
    fiveWickets: 0, bestBowlingW: 0, bestBowlingR: 0,
    catches: 0, stumpings: 0, runOuts: 0,
  }
}

// Normalizes a player name for matching purposes: trims surrounding
// whitespace, collapses internal whitespace runs, and lowercases. This is
// what lets "V", " V", and "v" all resolve to the same career-stat bucket
// even though they're scored as separate raw strings on each ball — the
// Scoring screen lets a name be free-typed (not always picked from an
// exact-match list), so small casing/whitespace differences between what
// gets typed during scoring and the stored Player.name are expected, not
// exceptional.
function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()
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

// Walks every match's two innings and returns a map keyed by *normalized*
// name -> totals (plus a `displayName` holding the first-seen raw casing)
// for every player who batted, bowled, or fielded across the given matches.
//
// Callers that need to look up a specific Player document's stats should
// use getTotalsForName(map, player.name) below rather than indexing the
// map directly with a raw name, so a casing/whitespace mismatch can't
// silently fall through to an empty/zeroed result.
function buildCareerMap(matches) {
  const map = {}
  const ensure = rawName => {
    const key = normalizeName(rawName)
    if (!map[key]) map[key] = { ...emptyTotals(), matchIds: new Set(), displayName: rawName, bestBowlingR: 999 }
    return map[key]
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

// Looks up totals for a given (possibly differently-cased/spaced) name in a
// map built by buildCareerMap. Returns emptyTotals() if nobody matching that
// name appears in any match — never throws, never returns undefined.
function getTotalsForName(map, name) {
  const key = normalizeName(name)
  const entry = map[key]
  if (!entry) return emptyTotals()
  const { displayName, ...totals } = entry
  return totals
}

module.exports = { buildCareerMap, emptyTotals, normalizeName, getTotalsForName }