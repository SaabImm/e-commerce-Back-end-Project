const mongoose = require('mongoose');

const creditTransactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  type: { 
    type: String, 
    enum: ['deposit', 'used_for_fee', 'excess_from_fee', 'versement', 'repayment'], 
    required: true 
  },
  reversed: { type: Boolean, default: false },
  reference: { type: mongoose.Schema.Types.ObjectId, refPath: 'refModel' },
  refModel: { type: String, enum: ['Cotisation', 'Payment'] },
  paymentMethod: { type: String, enum: ['cash', 'bank_transfer', 'check', 'online', 'other'] },
  notes: String,
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CreditTransaction', creditTransactionSchema);