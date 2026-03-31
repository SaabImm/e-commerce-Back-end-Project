const mongoose = require('mongoose');

const cotisationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  year: {
    type: Number,
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  paidAmount: {
    type: Number,
    min: 0
  },
  dueDate: {
    type: Date,
    required: true
  },
  paymentDate: {
    type: Date,
    default: null
  },
  feeType: {
  type: String,
  enum: ['annual', 'event', 'training', 'exceptional', 'other'],
  default: 'annual',
  index: true
},
  penalty: {
    type: Number,
    default: 0,
    min: 0
  },
  penaltyConfig: {
  type: {
    type: String,
    enum: ['none', 'fixed', 'percentage'],
    default: 'none'
  },
  rate: {
    type: Number,
    min: 0,
    default: 0
  },
  frequency: {
    type: String,
    enum: ['none','once', 'monthly', 'yearly', 'semi-annual'],
    default: 'none'
  },
  // Optionnel : date de dernière application (pour éviter de cumuler plusieurs fois)
  lastPenaltyDate: {
    type: Date,
    default: null
  }
},
  status: {
    type: String,
    enum: ['pending', 'paid', 'partial', 'overdue', 'cancelled'],
    default: 'pending',
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank_transfer', 'check', 'online', 'credit', 'other'],
    default: null
  },
  notes: String
}, {
  timestamps: true
});

// Virtual: check if overdue (due date passed and not paid/cancelled)
cotisationSchema.virtual('isOverdue').get(function() {
  const now = new Date();
  return this.dueDate < now && this.status !== 'paid' && this.status !== 'cancelled';
});
  

// Method: calculate penalty (e.g., 10% of amount, or fixed 500 DA)
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

// Pre-save middleware to update status and penalty
cotisationSchema.pre('save', function(next) {
  // Auto‑set status to overdue if conditions met (only if not paid/cancelled)
  if (this.isOverdue && this.status !== 'paid' && this.status !== 'cancelled') {
    this.status = 'overdue';
  }

  // Recalculate penalty only if the fee is still unpaid (pending, partial, or overdue)
  if (this.status !== 'paid' && this.status !== 'cancelled') {
    this.penalty = this.calculatePenalty();
  }
  // If the fee is paid or cancelled, the penalty stays as it was (frozen)

  next();
});

module.exports = mongoose.model('Cotisation', cotisationSchema);