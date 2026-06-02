import mongoose from 'mongoose';

const matchSchema = new mongoose.Schema({
  // ... other fields ...
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',   // Changed ; to :
    index: true,   // Changed ; to :
  }
});

const Match = mongoose.model('Match', matchSchema);
export default Match;