// services/FeeService.js
const Cotisation = require('../Models/FeesModel');
const Payment = require('../Models/PayementModel');
const User = require('../Models/UsersModels');
const CreditTransaction= require ('../Models/CreditTransactionsModel')
class FeeService {

  // =============================
  // 🧮 COMPUTE STATE (CORE)
  // =============================
async computeFeeState(cotisationId) {
  const cotisation = await Cotisation.findById(cotisationId);
  if (!cotisation) throw new Error("Cotisation non trouvée");

  if (cotisation.cancelled) {
    return { totalPaid: 0, totalDue: 0, remaining: 0, status: 'cancelled', lastPaymentDate: null };
  }

  const payments = await Payment.find({ cotisation: cotisationId }).sort({ date: -1 }); // newest first
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalDue = cotisation.amount + (cotisation.penalty || 0);
  const remaining = totalDue - totalPaid;

  let status = 'pending';
  if (remaining <= 0) status = 'paid';
  else if (totalPaid > 0) status = 'partial';
  else if (cotisation.dueDate < new Date()) status = 'overdue';

  // Last payment date (if any)
  const lastPaymentDate = payments.length > 0 ? payments[0].date : null;

  return { totalPaid, totalDue, remaining, status, lastPaymentDate };
}
  async attachComputed(cotisation) {
    const computed = await this.computeFeeState(cotisation._id);
    return { ...cotisation.toObject(), computed };
  }

  // =============================
  // 📦 GETTERS
  // =============================

  // In FeeService.js
async getAllFees() {
  const cotisations = await Cotisation.find().populate('user', 'name lastname email');

  const withComputed = [];
  for (const c of cotisations) {
    const enriched = await this.attachComputed(c);
    withComputed.push(enriched);
  }
  return withComputed;
}

  async getUserFees(userId) {
    const cotisations = await Cotisation.find({ user: userId });
    return Promise.all(cotisations.map(c => this.attachComputed(c)));
  }

  // =============================
  // ➕ CREATE
  // =============================
  async createFee({ user, viewerId, ...payload }) {
    const cotisation = new Cotisation({
      ...payload,
      user,
      createdBy: viewerId
    });
    await cotisation.save();

    await User.findByIdAndUpdate(user, {
      $push: { fees: cotisation._id }
    });

    // Auto‑apply credit after creation
    const targetUser = await User.findById(user);
    if (targetUser.credit > 0) {
      await this.applyCreditToUnpaidFees(user, targetUser.credit, viewerId);
    }

    return this.attachComputed(cotisation);
  }

  // =============================
  // ✏️ UPDATE
  // =============================
  async updateFee({ feeId, updates }) {
    const cotisation = await Cotisation.findById(feeId);
    if (!cotisation) throw new Error("Cotisation non trouvée");

    // Prevent updating fields that should be handled by payments
    const forbidden = ['paymentMethod', 'paymentDate', 'paidAmount', 'creditUsed'];
    forbidden.forEach(f => delete updates[f]);

    // Apply updates
    Object.keys(updates).forEach(key => {
      cotisation[key] = updates[key];
    });

    await cotisation.save();
    return this.attachComputed(cotisation);
  }

