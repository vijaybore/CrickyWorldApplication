const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  name:              { type: String, required: true, trim: true },
  email:             { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:          { type: String, required: true, select: false },
  deviceId:          { type: String, unique: true, sparse: true },
  isVerified:        { type: Boolean, default: true }, // legacy field, always true now — email-link verification was removed

  // ── Legacy magic-link verification fields ──────────────────────────────
  // No longer written to or read by any route. Left in the schema so any
  // existing documents that still have these values don't error out, and so
  // a future Mongoose strict-mode read of an old document doesn't drop data
  // unexpectedly. Safe to remove entirely in a later cleanup once you're
  // sure nothing references them.
  loginToken:          { type: String, select: false },
  loginTokenExpiry:    { type: Date },
  loginTokenPurpose:   { type: String, enum: ['register', 'login'] },
  loginTokenConfirmed: { type: Boolean, default: false },

  // Forgot-password — still active, link-based via email.
  resetToken:        { type: String },
  resetTokenExpiry:  { type: Date },
}, { timestamps: true })

module.exports = mongoose.model('User', userSchema)