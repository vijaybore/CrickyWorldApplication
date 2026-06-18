const mongoose = require('mongoose')

const ballSchema = new mongoose.Schema({
  runs:           { type: Number, default: 0 },
  isWicket:       { type: Boolean, default: false },
  isWide:         { type: Boolean, default: false },
  isNoBall:       { type: Boolean, default: false },
  batsmanName:    { type: String, default: '' },
  // The non-striker at the time this ball was bowled. Persisted per-ball
  // so ball-by-ball history and undo/redo can each independently
  // reconstruct exactly who was at each end for that specific delivery,
  // including across strike rotation.
  nonStrikerName: { type: String, default: '' },
  bowlerName:     { type: String, default: '' },
  wicketType:     { type: String, default: '' },
  assistPlayer:   { type: String, default: '' },
  extraRuns:      { type: Number, default: 0 },
}, { _id: false })

const battingStatsSchema = new mongoose.Schema({
  name:         { type: String, default: '' },
  runs:         { type: Number, default: 0 },
  balls:        { type: Number, default: 0 },
  fours:        { type: Number, default: 0 },
  sixes:        { type: Number, default: 0 },
  isOut:        { type: Boolean, default: false },
  wicketType:   { type: String, default: '' },
  bowlerName:   { type: String, default: '' },
  assistPlayer: { type: String, default: '' },
}, { _id: false })

const bowlingStatsSchema = new mongoose.Schema({
  name:    { type: String, default: '' },
  overs:   { type: Number, default: 0 },
  balls:   { type: Number, default: 0 },
  runs:    { type: Number, default: 0 },
  wickets: { type: Number, default: 0 },
  wides:   { type: Number, default: 0 },
  noBalls: { type: Number, default: 0 },
}, { _id: false })

const inningsSchema = new mongoose.Schema({
  battingTeam:  { type: String, default: '' },
  runs:         { type: Number, default: 0 },
  wickets:      { type: Number, default: 0 },
  balls:        { type: Number, default: 0 },
  overs:        { type: String, default: '0.0' },
  crr:          { type: String, default: '0.00' },
  ballByBall:   [ballSchema],
  battingStats: [battingStatsSchema],
  bowlingStats: [bowlingStatsSchema],
  // Persisted crease/bowler state — written after every /ball, /undo, and
  // /redo call so reopening the match (different session, device, app
  // restart) restores the exact same striker/non-striker/bowler instead
  // of guessing from battingStats array order, which breaks whenever the
  // non-striker hasn't faced a ball yet.
  currentStriker:    { type: String, default: '' },
  currentNonStriker: { type: String, default: '' },
  currentBowler:     { type: String, default: '' },
  // Balls popped by /undo, most-recently-undone last. /redo pops from
  // here and replays the ball. Cleared whenever a NEW ball is recorded,
  // since redo history becomes invalid once the timeline branches.
  undoStack:    [ballSchema],
}, { _id: false })

const matchSchema = new mongoose.Schema({
  createdBy: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: false,
    index:    true,
  },
  deviceId:      { type: String, default: null },
  team1:         { type: String, required: true, trim: true },
  team2:         { type: String, required: true, trim: true },
  team1Players:  [{ type: String }],
  team2Players:  [{ type: String }],
  overs:         { type: Number, required: true },
  status:        { type: String, enum: ['setup','innings1','innings2','completed'], default: 'setup' },
  tossWinner:    { type: String, default: '' },
  battingFirst:  { type: String, default: '' },
  result:        { type: String, default: '' },
  isLive:        { type: Boolean, default: false },
  isCompleted:   { type: Boolean, default: false },
  tournamentId:   { type: String, default: null },
  tournamentName: { type: String, default: null },
  innings1: { type: inningsSchema, default: () => ({}) },
  innings2: { type: inningsSchema, default: () => ({}) },
}, { timestamps: true })

module.exports = mongoose.model('Match', matchSchema)