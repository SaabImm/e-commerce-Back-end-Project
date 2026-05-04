// services/FeeService.js
const Cotisation = require('../Models/FeesModel');
const Payment = require('../Models/PayementModel');
const User = require('../Models/UsersModels');
const FeeDefinition = require('../Models/FeeDefinition');
const CreditTransaction = require('../Models/CreditTransactionsModel');
const { applyWithChangelog } = require('../Helpers/Utils/updateChangeLog');

class FeeService {
  // =============================
  // 🧮 Helpers
  // =============================
  monthsBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    let months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
    if (d2.getDate() < d1.getDate()) months--;
    return Math.max(0, months);
  }

  calculatePenalty(amount, dueDate, penaltyConfig, referenceDate) {
    if (!penaltyConfig || penaltyConfig.type === 'none') return 0;
    if (referenceDate <= dueDate) return 0;

    const monthsDiff = this.monthsBetween(dueDate, referenceDate);
    let penalty = 0;

    switch (penaltyConfig.frequency) {
      case 'once':
        if (monthsDiff > 0) {
          penalty = penaltyConfig.type === 'fixed'
            ? penaltyConfig.rate
            : amount * penaltyConfig.rate / 100;
        }
        break;
      case 'monthly':
        if (monthsDiff > 0) {
          if (penaltyConfig.type === 'fixed') {
            penalty = penaltyConfig.rate * monthsDiff;
          } else {
            penalty = amount * (penaltyConfig.rate / 100) * monthsDiff;
          }
        }
        break;
      case 'yearly':
        const yearsDiff = Math.floor(monthsDiff / 12);
        if (yearsDiff > 0) {
          if (penaltyConfig.type === 'fixed') {
            penalty = penaltyConfig.rate * yearsDiff;
          } else {
            penalty = amount * (penaltyConfig.rate / 100) * yearsDiff;
          }
        }
        break;
      case 'semi-annual':
        const semesters = Math.floor(monthsDiff / 6);
        if (semesters > 0) {
          if (penaltyConfig.type === 'fixed') {
            penalty = penaltyConfig.rate * semesters;
          } else {
            penalty = amount * (penaltyConfig.rate / 100) * semesters;
          }
        }
        break;
      default:
        penalty = 0;
    }
    return Math.round(penalty);
  }

  // =============================
  // 🧮 COMPUTE STATE (CORE)
  // =============================
  async computeFeeState(cotisationId) {
    const cotisation = await Cotisation.findById(cotisationId);
    if (!cotisation) throw new Error("Cotisation non trouvée");
    if (cotisation.cancelled) {
      return { totalPaid: 0, totalDue: 0, remaining: 0, status: 'cancelled', lastPaymentDate: null };
    }

    const payments = await Payment.find({ cotisation: cotisationId, reversed: false }).sort({ date: -1 });
    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    let referenceDate;
    if (totalPaid > 0 && payments[0]?.date) {
      referenceDate = new Date(payments[0].date);
    } else {
      referenceDate = new Date();
    }

    const penalty = this.calculatePenalty(
      cotisation.amount,
      cotisation.dueDate,
      cotisation.penaltyConfig,
      referenceDate
    );

    const totalDue = cotisation.amount + penalty;
    const remaining = totalDue - totalPaid;

    let status = 'pending';
    if (remaining <= 0) status = 'paid';
    else if (totalPaid > 0) status = 'partial';
    else if (cotisation.dueDate < new Date()) status = 'overdue';

    const lastPaymentDate = payments.length > 0 ? payments[0].date : null;

    return { totalPaid, totalDue, remaining, status, lastPaymentDate, penalty };
  }

  async attachComputed(cotisation) {
    const computed = await this.computeFeeState(cotisation._id);
    return { ...cotisation.toObject(), computed };
  }

  // =============================
  // 📦 GETTERS
  // =============================
  async getFeeById(feeId) {
    const cotisation = await Cotisation.findById(feeId).populate('user', 'name lastname email');
    if (!cotisation) throw new Error('Cotisation non trouvée');
    return this.attachComputed(cotisation);
  }

  async getAllFees() {
    const cotisations = await Cotisation.find().populate('user', 'name lastname email');
    const withComputed = [];
    for (const c of cotisations) {
      const enriched = await this.attachComputed(c);
      withComputed.push(enriched);
    }
    return withComputed;
  }

  async getAllFeeDefinitions() {
    return await FeeDefinition.find().sort({ year: -1, feeType: 1 });
  }

  async getUserFees(userId) {
    const cotisations = await Cotisation.find({ user: userId });
    return Promise.all(cotisations.map(c => this.attachComputed(c)));
  }

  // =============================
  // ➕ CREATE
  // =============================
  async createFee({ user, viewerId, feeDefinitionId, ...payload }) {
    const cotisation = new Cotisation({
      ...payload,
      user,
      createdBy: viewerId,
      feeDefinition: feeDefinitionId
    });
    await cotisation.save();

    await User.findByIdAndUpdate(user, {
      $push: { fees: cotisation._id }
    });

    const targetUser = await User.findById(user);
    if (targetUser.credit > 0) {
      await this.applyCreditToUnpaidFees(user, targetUser.credit);
    }

    return this.attachComputed(cotisation);
  }

  // =============================
  // ✏️ UPDATE
  // =============================
  async adjustFeeAmount(feeId, oldAmount, newAmount) {
    if (oldAmount === newAmount) return;

    const cotisation = await Cotisation.findById(feeId);
    if (!cotisation) throw new Error('Cotisation non trouvée');
    const state = await this.computeFeeState(feeId);
    const totalPaid = state.totalPaid;
    const userId = cotisation.user;

    if (totalPaid === 0) return; // no payment yet, nothing to adjust

    const diff = newAmount - oldAmount;
    if (diff > 0) {
      // User owes more – try to use credit to pay the extra amount
      const user = await User.findById(userId);
      if (user.credit > 0) {
        const toPay = Math.min(user.credit, diff);
        if (toPay > 0) {
          await this.payCotisation({
            feeId,
            creditUsed: toPay,
            paymentMethod: 'credit',
            notes: `Ajustement automatique : montant cotisation passé de ${oldAmount} à ${newAmount} DA.`,
            skipRedistribution: true
          });
          // remaining diff becomes debt (no action)
        }
      }
    } else if (diff < 0) {
      // User overpaid – refund the excess to credit
      const excess = Math.min(totalPaid, -diff);
      if (excess > 0) {
        await User.findByIdAndUpdate(userId, { $inc: { credit: excess } });
        await CreditTransaction.create({
          user: userId,
          amount: excess,
          type: 'excess_from_fee',
          reference: feeId,
          refModel: 'Cotisation',
          notes: `Remboursement excédent : montant cotisation réduit de ${oldAmount} à ${newAmount} DA.`,
          createdBy: viewerId
        });
        // Use the new credit to pay other unpaid fees
        await this.applyCreditToUnpaidFees(userId, excess);
      }
    }
  }

  async updateFee({ feeId, updates }) {
    const cotisation = await Cotisation.findById(feeId);
    if (!cotisation) throw new Error("Cotisation non trouvée");

    const oldAmount = cotisation.amount;
    const newAmount = updates.amount !== undefined ? updates.amount : oldAmount;

    // Apply updates
    Object.keys(updates).forEach(key => {
      cotisation[key] = updates[key];
    });

    await cotisation.save();

    if (oldAmount !== newAmount) {
      await this.adjustFeeAmount(feeId, oldAmount, newAmount);
    }

    return this.attachComputed(cotisation);
  }

  async updateFeeDefinition(defId, userId, updates, propagateToFees = true) {
    const def = await FeeDefinition.findById(defId);
    if (!def) throw new Error('Définition non trouvée');

    const oldAmount = def.amount;
    const updatedDef = await applyWithChangelog(def, updates, userId);
    const newAmount = updatedDef.amount;

    if (propagateToFees) {
      const fees = await Cotisation.find({ feeDefinition: defId });
      for (const fee of fees) {
        const oldFeeAmount = fee.amount;
        // Update fee fields
        fee.amount = updatedDef.amount;
        fee.dueDate = updatedDef.dueDate;
        fee.penaltyConfig = updatedDef.penaltyConfig;
        fee.notes = updatedDef.notes;
        await fee.save();

        if (oldFeeAmount !== newAmount) {
          await this.adjustFeeAmount(fee._id, oldFeeAmount, newAmount);
        }
      }
    }

    return updatedDef;
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
    notes,
    viewerId,
    skipRedistribution = false
  }) {
    const cotisation = await Cotisation.findById(feeId);
    if (!cotisation) throw new Error("Cotisation non trouvée");
    if (cotisation.cancelled) throw new Error("Impossible de payer une cotisation annulée");

    const userId = cotisation.user;
    if (creditUsed > 0) {
      const user = await User.findById(userId);
      if (user.credit < creditUsed) throw new Error('Crédit insuffisant');
    }

    const payment = new Payment({
      user: userId,
      cotisation: feeId,
      amount: amount + creditUsed,
      type: paymentMethod,
      date: paymentDate || new Date(),
      notes,
      fromCredit: creditUsed > 0,
      createdBy: viewerId
    });
    await payment.save();

    if (creditUsed > 0) {
      await User.findByIdAndUpdate(userId, { $inc: { credit: -creditUsed } });
      await CreditTransaction.create({
        user: userId,
        amount: -creditUsed,
        type: 'used_for_fee',
        reference: feeId,
        refModel: 'Cotisation',
        notes: `Crédit utilisé pour payer : ${cotisation.getTitle()}`,
        createdBy: viewerId
      });
    }

    const { totalPaid, totalDue } = await this.computeFeeState(feeId);
    if (totalPaid > totalDue) {
      const excess = totalPaid - totalDue;
      await User.findByIdAndUpdate(userId, { $inc: { credit: excess } });
      await CreditTransaction.create({
        user: userId,
        amount: excess,
        type: 'excess_from_fee',
        reference: feeId,
        refModel: 'Cotisation',
        notes: `Remboursement excédent pour : ${cotisation.getTitle()}`,
        createdBy: viewerId
      });
      if (!skipRedistribution && excess > 0) {
        await this.applyCreditToUnpaidFees(userId, excess, viewerId);
      }
    }

    return this.attachComputed(cotisation);
  }

  // =============================
  // 🔄 APPLY CREDIT TO UNPAID FEES
  // =============================
  async applyCreditToUnpaidFees(userId, amount,viewerId) {
    if (amount <= 0) return;

    const fees = await Cotisation.find({ user: userId, cancelled: false });
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
          notes: 'Crédit automatique appliqué',
          skipRedistribution: true,
          viewerId   
        });
        remaining -= toUse;
      }
    }
  }

  // =============================
  // ❌ CANCEL
  // =============================
  async cancelFee(feeId, viewerId) {
    const cotisation = await Cotisation.findById(feeId);
    if (!cotisation) throw new Error("Cotisation non trouvée");
    if (cotisation.cancelled) throw new Error("Cotisation déjà annulée");

    const userId = cotisation.user;
    const nonReversedPayments = await Payment.find({ cotisation: feeId, reversed: false });
    const totalPaid = nonReversedPayments.reduce((sum, p) => sum + p.amount, 0);

    await Payment.updateMany({ cotisation: feeId }, { reversed: true });

    cotisation.cancelled = true;
    await cotisation.save();

    if (totalPaid > 0) {
      await CreditTransaction.create({
        user: userId,
        amount: totalPaid,
        type: 'excess_from_fee',
        reference: feeId,
        refModel: 'Cotisation',
        notes: `Remboursement suite à l'annulation de la cotisation ${cotisation.getTitle()}`,
        createdBy: viewerId
      });
      await User.findByIdAndUpdate(userId, { $inc: { credit: totalPaid } });
      await this.applyCreditToUnpaidFees(userId, totalPaid, viewerId);
    }

    return this.attachComputed(cotisation);
  }

  async reactivateFee(feeId) {
    const cotisation = await Cotisation.findById(feeId);
    if (!cotisation) throw new Error('Cotisation non trouvée');
    if (!cotisation.cancelled) throw new Error('La cotisation n\'est pas annulée');

    cotisation.cancelled = false;
    await cotisation.save();

    const user = await User.findById(cotisation.user);
    if (user.credit > 0) {
      await this.applyCreditToUnpaidFees(cotisation.user, user.credit);
    }

    return this.attachComputed(cotisation);
  }

  // =============================
  // 📦 BULK CREATE
  // =============================
  async bulkCreateFees({ role, wilaya, year, amount, dueDate, notes, feeType, penaltyConfig, viewerId }) {
    const definition = await this.createFeeDefinition({
      title: `${feeType} ${year}`,
      year,
      amount,
      dueDate,
      feeType,
      penaltyConfig,
      notes,
      createdBy: viewerId
    });

    const filter = {};
    if (role && role !== 'all') filter.role = role;
    if (wilaya && wilaya !== 'all') filter.wilaya = wilaya;
    const users = await User.find(filter).select('_id startDate');
    if (!users.length) throw new Error('Aucun utilisateur trouvé');

    const created = [];
    const skipped = [];
    const startDateSkipped = [];

    for (const user of users) {
      if (user.startDate) {
        const startYear = user.startDate.getFullYear();
        const feeYear = new Date(dueDate).getFullYear();
        if (startYear > feeYear) {
          startDateSkipped.push(user._id);
          continue;
        }
        if (user.startDate > new Date(dueDate)) {
          startDateSkipped.push(user._id);
          continue;
        }
      }

      const existing = await Cotisation.findOne({ user: user._id, year, feeType });
      if (existing && !existing.cancelled) {
        skipped.push(user._id);
        continue;
      }

      await this.createFee({
        user: user._id,
        viewerId,
        feeDefinitionId: definition._id,
        year,
        amount,
        dueDate,
        feeType,
        penaltyConfig,
        notes
      });
      created.push(user._id);
    }

    return {
      message: "Création en masse terminée",
      definitionId: definition._id,
      created: created.length,
      skipped: skipped.length,
      startDateSkipped: startDateSkipped.length,
      total: users.length
    };
  }

  // =============================
  // 🗑 DELETE
  // =============================
  async deleteFee(feeId) {
    const cotisation = await Cotisation.findById(feeId);
    if (!cotisation) throw new Error("Cotisation non trouvée");
    await Payment.deleteMany({ cotisation: feeId });
    await User.findByIdAndUpdate(cotisation.user, { $pull: { fees: feeId } });
    await cotisation.deleteOne();
    return true;
  }

  async deleteFeeDefinition(defId) {
    const definition = await FeeDefinition.findById(defId);
    if (!definition) throw new Error('Définition non trouvée');

    const cotisations = await Cotisation.find({ feeDefinition: defId });
    for (const fee of cotisations) {
      if (!fee.cancelled) {
        await this.cancelFee(fee._id);
      }
    }

    definition.isActive = false;
    await definition.save();

    return { deletedDefinitionId: defId, cancelledFeesCount: cotisations.length };
  }

  // =============================
  // 🧨 DELETE ALL (cleanup)
  // =============================
  async deleteAllFees() {
    await Payment.deleteMany({});
    await CreditTransaction.deleteMany({});
    const feesDeleted = await Cotisation.deleteMany({});
    const definitionsDeleted = await FeeDefinition.deleteMany({});
    await User.updateMany({}, { $set: { fees: [], credit: 0 } });
    return {
      message: "Nettoyage complet effectué",
      paymentsDeleted: 0,
      creditTransactionsDeleted: 0,
      feesDeleted: feesDeleted.deletedCount,
      definitionsDeleted: definitionsDeleted.deletedCount,
      usersUpdated: 0
    };
  }

  // =============================
  // 📊 STATS
  // =============================
  async getStats() {
    const totalFeesCount = await Cotisation.countDocuments();
    const totalAmountAgg = await Cotisation.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]);
    const totalProjected = totalAmountAgg[0]?.total || 0;

    const totalPaidAgg = await Payment.aggregate([{ $group: { _id: null, total: { $sum: '$amount' } } }]);
    const totalPaid = totalPaidAgg[0]?.total || 0;

    const creditPaidAgg = await Payment.aggregate([{ $match: { fromCredit: true } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const totalPaidByCredit = creditPaidAgg[0]?.total || 0;

    const cashPaidAgg = await Payment.aggregate([{ $match: { fromCredit: false } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const totalPaidByCash = cashPaidAgg[0]?.total || 0;

    const versementsAgg = await CreditTransaction.aggregate([{ $match: { type: { $in: ['deposit', 'versement'] }, amount: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
    const totalVersements = versementsAgg[0]?.total || 0;

    const repaymentsAgg = await CreditTransaction.aggregate([{ $match: { type: 'repayment', amount: { $lt: 0 } } }, { $group: { _id: null, total: { $sum: { $multiply: ['$amount', -1] } } } }]);
    const totalRepayments = repaymentsAgg[0]?.total || 0;

    const netCreditAdded = totalVersements - totalRepayments;

    const fees = await Cotisation.find().select('_id cancelled dueDate');
    let statusCounts = { pending: 0, paid: 0, partial: 0, overdue: 0, cancelled: 0 };
    for (const fee of fees) {
      const state = await this.computeFeeState(fee._id);
      statusCounts[state.status]++;
    }

    return {
      totalFees: totalFeesCount,
      totalProjected,
      totalPaid,
      totalRemaining: totalProjected - totalPaid,
      totalPaidByCredit,
      totalPaidByCash,
      totalVersements,
      totalRepayments,
      netCreditAdded,
      byStatus: statusCounts
    };
  }

  // =============================
  // 💸 VERSEMENT & REPAY
  // =============================
  async applyVersement(userId, amount, paymentMethod, notes = '', viewerId) {
    if (amount <= 0) throw new Error('Le montant doit être positif');
    const user = await User.findById(userId);
    if (!user) throw new Error('Utilisateur non trouvé');

    let remainingAmount = amount;
    let feesPaid = [];

    const unpaidFees = await Cotisation.find({ user: userId, cancelled: false }).sort({ dueDate: 1 });
    for (const fee of unpaidFees) {
      if (remainingAmount <= 0) break;
      const state = await this.computeFeeState(fee._id);
      if (state.status === 'paid' || state.status === 'cancelled') continue;
      const remainingForFee = state.totalDue - state.totalPaid;
      if (remainingForFee <= 0) continue;

      const payAmount = Math.min(remainingAmount, remainingForFee);
      const payment = new Payment({
        user: userId,
        cotisation: fee._id,
        amount: payAmount,
        type: paymentMethod,
        date: new Date(),
        notes: notes || `Paiement automatique par versement`,
        fromCredit: false,
        createdBy: viewerId
      });
      await payment.save();
      feesPaid.push({ feeId: fee._id, year: fee.year, amountPaid: payAmount, remainingAfter: remainingForFee - payAmount });
      remainingAmount -= payAmount;
    }

    let creditAdded = 0;
    if (remainingAmount > 0) {
      user.credit += remainingAmount;
      await user.save();
      creditAdded = remainingAmount;
    }

    await CreditTransaction.create({
      user: userId,
      amount: amount,
      type: 'deposit',
      paymentMethod,
      notes: `Versement de ${amount} DA. Payé ${amount - creditAdded} DA en frais, crédit restant ${creditAdded} DA.`,
      date: new Date(),
      createdBy: viewerId
    });

    return {
      totalDeposited: amount,
      usedForFees: amount - creditAdded,
      creditAdded,
      feesPaid,
      newCreditBalance: user.credit
    };
  }

  async applyRepayment(userId, amount, notes, viewerId) {
    if (amount >= 0) throw new Error('Le montant doit être négatif pour un remboursement');
    const user = await User.findById(userId);
    if (!user) throw new Error('Utilisateur non trouvé');
    if (user.credit + amount < 0) throw new Error('Crédit insuffisant');
    user.credit += amount;
    await user.save();

    const defaultNote = `Retrait de ${Math.abs(amount)} DA du crédit. Nouveau solde : ${user.credit} DA.`;
    await CreditTransaction.create({
      user: userId,
      amount,
      type: 'repayment',
      notes: notes || defaultNote,
      createdBy: viewerId
    });
    return { newCreditBalance: user.credit };
  }

  async createFeeDefinition(data) {
    const def = new FeeDefinition(data);
    await def.save();
    return def;
  }
}

module.exports = new FeeService();