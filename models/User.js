const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  name:              { type: String, required: true, trim: true },
  email:             { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:          { type: String, required: true, select: false },
  deviceId:          { type: String, unique: true, sparse: true },
  isVerified:        { type: Boolean, default: false },

  // Magic-link verification — shared by both the registration-verify flow and
  // the login-confirm flow. loginTokenPurpose tells the confirm/status routes
  // which flow this token belongs to. The app polls login-status/:token until
  // confirmed flips to true, then receives the real JWT.
  loginToken:         { type: String, select: false },
  loginTokenExpiry:   { type: Date },
  loginTokenPurpose:  { type: String, enum: ['register', 'login'] },
  loginTokenConfirmed: { type: Boolean, default: false },

  // Forgot-password is untouched — still link-based via email.
  resetToken:        { type: String },
  resetTokenExpiry:  { type: Date },
}, { timestamps: true })

module.exports = mongoose.model('User', userSchema)