const Payment = require('../Models/PayementModel');
const Cotisation = require('../Models/FeesModel');
const User = require('../Models/UsersModels');
const PermissionService = require('../Services/PermissionService');
const FeeService = require('../Services/FeeService');

exports.createPayment = async (req, res) => {
  try {
    const { cotisationId, amount, type, date, notes } = req.body;
    const viewerId = req.user.id;

    // Vérifier que la cotisation existe
    const cotisation = await Cotisation.findById(cotisationId).populate('user');
    if (!cotisation) return res.status(404).json({ message: 'Cotisation non trouvée' });

    const targetId = cotisation.user._id;

    // Vérifier la permission de mise à jour (car on modifie la cotisation)
    const canUpdate = await PermissionService.canPerform(viewerId, targetId, 'update', 'Fee');
    if (!canUpdate) return res.status(403).json({ message: 'Non autorisé' });

    // Vérifier que le montant est positif
    if (amount <= 0) return res.status(400).json({ message: 'Montant invalide' });

    // Appeler le service de paiement
    const { cotisation: updatedCotisation, excess } = await FeeService.payCotisation(
      cotisation,
      {
        paidAmount: amount,
        paymentDate: date || new Date(),
        paymentMethod: type,
        creditUsed: 0,
        notes
      },
      viewerId
    );

    await updatedCotisation.save();

    // Gérer l'excédent éventuel (crédit utilisateur)
    if (excess > 0) {
      await FeeService.updateCredit(targetId, excess);
    }

    res.json({
      message: 'Paiement enregistré',
      cotisation: updatedCotisation,
      excess
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getPaymentsForUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const viewerId = req.user.id;

    // Vérifier la permission de lecture
    const canRead = await PermissionService.canPerform(viewerId, userId, 'read', 'Payement');
    if (!canRead) return res.status(403).json({ message: 'Non autorisé' });
    const payments = await Payment.find({ user: userId,  type: { $nin: [ 'other'] }})
      .populate('cotisation')
      .sort({ date: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};