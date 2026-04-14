// models/FeesModel.js
const mongoose = require('mongoose');

const cotisationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  feeDefinition: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeDefinition' },
  year: { type: Number, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  dueDate: { type: Date, required: true },
  feeType: {
    type: String,
    enum: ['annual', 'event', 'training', 'exceptional', 'other'],
    default: 'annual',
    index: true
  },
  penaltyConfig: {
    type: {
      type: String,
      enum: ['none', 'fixed', 'percentage'],
      default: 'none'
    },
    rate: { type: Number, min: 0, default: 0 },
    frequency: {
      type: String,
      enum: ['none', 'once', 'monthly', 'yearly', 'semi-annual'],
      default: 'none'
    },
    lastPenaltyDate: { type: Date, default: null }
  },
  notes: String,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  cancelled: { type: Boolean, default: false, index: true }  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for overdue check
cotisationSchema.virtual('isOverdue').get(function () {
  const now = new Date();
  return this.dueDate < now;
});

// Method to generate a French title
cotisationSchema.methods.getTitle = function() {
  const typeLabels = {
    annual: 'Cotisation annuelle',
    event: 'Cotisation événement',
    training: 'Cotisation formation',
    exceptional: 'Cotisation exceptionnelle',
    other: 'Cotisation'
  };
  return `${typeLabels[this.feeType] || 'Cotisation'} ${this.year}`;
};

module.exports = mongoose.model('Cotisation', cotisationSchema);