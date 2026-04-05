const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  cotisation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cotisation',
    default: null,
    index: true
  },

  amount: {
    type: Number,
    required: true,
    min: 0
  },

  type: {
    type: String,
    enum: ['cash', 'bank_transfer', 'check', 'online', 'credit', 'other'],
    required: true
  },

  date: {
    type: Date,
    default: Date.now,
    index: true
  },

  notes: String,

  fromCredit: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

module.exports = mongoose.model('Payment', paymentSchema);