  // =============================
  // 💳 PAY (LEDGER)
  // =============================
  async payCotisation({
    feeId,
    amount = 0,
    creditUsed = 0,
    paymentMethod,
    paymentDate,
    notes
  }) {
    const cotisation = await Cotisation.findById(feeId);
    if (!cotisation) throw new Error("Cotisation non trouvée");
    if (cotisation.cancelled) throw new Error("Impossible de payer une cotisation annulée");

    const userId = cotisation.user;
    // Validate credit
    if (creditUsed > 0) {
      const user = await User.findById(userId);
      if (user.credit < creditUsed) {
        throw new Error('Crédit insuffisant');
      }
    }

    // Create payment record
    const payment = new Payment({
      user: userId,
      cotisation: feeId,
      amount: amount + creditUsed,
      type: paymentMethod,
      date: paymentDate || new Date(),
      notes,
      fromCredit: creditUsed > 0
    });
    await payment.save();

    // Deduct credit if used
    if (creditUsed > 0) {
      await User.findByIdAndUpdate(userId, {
        $inc: { credit: -creditUsed }
      });

      await CreditTransaction.create({
    user: userId,
    amount: -creditUsed,
    type: 'used_for_fee',
    reference: feeId,
    refModel: 'Cotisation',
    notes: `Used credit for fee ${feeId}`
  });
    }

    // Compute totals and check for overpayment
    const { totalPaid, totalDue } = await this.computeFeeState(feeId);
    if (totalPaid > totalDue) {
      const excess = totalPaid - totalDue;
      await User.findByIdAndUpdate(userId, {
        $inc: { credit: excess }
      });

    await CreditTransaction.create({
      user: userId,
      amount: excess,
      type: 'excess_from_fee',
      reference: feeId,
      refModel: 'Cotisation',
      notes: `Overpayment refunded as credit`
    });
    }

    return this.attachComputed(cotisation);
  }

  // =============================
  // 🔄 APPLY CREDIT TO UNPAID FEES
  // =============================
  async applyCreditToUnpaidFees(userId, amount, viewerId) {
    if (amount <= 0) return;

    const fees = await Cotisation.find({ user: userId, cancelled: false });
    // Sort by dueDate (oldest first)
    fees.sort((a, b) => a.dueDate - b.dueDate);

    let remaining = amount;
    for (const fee of fees) {
      if (remaining <= 0) break;

      const { remaining: feeRemaining } = await this.computeFeeState(fee._id);
      if (feeRemaining <= 0) continue;

      const toUse = Math.min(remaining, feeRemaining);
      if (toUse > 0) {
        await this.payCotisation({
          feeId: fee._id,
          creditUsed: toUse,
          paymentMethod: 'credit',
          notes: 'Crédit automatique appliqué'
        });
        remaining -= toUse;
      }
    }
  }

  // =============================
  // ❌ CANCEL
  // =============================
  async cancelFee(feeId) {
    const cotisation = await Cotisation.findById(feeId);
    if (!cotisation) throw new Error("Cotisation non trouvée");
    if (cotisation.cancelled) throw new Error("Cotisation déjà annulée");

    const { totalPaid } = await this.computeFeeState(feeId);
    cotisation.cancelled = true;
    await cotisation.save();

    // Refund any paid amount to user's credit
    if (totalPaid > 0) {
      await User.findByIdAndUpdate(cotisation.user, {
        $inc: { credit: totalPaid }
      });
    }

    return this.attachComputed(cotisation);
  }

  // =============================
  // 🗑 DELETE
  // =============================
  async deleteFee(feeId) {
    const cotisation = await Cotisation.findById(feeId);
    if (!cotisation) throw new Error("Cotisation non trouvée");

    await Payment.deleteMany({ cotisation: feeId });
    await User.findByIdAndUpdate(cotisation.user, {
      $pull: { fees: feeId }
    });
    await cotisation.deleteOne();

    return true;
  }

  // =============================
  // 📦 BULK CREATE
  // =============================
  async bulkCreateFees({
    role,
    wilaya,
    year,
    amount,
    dueDate,
    notes,
    feeType,
    penaltyConfig,
    viewerId
  }) {
    const numericAmount = Number(amount);
    if (isNaN(numericAmount)) throw new Error('Le montant doit être un nombre valide');
    if (!year || !amount || !dueDate) throw new Error('Année, montant et date requis');

    const filter = {};
    if (role && role !== 'all') filter.role = role;
    if (wilaya && wilaya !== 'all') filter.wilaya = wilaya;

    const users = await User.find(filter).select('_id');
    if (!users.length) throw new Error('Aucun utilisateur trouvé');

    const created = [];
    const skipped = [];

    for (const user of users) {
      const existing = await Cotisation.findOne({
        user: user._id,
        year,
        feeType
      });
      if (existing) {
        skipped.push(user._id);
        continue;
      }

      await this.createFee({
        user: user._id,
        viewerId,
        year,
        amount: numericAmount,
        dueDate,
        notes,
        feeType,
        penaltyConfig
      });

      created.push(user._id);
    }

    return {
      message: "Création en masse terminée",
      created: created.length,
      skipped: skipped.length,
      total: users.length
    };
  }

