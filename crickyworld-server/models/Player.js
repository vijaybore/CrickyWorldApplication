const mongoose = require('mongoose')

const playerSchema = new mongoose.Schema({
  // ─── OWNER ────────────────────────────────────────────────────────────────
  createdBy: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
    index:    true,
  },

  // ─── Player info ──────────────────────────────────────────────────────────
  name:          { type: String, required: true, trim: true },
  photoUrl:      { type: String, default: '' },
  role:          { type: String, enum: ['batsman','bowler','allrounder','wk-batsman'], default: 'batsman' },
  battingStyle:  { type: String, default: '' },
  bowlingStyle:  { type: String, default: '' },
  jerseyNumber:  { type: String, default: '' },

  // ─── Career stats (auto-updated) ─────────────────────────────────────────
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

}, { timestamps: true })

module.exports = mongoose.model('Player', playerSchema)
