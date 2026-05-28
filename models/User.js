const mongoose = require('mongoose')
const bcrypt   = require('bcryptjs')

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    trim: true,
    default: '',
  },
  mobile: {
    type:     String,
    unique:   true,
    sparse:   true,
    trim:     true,
  },
  deviceId: {
    type:   String,
    unique: true,
    sparse: true,
  },
  // OTP fields
  otp: {
    code:      { type: String },
    expiresAt: { type: Date },
  },
}, { timestamps: true })

// Remove sensitive fields when converting to JSON
userSchema.methods.toSafeJSON = function () {
  return {
    id:     this._id,
    name:   this.name,
    mobile: this.mobile,
  }
}

module.exports = mongoose.model('User', userSchema)
