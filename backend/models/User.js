const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  name:              { type: String, required: true, trim: true },
  email:             { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:          { type: String, required: true, select: false },
  deviceId:          { type: String, sparse: true },
  isVerified:        { type: Boolean, default: false },

  // Magic-link verification — shared by both the registration-verify flow and
  // the login-confirm flow. loginTokenPurpose tells the confirm/status routes
  // which flow this token belongs to. The app polls login-status/:token until
  // confirmed flips to true, then receives the real JWT.
  loginToken:         { type: String, select: false },
  loginOtp:           { type: String, select: false },
  loginTokenExpiry:   { type: Date },
  loginTokenPurpose:  { type: String, enum: ['register', 'login'] },
  loginTokenConfirmed: { type: Boolean, default: false },

  // Forgot-password is untouched — still link-based via email.
  resetToken:        { type: String },
  resetTokenExpiry:  { type: Date },

  // Refresh token for short-lived access tokens. Stored hashed so a DB leak
  // doesn't hand out reusable long-lived credentials directly. The frontend
  // (AuthContext.tsx) already calls /refresh-token and /logout expecting
  // these to exist.
  refreshTokenHash:   { type: String, select: false },
  refreshTokenExpiry: { type: Date },
}, { timestamps: true })

module.exports = mongoose.model('User', userSchema)