  // =============================
  // 🧨 DELETE ALL (cleanup)
  // =============================
async deleteAllFees() {
  // 1. Delete all payments
  await Payment.deleteMany({});
  
  // 2. Delete all credit transactions
  await CreditTransaction.deleteMany({});
  
  // 3. Delete all cotisations
  const feesDeleted = await Cotisation.deleteMany({});
  
  // 4. Reset each user's fees array and credit to 0
  await User.updateMany({}, { $set: { fees: [], credit: 0 } });
  
  return {
    message: "Nettoyage complet effectué",
    paymentsDeleted: 0, // optional, you could count if needed
    creditTransactionsDeleted: 0, // optional
    feesDeleted: feesDeleted.deletedCount,
    usersUpdated: 0
  };
}

  // =============================
  // 📊 STATS (simplified)
  // =============================
  async getStats() {
    const globalStats = await Cotisation.aggregate([
      { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]);
    return globalStats[0] || { totalAmount: 0, count: 0 };
  }

  // In FeeService.js (or wherever your fee logic lives)

async applyVersement(userId, amount, paymentMethod, notes = '') {
  if (amount <= 0) throw new Error('Le montant doit être positif');

  const user = await User.findById(userId);
  if (!user) throw new Error('Utilisateur non trouvé');

  let remainingAmount = amount;
  let feesPaid = [];

  // 1. Get all unpaid fees (not cancelled, not fully paid)
  const unpaidFees = await Cotisation.find({
    user: userId,
    cancelled: false,
    // Exclude fully paid ones by checking computed status later
  }).sort({ dueDate: 1 }); // oldest due date first

  for (const fee of unpaidFees) {
    if (remainingAmount <= 0) break;

    // Get current state (including payments already made)
    const state = await this.computeFeeState(fee._id);
    if (state.status === 'paid' || state.status === 'cancelled') continue;

    const due = state.totalDue;
    const alreadyPaid = state.totalPaid;
    const remainingForFee = due - alreadyPaid;

    if (remainingForFee <= 0) continue;

    // Determine how much to pay toward this fee
    const payAmount = Math.min(remainingAmount, remainingForFee);

    // Create a payment record
    const payment = new Payment({
      user: userId,
      cotisation: fee._id,
      amount: payAmount,
      type: paymentMethod,
      date: new Date(),
      notes: notes || `Paiement automatique par versement`,
      fromCredit: false, // this is new cash, not from credit
    });
    await payment.save();

    feesPaid.push({
      feeId: fee._id,
      year: fee.year,
      amountPaid: payAmount,
      remainingAfter: remainingForFee - payAmount
    });

    remainingAmount -= payAmount;
  }

  // 2. Any leftover amount becomes credit
  let creditAdded = 0;
  if (remainingAmount > 0) {
    user.credit += remainingAmount;
    await user.save();
    creditAdded = remainingAmount;
  }

  // 3. Log the versement transaction (optional)
    await CreditTransaction.create({
      user: userId,
      amount: amount, // total deposit
      type: 'deposit',
      paymentMethod,
      notes: `Versement de ${amount} DA. Payé ${amount - creditAdded} DA en frais, crédit restant ${creditAdded} DA.`,
      date: new Date()
    });
  

  return {
    totalDeposited: amount,
    usedForFees: amount - creditAdded,
    creditAdded,
    feesPaid,
    newCreditBalance: user.credit
  };
}
}

module.exports = new FeeService();