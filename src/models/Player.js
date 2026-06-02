import mongoose from 'mongoose';

const matchSchema = new mongoose.Schema({
  // ... your other fields like teamName, score, etc. ...
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  }
});

const Match = mongoose.model('Match', matchSchema);

export default Match;