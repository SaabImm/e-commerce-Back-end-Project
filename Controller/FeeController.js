// controllers/CotisationController.js
const Cotisation = require('../Models/FeesModel');
const PermissionService = require('../Services/PermissionService');
const User = require('../Models/UsersModels')
const mongoose = require('mongoose');


exports.getCotisationById = async (req, res) => {
  try {
    const targetId = req.params.id;
    const viewerId = req.user.id;
    
    // Validate ID
    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ message: "ID invalide" });
    }

    // Find cotisation and populate the user (optional)
    const cotisation = await Cotisation.findById(targetId).populate('user', 'name lastname email');
    if (!cotisation) {
      return res.status(404).json({ message: "Cotisation non trouvée" });
    }

    // Check read permission on the cotisation itself (model 'Cotisation')
    const canRead = await PermissionService.canPerform(
      viewerId,
      cotisation.user._id,          
      "read",
      "Fee",

    );

    if (!canRead) {
      return res.status(403).json({ message: "Accès non autorisé" });
    }

    // Return the cotisation
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
      return res.status(404).json({ message: "Aucun utilisateur trouvé" });
    };


    res.json({
      cotisations
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getUserCotisations = async (req, res) => {
  try {
    const { userId } = req.params;
    // Vérifier que le viewer a le droit de voir les cotisations de cet utilisateur
    const canRead = await PermissionService.canPerform(req.user.id, userId, 'read', 'Fee');
    if (!canRead) return res.status(403).json({ message: 'Non autorisé' });

    const cotisations = await Cotisation.find({ user: userId });
    res.json({cotisations});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.createCotisation = async (req, res) => {
  try {
    // Vérifier la permission de créer
    const targetId= req.body.user
    const viewerId= req.user._id

    const targetUser = await User.findById(targetId)

    if (!targetUser){
      res.status(404).json({message: "user not found"})
    }
    const canCreate = await PermissionService.canPerform(viewerId, targetId, 'create', 'Fee');
    if (!canCreate) return res.status(403).json({ message: 'Non autorisé' });
    
    const newCotisation = new Cotisation(req.body);
    newCotisation.createdBy=viewerId
    const updatedUser = await User.findByIdAndUpdate(
        targetId,
        { $push: { fees: newCotisation._id } },
        { new: true }
      ).populate("fees");
    await updatedUser.save();
    await newCotisation.save();
    res.status(201).json(newCotisation);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.updateCotisation = async (req, res) => {
  try {
    const { id } = req.params;
    const viewerId= req.user._id
    
    const updates = req.body
    const cotisation = await Cotisation.findById(id);
    const targetId = cotisation.user
    if (!cotisation) return res.status(404).json({ message: 'Cotisation non trouvée' });

    // Vérifier la permission de mise à jour sur cet utilisateur (car la cotisation appartient à un user)
    const canUpdate = await PermissionService.canPerform(req.user.id, cotisation.user, 'update', 'Fee');
    if (!canUpdate) return res.status(403).json({ message: 'Non autorisé' });

    //fields that are editable by this user
    const editableFields = await PermissionService.getEditableFields(viewerId, targetId, 'Fee');
    const allowedFields = editableFields.permissions.canUpdate;

    
    if (allowedFields.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

        allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        cotisation[field] = updates[field];
      }
    });

    if (updates.status!== undefined && updates.status=== "paid" ){
      cotisation.paymentDate= new Date()
    }

    Object.assign(cotisation, updates);
    cotisation.updatedBy = req.user.id
    await cotisation.save();
    res.json(cotisation);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteCotisation = async (req, res) => {
  try {
    const { id } = req.params;
    const cotisation = await Cotisation.findById(id);
    if (!cotisation) return res.status(404).json({ message: 'Cotisation non trouvée' });

    const canDelete = await PermissionService.canPerform(req.user.id, cotisation.user, 'delete', 'Fee');
    if (!canDelete) return res.status(403).json({ message: 'Non autorisé' });

    await cotisation.deleteOne();
    res.json({ message: 'Cotisation supprimée' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    // Vérifier que l'utilisateur a le droit de voir les stats (admin ou super_admin)
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    // Agrégations pour les statistiques globales
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

    // Répartition par année
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

    // Répartition par mode de paiement
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

    // Formatage du résultat global
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

    // Calcul du taux de paiement (en pourcentage)
    const paymentRate = global.totalAmount > 0
      ? (global.totalPaid / global.totalAmount * 100).toFixed(1)
      : 0;
      
    res.json({
      success: true,
      global: {
        ...global,
        paymentRate
      },
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
    // Only admins/super_admins can perform this
    const viewerId= req.user.id
    const canCreate = await PermissionService.canPerform(viewerId, viewerId, "create", "Fee")
    console.log(canCreate)
    if (!canCreate) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }

    const { role, wilaya, year, amount, dueDate, notes } = req.body;

    // Validate required fields
    if (!year || !amount || !dueDate) {
      return res.status(400).json({ message: 'Année, montant et date d’échéance sont requis' });
    }

    // Build query filter for users
    const filter = {};
    if (role && role !== 'all') filter.role = role;
    if (wilaya && wilaya !== 'all') filter.wilaya = wilaya;

    // Find all matching users
    const users = await User.find(filter).select('_id');
    if (users.length === 0) {
      return res.status(404).json({ message: 'Aucun utilisateur trouvé avec ces critères' });
    }

    // For each user, check if a cotisation for this year already exists
    const created = [];
    const skipped = [];

    for (const user of users) {
      const existing = await Cotisation.findOne({ user: user._id, year });
      if (existing) {
        skipped.push(user._id);
      } else {
        const newCotisation = new Cotisation({
          user: user._id,
          year,
          amount,
          dueDate: new Date(dueDate),
          status: 'pending',
          notes: notes || '',
          createdBy: req.user.id
        });
        await newCotisation.save();
        created.push(user._id);
        const updatedUser = await User.findByIdAndUpdate(
        user._id,
        { $push: { fees: newCotisation._id } },
        { new: true }
      ).populate("fees");
    await updatedUser.save();
      }
    }

    res.status(201).json({
      message: 'Création en masse terminée',
      count: created.length,
      skipped: skipped.length,
      total: users.length
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur serveur', error: error.message });
  }
};
