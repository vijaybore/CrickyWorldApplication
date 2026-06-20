const mongoose = require('mongoose')

const playerSchema = new mongoose.Schema({
  // ─── OWNER ────────────────────────────────────────────────────────────────
  createdBy: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: false,
    index:    true,
  },
  // Guest (device-only) players are scoped by deviceId instead of createdBy —
  // mirrors the pattern already used by Match.js in this same folder.
  // Previously this field didn't exist here at all, and createdBy was
  // required:true, so a guest player (no logged-in user) would fail to save.
  deviceId: { type: String, default: null, index: true },

  // ─── Player info ──────────────────────────────────────────────────────────
  name:          { type: String, required: true, trim: true },
  photoUrl:      { type: String, default: '' },
  role:          { type: String, enum: ['batsman','bowler','allrounder','wk-batsman'], default: 'batsman' },
  battingStyle:  { type: String, default: '' },
  bowlingStyle:  { type: String, default: '' },
  jerseyNumber:  { type: String, default: '' },
  dateOfBirth:   { type: String, default: '' },

  // ─── Career stats (auto-updated by /sync and after every scored ball) ────
  totalMatches:      { type: Number, default: 0 },
  totalRuns:         { type: Number, default: 0 },
  totalBallsFaced:   { type: Number, default: 0 },
  totalFours:        { type: Number, default: 0 },
  totalSixes:        { type: Number, default: 0 },
  totalWickets:      { type: Number, default: 0 },
  totalBallsBowled:  { type: Number, default: 0 },
  totalRunsConceded: { type: Number, default: 0 },
  highestScore:      { type: Number, default: 0 },
  timesOut:          { type: Number, default: 0 },
  totalFifties:      { type: Number, default: 0 },
  totalHundreds:     { type: Number, default: 0 },
  totalDotBalls:     { type: Number, default: 0 },
  totalWides:        { type: Number, default: 0 },
  fiveWickets:       { type: Number, default: 0 },
  bestBowlingW:      { type: Number, default: 0 },
  bestBowlingR:      { type: Number, default: 0 },

  // ─── Fielding (new — previously not tracked anywhere) ────────────────────
  catches:           { type: Number, default: 0 },
  stumpings:         { type: Number, default: 0 },
  runOuts:           { type: Number, default: 0 },

}, { timestamps: true })

module.exports = mongoose.model('Player', playerSchema)