// controllers/CotisationController.js
const Cotisation = require('../Models/FeesModel');
const PermissionService = require('../Services/PermissionService');
const FeeService = require('../Services/FeeService');
const User = require('../Models/UsersModels');
const mongoose = require('mongoose');

exports.getCotisationById = async (req, res) => {
  try {
    const targetId = req.params.id;
    const viewerId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ message: "ID invalide" });
    }

    const cotisation = await Cotisation.findById(targetId).populate('user', 'name lastname email');
    if (!cotisation) {
      return res.status(404).json({ message: "Cotisation non trouvée" });
    }

    const canRead = await PermissionService.canPerform(
      viewerId,
      cotisation.user._id,
      "read",
      "Fee"
    );

    if (!canRead) {
      return res.status(403).json({ message: "Accès non autorisé" });
    }

    res.json({
      message: "Cotisation trouvée",
      cotisation
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Erreur serveur", error: error.message });
  }
};

exports.getCotisations = async (req, res) => {
  try {
    const cotisations = await Cotisation.find().populate('user', 'name lastname email');
    if (!cotisations.length) {
      return res.status(404).json({ message: "Aucune cotisation trouvée" });
    }
    res.json({ cotisations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getUserCotisations = async (req, res) => {
  try {
    const { userId } = req.params;
    const canRead = await PermissionService.canPerform(req.user.id, userId, 'read', 'Fee');
    if (!canRead) return res.status(403).json({ message: 'Non autorisé' });

    const cotisations = await Cotisation.find({ user: userId });
    res.json({ cotisations });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createCotisation = async (req, res) => {
  try {
    const targetId = req.body.user;
    const viewerId = req.user._id;
    const payload = req.body;

    const targetUser = await User.findById(targetId);
    if (!targetUser) {
      return res.status(404).json({ message: "user not found" });
    }

    const canCreate = await PermissionService.canPerform(viewerId, targetId, 'create', 'Fee');
    if (!canCreate) return res.status(403).json({ message: 'Non autorisé' });

    // Use service to create fee (optional, but recommended for consistency)
    const newCotisation = await FeeService.createFee(targetId, viewerId, payload);
    // The createFee already pushes the fee to user and saves

    res.status(201).json(newCotisation);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


exports.updateCotisation = async (req, res) => {
  try {
    const { id } = req.params;
    const viewerId = req.user._id;
    const updates = req.body;

    const cotisation = await Cotisation.findById(id).populate('user');
    if (!cotisation) return res.status(404).json({ message: 'Cotisation non trouvée' });

    const targetId = cotisation.user._id;

    const canUpdate = await PermissionService.canPerform(req.user.id, targetId, 'update', 'Fee');
    if (!canUpdate) return res.status(403).json({ message: 'Non autorisé' });

    const editableFields = await PermissionService.getEditableFields(viewerId, targetId, 'Fee');
    const allowedFields = editableFields.permissions.canUpdate;
    if (allowedFields.length === 0) {
      return res.status(400).json({ message: "Aucun champ modifiable" });
    }

    // Ne pas permettre de modifier les champs de paiement via cette route
    const forbidden = ['paidAmount', 'paymentDate', 'paymentMethod', 'creditUsed'];
    for (let field of forbidden) {
      delete updates[field];
    }

    FeeService.updateCotisationFields(cotisation, updates, allowedFields);
    cotisation.updatedBy = viewerId;
    await cotisation.save();

    res.json({ cotisation });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.payCotisation = async (req, res) => {
  try {
    const { id } = req.params;
    const viewerId = req.user._id;
    const { paidAmount, paymentDate, paymentMethod, creditUsed = 0, notes } = req.body;

    const cotisation = await Cotisation.findById(id).populate('user');
    if (!cotisation) return res.status(404).json({ message: 'Cotisation non trouvée' });

    const targetId = cotisation.user._id;

    const canUpdate = await PermissionService.canPerform(req.user.id, targetId, 'update', 'Fee');
    if (!canUpdate) return res.status(403).json({ message: 'Non autorisé' });

    // Vérifier que paidAmount ou creditUsed est présent
    if (paidAmount === undefined && creditUsed === 0) {
      return res.status(400).json({ message: 'Aucun montant à payer' });
    }

    const paymentData = {
      paidAmount: paidAmount || 0,
      paymentDate,
      paymentMethod,
      creditUsed,
      notes
    };

    const { cotisation: updatedCotisation, excess } = await FeeService.payCotisation(
      cotisation,
      paymentData,
      viewerId
    );

    await updatedCotisation.save();

    // Gestion du crédit
    let netCreditChange = -creditUsed; // le crédit utilisé est déduit
    if (excess > 0) {
      // L'excédent peut être utilisé pour d'autres cotisations
      const used = await FeeService.applyCreditToUnpaidFees(targetId, excess, viewerId);
      netCreditChange += (excess - used); // ce qui reste après avoir payé d'autres cotisations
    }

    if (netCreditChange !== 0) {
      await User.findByIdAndUpdate(targetId, { $inc: { credit: netCreditChange } });
    }

    res.json({ cotisation: updatedCotisation });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.cancelCotisation = async (req, res) => {
  try {
    const { id } = req.params;
    const cotisation = await Cotisation.findById(id).populate('user');
    if (!cotisation) return res.status(404).json({ message: 'Cotisation non trouvée' });

    const ownerId = cotisation.user._id;

    const canUpdate = await PermissionService.canPerform(req.user.id, ownerId, 'update', 'Fee');
    if (!canUpdate) return res.status(403).json({ message: 'Non autorisé' });

    if (cotisation.status === 'cancelled') {
      return res.status(400).json({ message: 'Cotisation déjà annulée' });
    }

    const refundAmount = cotisation.paidAmount || 0;

    // Annuler la cotisation
    cotisation.status = 'cancelled';
    cotisation.updatedBy = req.user.id;
    await cotisation.save();

    // Si un remboursement est dû, on l'utilise pour payer d'autres cotisations
    if (refundAmount > 0) {
      const used = await FeeService.applyCreditToUnpaidFees(ownerId, refundAmount);
      const remaining = refundAmount - used;
      if (remaining > 0) {
        await FeeService.updateCredit(ownerId, remaining);
      }
    }

    res.json({ message: 'Cotisation annulée, crédit réaffecté', cotisation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteCotisation = async (req, res) => {
  try {
    const { id } = req.params;
    const cotisation = await Cotisation.findById(id).populate('user');
    if (!cotisation) return res.status(404).json({ message: 'Cotisation non trouvée' });

    const ownerId = cotisation.user._id;

    // Seul un super_admin peut vraiment supprimer
    const canDelete = await PermissionService.canPerform(req.user.id, ownerId, 'delete', 'Fee');
    if (!canDelete) return res.status(403).json({ message: 'Non autorisé' });

    // Supprimer la référence dans l'utilisateur
    await User.findByIdAndUpdate(ownerId, { $pull: { fees: cotisation._id } });

    // Rembourser le crédit si nécessaire (optionnel, selon votre politique)
    if (cotisation.paidAmount > 0) {
      await FeeService.updateCredit(ownerId, cotisation.paidAmount);
    }

    await cotisation.deleteOne();
    res.json({ message: 'Cotisation supprimée définitivement' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteAllCotisations = async (req, res) => {
  try {


    // Vérifier que l'utilisateur est super_admin (ou admin avec droit spécial)
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    // Récupérer toutes les cotisations
    const cotisations = await Cotisation.find({});

    // Parcourir et rembourser les crédits si nécessaire
    for (const cot of cotisations) {
      if (cot.paidAmount > 0) {
        await FeeService.updateCredit(cot.user.toString(), cot.paidAmount);
      }
      // Supprimer la référence dans l'utilisateur (optionnel mais cohérent)
      await User.findByIdAndUpdate(cot.user, { $pull: { fees: cot._id } });
    }

    // Supprimer toutes les cotisations
    const result = await Cotisation.deleteMany({});

    res.json({
      message: 'Toutes les cotisations ont été supprimées',
      deletedCount: result.deletedCount,
      refundedCount: cotisations.filter(c => c.paidAmount > 0).length
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const globalStats = await Cotisation.aggregate([
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          totalPaid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } },
          totalPending: { $sum: { $cond: [{ $in: ['$status', ['pending', 'overdue']] }, '$amount', 0] } },
          countAll: { $sum: 1 },
          countPaid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
          countPending: { $sum: { $cond: [{ $in: ['$status', ['pending', 'overdue']] }, 1, 0] } },
          countOverdue: { $sum: { $cond: [{ $eq: ['$status', 'overdue'] }, 1, 0] } },
          countCancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } }
        }
      }
    ]);

    const byYear = await Cotisation.aggregate([
      {
        $group: {
          _id: '$year',
          total: { $sum: '$amount' },
          paid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    const byMethod = await Cotisation.aggregate([
      { $match: { paymentMethod: { $ne: null } } },
      {
        $group: {
          _id: '$paymentMethod',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const global = globalStats[0] || {
      totalAmount: 0,
      totalPaid: 0,
      totalPending: 0,
      countAll: 0,
      countPaid: 0,
      countPending: 0,
      countOverdue: 0,
      countCancelled: 0
    };

    const paymentRate = global.totalAmount > 0
      ? (global.totalPaid / global.totalAmount * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      global: { ...global, paymentRate },
      byYear,
      byMethod
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};


exports.bulkCreateCotisations = async (req, res) => {
  try {
    const viewerId = req.user.id;
    const canCreate = await PermissionService.canPerform(viewerId, viewerId, "create", "Fee");
    if (!canCreate) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const { role, wilaya, year, amount, dueDate, notes, penaltyConfig } = req.body;

    if (!year || !amount || !dueDate) {
      return res.status(400).json({ message: 'Année, montant et date d’échéance sont requis' });
    }

    const filter = {};
    if (role && role !== 'all') filter.role = role;
    if (wilaya && wilaya !== 'all') filter.wilaya = wilaya;

    const users = await User.find(filter).select('_id credit');
    if (users.length === 0) {
      return res.status(404).json({ message: 'Aucun utilisateur trouvé avec ces critères' });
    }

    const created = [];
    const skipped = [];

    for (const user of users) {
      // Vérifier si une cotisation pour cette année existe déjà
      const existing = await Cotisation.findOne({ user: user._id, year });
      if (existing) {
        skipped.push(user._id);
        continue;
      }

      // Créer la cotisation sans paiement initial
      const payload = {
        user: user._id,
        year,
        amount,
        dueDate: new Date(dueDate),
        penaltyConfig,
        notes: notes || '',
        paidAmount: 0,
        status: 'pending',
        paymentDate: null,
        paymentMethod: null,
      };
      const newCotisation = await FeeService.createFee(user._id, viewerId, payload);

      // Si l'utilisateur a du crédit, on l'applique maintenant
      let creditUsed = 0;
      let excess = 0;

      if (user.credit > 0) {
        creditUsed = Math.min(user.credit, amount);
        if (creditUsed > 0) {
          // Appliquer le paiement par crédit
          const paymentData = {
            paidAmount: 0,
            paymentDate: new Date(),
            paymentMethod: 'credit',
            creditUsed,
            notes: 'Paiement automatique par crédit lors de la création en masse',
          };
          const result = await FeeService.payCotisation(newCotisation, paymentData, viewerId);
          excess = result.excess;

          // Sauvegarder les modifications de la cotisation (payCotisation a modifié l'objet en mémoire)
          await newCotisation.save();

          // Mettre à jour le crédit de l'utilisateur : déduire le crédit utilisé et ajouter l'excédent
          let netCreditChange = -creditUsed + excess;
          if (netCreditChange !== 0) {
            await FeeService.updateCredit(user._id, netCreditChange);
          }
        }
      }

      // Si aucun crédit utilisé ou après paiement, on s'assure que la cotisation est bien liée à l'utilisateur
      // (createFee l'a déjà fait, mais on pourrait vouloir mettre à jour le crédit si aucun crédit utilisé)
      if (creditUsed === 0) {
        // Pas de crédit utilisé, donc on n'a pas modifié le crédit
        // On peut quand même s'assurer que la cotisation est liée (déjà fait par createFee)
      }

      created.push(user._id);
    }

    res.status(201).json({
      message: 'Création en masse terminée',
      count: created.length,
      skipped: skipped.length,
      total: users.length,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};