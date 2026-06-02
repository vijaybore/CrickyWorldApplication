// src/types/index.ts

export type { RootStackParamList } from './navigation'

export type PlayerRole = 'batsman' | 'bowler' | 'allrounder' | 'wk-batsman'

export interface Player {
  _id:               string
  name:              string
  photoUrl?:         string
  role:              PlayerRole
  battingStyle?:     string
  bowlingStyle?:     string
  jerseyNumber?:     string
  totalMatches?:     number
  totalRuns?:        number
  totalBallsFaced?:  number
  totalFours?:       number
  totalSixes?:       number
  totalWickets?:     number
  totalBallsBowled?: number
  totalRunsConceded?:number
  highestScore?:     number
  timesOut?:         number
  totalFifties?:     number
  totalHundreds?:    number
  totalDotBalls?:    number
  totalWides?:       number
  fiveWickets?:      number
  bestBowlingW?:     number
  bestBowlingR?:     number
}

export interface User {
  id:       string
  name?:    string
  mobile?:  string
  email?:   string
}

export interface Ball {
  runs:          number
  isWicket:      boolean
  isWide:        boolean
  isNoBall:      boolean
  batsmanName?:  string
  bowlerName?:   string
  wicketType?:   string
  assistPlayer?: string
  extraRuns?:    number
}

export interface BattingStats {
  name:          string
  runs:          number
  balls:         number
  fours:         number
  sixes:         number
  isOut:         boolean
  wicketType?:   string
  bowlerName?:   string
  assistPlayer?: string
}

export interface BowlingStats {
  name:     string
  overs:    number
  balls:    number
  runs:     number
  wickets:  number
  wides:    number
  noBalls:  number
}

export interface Innings {
  battingTeam:  string
  runs:         number
  wickets:      number
  balls:        number
  overs:        string
  crr:          string
  ballByBall:   Ball[]
  battingStats: BattingStats[]
  bowlingStats: BowlingStats[]
}

export interface Match {
  _id:            string
  id:             string
  createdBy?:     string
  team1:          string
  team2:          string
  team1Players:   string[]
  team2Players:   string[]
  overs:          number
  status:         'setup' | 'innings1' | 'innings2' | 'completed'
  tossWinner:     string
  battingFirst:   string
  result:         string
  innings1:       Innings
  innings2:       Innings
  isLive:         boolean
  isCompleted:    boolean
  createdAt?:     string
  updatedAt?:     string
  tournamentId?:  string | null
  tournamentName?:string | null
}
