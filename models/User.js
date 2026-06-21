// crickyworld-server/models/User.js
const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  name:              { type: String, required: true, trim: true },
  email:             { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:          { type: String, required: true, select: false },
  deviceId:          { type: String, unique: true, sparse: true },
  isVerified:        { type: Boolean, default: false },

  // OTP fields — shared by both the registration-verify flow and the login-2FA flow.
  // otpPurpose tells verify-otp which flow this code belongs to.
  otpHash:           { type: String, select: false },
  otpExpiry:         { type: Date },
  otpPurpose:        { type: String, enum: ['register', 'login'] },
  otpAttempts:       { type: Number, default: 0 },

  // Forgot-password is untouched — still link-based via email.
  resetToken:        { type: String },
  resetTokenExpiry:  { type: Date },
}, { timestamps: true })

module.exports = mongoose.model('User', userSchema)