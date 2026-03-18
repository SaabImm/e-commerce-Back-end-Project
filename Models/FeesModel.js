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
    enum: ['once', 'monthly', 'yearly', 'semi-annual'],
    default: 'once'
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
  const config = this.penaltyConfig;

  // Durée écoulée en mois (approximative)
  const monthsDiff = (now.getFullYear() - due.getFullYear()) * 12 +
                     (now.getMonth() - due.getMonth());

  let penaltyAmount = 0;

  switch (config.frequency) {
    case 'once':
      // Pénalité unique, on ne l'applique qu'une fois
      if (!this.penalty || this.penalty === 0) {
        penaltyAmount = config.type === 'fixed' ? config.rate : this.amount * config.rate / 100;
      }
      break;
    case 'monthly':
      // Pénalité mensuelle : nombre de mois * taux mensuel
      if (monthsDiff > 0) {
        const periods = monthsDiff; // on pourrait aussi limiter le nombre de périodes
        if (config.type === 'fixed') {
          penaltyAmount = config.rate * periods;
        } else {
          penaltyAmount = this.amount * (config.rate / 100) * periods;
        }
      }
      break;
    case 'yearly':
      // Pénalité annuelle : nombre d'années * taux annuel
      const yearsDiff = Math.floor(monthsDiff / 12);
      if (yearsDiff > 0) {
        if (config.type === 'fixed') {
          penaltyAmount = config.rate * yearsDiff;
        } else {
          penaltyAmount = this.amount * (config.rate / 100) * yearsDiff;
        }
      }
      break;
    // etc. pour semi-annual (6 mois)
  }

  return Math.round(penaltyAmount);
};

// Pre-save middleware to update status and penalty
cotisationSchema.pre('save', function(next) {
  if (this.isOverdue && this.status !== 'overdue') {
    this.status = 'overdue';
  }

  // Calcul de la pénalité basée sur la configuration
  const newPenalty = this.calculatePenalty();
  if (newPenalty !== this.penalty) {
    this.penalty = newPenalty;
    // Si on a appliqué une pénalité récurrente, on met à jour lastPenaltyDate
    if (this.penaltyConfig.frequency !== 'once') {
      this.penaltyConfig.lastPenaltyDate = new Date();
    }
  }

  next();
});

module.exports = mongoose.model('Cotisation', cotisationSchema);