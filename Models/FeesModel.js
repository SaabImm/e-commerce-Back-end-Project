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
  penalty: {
    type: Number,
    default: 0,
    min: 0
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
    enum: ['cash', 'bank_transfer', 'check', 'online', 'other'],
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
  if (!this.isOverdue) return 0;
  // Example: 10% of amount, or a fixed fee if you prefer
  return Math.round(this.amount * 0.10); // 10% penalty
};

// Pre-save middleware to update status and penalty
cotisationSchema.pre('save', function(next) {
  // Auto‑set status to overdue if conditions met
  if (this.isOverdue && this.status !== 'overdue') {
    this.status = 'overdue';
  }
  // Recalculate penalty if overdue
  if (this.isOverdue) {
    this.penalty = this.calculatePenalty();
  } else {
    // If not overdue, penalty is zero (can be reset manually by admin)
    // You may choose to keep the existing penalty if you want to preserve it
    this.penalty = 0;
  }
  next();
});

module.exports = mongoose.model('Cotisation', cotisationSchema);