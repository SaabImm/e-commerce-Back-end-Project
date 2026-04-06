const mongoose = require('mongoose');

const feeDefinitionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  year: { type: Number, required: true },
  amount: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  feeType: { type: String, enum: ['annual', 'event', 'training', 'exceptional', 'other'], required: true },
  penaltyConfig: {
    type: { type: String, enum: ['percentage', 'fixed'] },
    rate: Number,
    frequency: String,
  },
  notes: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isActive: { type: Boolean, default: true },
    changeLog: [{
      version: Number,
      changedAt: {
        type: Date,
        default: Date.now
      },
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      changes: [{
        field: String,
        oldValue: mongoose.Schema.Types.Mixed,
        newValue: mongoose.Schema.Types.Mixed
      }],
      reason: String
    }],
}, { timestamps: true });

module.exports = mongoose.model('FeeDefinition', feeDefinitionSchema);