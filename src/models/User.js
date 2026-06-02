// crickyworld-server/models/User.js
const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  name:              { type: String, required: true, trim: true },
  email:             { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:          { type: String, required: true, select: false },
  deviceId:          { type: String, unique: true, sparse: true },
  isVerified:        { type: Boolean, default: false },
  verifyToken:       { type: String },
  verifyTokenExpiry: { type: Date },
  resetToken:        { type: String },
  resetTokenExpiry:  { type: Date },
}, { timestamps: true })

module.exports = mongoose.model('User', userSchema)