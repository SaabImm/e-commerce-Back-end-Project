const PermissionSchema = require('../Models/PermissionsModel');
const User = require('../Models/UsersModels');
const File = require('../Models/FilesModels')
const Cotisation = require('../Models/FeesModel')
const Payment = require('../Models/PayementModel')


class FeeService {
    async updateCredit(targetId, amount) {
    const updatedUser = await User.findById(targetId);
    updatedUser.credit += amount;
    return updatedUser.save();
  }

  async createFee(targetId, viewerId, payload) {
    const newCotisation = new Cotisation({
      ...payload,
      createdBy: viewerId
    });
    await newCotisation.save();
    const updatedUser = await User.findByIdAndUpdate(
      targetId,
      { $push: { fees: newCotisation._id } },
      { new: true }
    ).populate("fees");

    await updatedUser.save();
    return newCotisation;
  }

  /**
   * Traite un paiement sur une cotisation unique.
   * Crée un document Payment et met à jour la cotisation.
   * @param {Object} cotisation - Le document cotisation (mongoose)
   * @param {Object} paymentData - { paidAmount, paymentDate, paymentMethod, creditUsed, notes }
   * @param {ObjectId} viewerId - L'utilisateur qui effectue l'opération
   * @returns {Object} { cotisation, excess, payment }
   */
  async payCotisation(cotisation, paymentData, viewerId) {
    const { paidAmount, paymentDate, paymentMethod, creditUsed = 0, notes } = paymentData;
    const totalDue = cotisation.amount + (cotisation.penalty || 0);
    const alreadyPaid = cotisation.paidAmount || 0;

    const effectivePayment = paidAmount + creditUsed;
    let newTotalPaid = alreadyPaid + effectivePayment;
    let excess = 0;

    if (newTotalPaid > totalDue) {
      excess = newTotalPaid - totalDue;
      newTotalPaid = totalDue;
    }

    // Mise à jour de la cotisation
    cotisation.paidAmount = newTotalPaid;
    cotisation.paymentDate = paymentDate || new Date();
    cotisation.paymentMethod = paymentMethod || cotisation.paymentMethod;
    cotisation.status =
      newTotalPaid >= totalDue ? 'paid' :
      newTotalPaid > 0 ? 'partial' : 'pending';

    // Création du document Payment
    const payment = new Payment({
      user: cotisation.user._id,
      cotisation: cotisation._id,
      amount: effectivePayment,
      type: paymentMethod,
      date: paymentDate || new Date(),
      notes,
      fromCredit: creditUsed > 0
    });
    await payment.save();

    return { cotisation, excess, payment };
  }

  /**
   * Applique un montant de crédit aux cotisations impayées.
   * Crée un Payment pour chaque allocation.
   * @param {string} userId - ID de l'utilisateur
   * @param {number} amount - Montant à répartir
   * @param {ObjectId} viewerId - L'utilisateur effectuant l'opération
   * @returns {Promise<number>} Montant effectivement utilisé
   */
  async applyCreditToUnpaidFees(userId, amount, viewerId) {
    if (amount <= 0) return 0;

    const unpaidFees = await Cotisation.find({
      user: userId,
      status: { $in: ['pending', 'partial', 'overdue'] }
    }).sort({ dueDate: 1 });

    let remaining = amount;
    for (const fee of unpaidFees) {
      if (remaining <= 0) break;

      const totalDue = fee.amount + (fee.penalty || 0);
      const alreadyPaid = fee.paidAmount || 0;
      const remainingDue = totalDue - alreadyPaid;

      if (remainingDue <= 0) continue;

      const applyAmount = Math.min(remaining, remainingDue);
      
      // Utiliser payCotisation avec creditOnly (paidAmount = 0)
      const { cotisation: updatedFee } = await this.payCotisation(
        fee,
        {
          paidAmount: 0,
          paymentDate: new Date(),
          paymentMethod: 'credit',
          creditUsed: applyAmount,
          notes: 'Allocation automatique du crédit'
        },
        viewerId
      );
      await updatedFee.save();
      remaining -= applyAmount;
    }
    return amount - remaining;
  }
}
module.exports = new FeeService();