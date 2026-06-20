const mongoose = require('mongoose')

const ballSchema = new mongoose.Schema({
  runs:         { type: Number, default: 0 },
  isWicket:     { type: Boolean, default: false },
  isWide:       { type: Boolean, default: false },
  isNoBall:     { type: Boolean, default: false },
  batsmanName:  { type: String, default: '' },
  bowlerName:   { type: String, default: '' },
  wicketType:   { type: String, default: '' },
  assistPlayer: { type: String, default: '' },
  extraRuns:    { type: Number, default: 0 },
  // FIX: nonStrikerName was being sent by the client (see ScoringScreen's
  // submitBall) but never had a schema field, so Mongoose strict mode
  // silently dropped it on save. Without it, replaying a ball list from
  // scratch (recompute engine) has no way to know who was at the non-
  // striker end for that specific ball, which is needed to correctly
  // restore crease state after undo/edit/delete.
  nonStrikerName: { type: String, default: '' },
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

  // FIX: these four fields were being read/written by ScoringScreen.tsx
  // (inn.currentStriker, inn.currentNonStriker, inn.currentBowler) but had
  // no schema field, so Mongoose strict mode silently dropped them on
  // save — crease state (who's batting/bowling) vanished on app restart
  // or reopening a match, even though the ball-by-ball data was intact.
  currentStriker:    { type: String, default: '' },
  currentNonStriker: { type: String, default: '' },
  currentBowler:     { type: String, default: '' },

  // FIX: redo support. Popped balls from undo-last go here; redo-last
  // pops from here back onto ballByBall. Cleared whenever a new ball is
  // scored or a ball is edited/deleted, since the redo history is only
  // valid as a mirror of the immediately-preceding undo chain.
  redoStack: [ballSchema],
}, { _id: false })

const matchSchema = new mongoose.Schema({
  createdBy: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: false,
    index:    true,
  },
  deviceId: { type: String, default: null, index: true },

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
  tournamentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', default: null },
  tournamentName: { type: String, default: null },
  innings1: { type: inningsSchema, default: () => ({}) },
  innings2: { type: inningsSchema, default: () => ({}) },
}, { timestamps: true })

module.exports = mongoose.model('Match', matchSchema)