const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  deviceId: { type: String, unique: true, sparse: true },
}, { timestamps: true })

userSchema.methods.toSafeJSON = function () {
  return { _id: this._id, name: this.name, email: this.email }
}

module.exports = mongoose.model('User', userSchema)
