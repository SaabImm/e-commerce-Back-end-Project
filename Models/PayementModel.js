
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
    default: null
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
    default: Date.now
  },
  notes: String,
  // Indique si ce paiement provient d'un crédit utilisateur
  fromCredit: {
    type: Boolean,
    default: false
  },
  // Pour les paiements répartis sur plusieurs cotisations
  allocations: [{
    cotisation: { type: mongoose.Schema.Types.ObjectId, ref: 'Cotisation' },
    amount: Number
  }]
}, {
  timestamps: true
});

module.exports = mongoose.model('Payment', paymentSchema);