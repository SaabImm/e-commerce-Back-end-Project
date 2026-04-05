// models/FeesModel.js
const mongoose = require('mongoose');

const cotisationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  year: { type: Number, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  dueDate: { type: Date, required: true },
  feeType: {
    type: String,
    enum: ['annual', 'event', 'training', 'exceptional', 'other'],
    default: 'annual',
    index: true
  },
  penalty: { type: Number, default: 0, min: 0 },
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
  cancelled: { type: Boolean, default: false, index: true }  // <-- new field
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

// Penalty calculation (unchanged, but uses isOverdue)
cotisationSchema.methods.calculatePenalty = function() {
  if (!this.isOverdue || this.penaltyConfig.type === 'none') return 0;

  const now = new Date();
  const due = this.dueDate;
  const payDate = this.paymentDate!== null ?  this.paymentDate : now
  const config = this.penaltyConfig;

  // Calculate number of full months between due date and now
  let monthsDiff = (payDate.getFullYear() - due.getFullYear()) * 12 + (payDate.getMonth() - due.getMonth());
  // If the current day is before the due day, subtract one month
  if (payDate.getDate() < due.getDate()) {
    monthsDiff--;
  }
  monthsDiff = Math.max(0, monthsDiff); // Ensure non-negative

  let penaltyAmount = 0;

  switch (config.frequency) {
    case 'once':
      // Apply penalty only once, if not already applied
      if (!this.penalty || this.penalty === 0) {
        penaltyAmount = config.type === 'fixed' ? config.rate : this.amount * config.rate / 100;
      }
      break;
    case 'monthly':
      if (monthsDiff > 0) {
        const periods = monthsDiff;
        if (config.type === 'fixed') {
          penaltyAmount = config.rate * periods;
        } else {
          penaltyAmount = this.amount * (config.rate / 100) * periods;
        }
      }
      break;
    case 'yearly':
      const yearsDiff = Math.floor(monthsDiff / 12);
      if (yearsDiff > 0) {
        if (config.type === 'fixed') {
          penaltyAmount = config.rate * yearsDiff;
        } else {
          penaltyAmount = this.amount * (config.rate / 100) * yearsDiff;
        }
      }
      break;
    case 'semi-annual':
      const semesters = Math.floor(monthsDiff / 6);
      if (semesters > 0) {
        if (config.type === 'fixed') {
          penaltyAmount = config.rate * semesters;
        } else {
          penaltyAmount = this.amount * (config.rate / 100) * semesters;
        }
      }
      break;
    default:
      break;
  }

  return Math.round(penaltyAmount);
};

// Pre‑save hook to update penalty
cotisationSchema.pre('save', function (next) {
  this.penalty = this.calculatePenalty();
  next();
});

module.exports = mongoose.model('Cotisation', cotisationSchema);