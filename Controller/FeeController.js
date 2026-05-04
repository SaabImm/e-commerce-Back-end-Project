const FeeService = require('../Services/FeeService');
const PermissionService = require('../Services/PermissionService');

const handleError = (res, error) => {
  console.error(error);
  res.status(500).json({ message: error.message });
};

// Helper to get target user ID for a cotisation
const getCotisationUserId = async (cotisationId) => {
  const cotisation = await FeeService.getFeeById(cotisationId);
  return cotisation.user._id || cotisation.user;
};

// Helper to convert flattened keys (e.g. 'penaltyConfig.type') into a nested object
function unflattenObject(obj) {
  const result = {};
  for (const key in obj) {
    const parts = key.split('.');
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = obj[key];
  }
  return result;
}

// --------------------------------------------------------------
// Cotisation endpoints with permission checks
// --------------------------------------------------------------
exports.getCotisationById = async (req, res) => {
  try {
    const { id } = req.params;
    const fee = await FeeService.getFeeById(id);
    const canRead = await PermissionService.canPerform(
      req.user._id,
      fee.user._id || fee.user,
      'read',
      'Fee'
    );
    if (!canRead) return res.status(403).json({ message: "Accès non autorisé" });
    res.json({ cotisation: fee });
  } catch (error) {
    handleError(res, error);
  }
};

exports.getCotisations = async (req, res) => {
  try {
    // For listing all fees, check read permission with null target (global)
    const canReadAll = await PermissionService.canPerform(
      req.user._id,
      null,
      'read',
      'Fee'
    );
    if (!canReadAll) return res.status(403).json({ message: "Accès non autorisé" });
    const fees = await FeeService.getAllFees();
    res.json({ cotisations: fees });
  } catch (error) {
    handleError(res, error);
  }
};

exports.getUserCotisations = async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const canRead = await PermissionService.canPerform(
      req.user._id,
      targetUserId,
      'read',
      'Fee'
    );
    if (!canRead) return res.status(403).json({ message: "Accès non autorisé" });
    const data = await FeeService.getUserFees(targetUserId);
    res.json({ cotisations: data });
  } catch (error) {
    handleError(res, error);
  }
};

exports.createCotisation = async (req, res) => {
  try {
    const { user: targetUserId } = req.body;
    const canCreate = await PermissionService.canPerform(
      req.user._id,
      targetUserId,
      'create',
      'Fee'
    );
    if (!canCreate) return res.status(403).json({ message: "Vous n'avez pas le droit de créer une cotisation" });
    const fee = await FeeService.createFee({ ...req.body, viewerId: req.user._id });
    res.status(201).json(fee);
  } catch (error) {
    handleError(res, error);
  }
};

exports.updateCotisation = async (req, res) => {
  try {
    const cotisationId = req.params.id;
    const targetUserId = await getCotisationUserId(cotisationId);
    
    // 1. Check operation permission (e.g., 'update')
    const canUpdate = await PermissionService.canPerform(
      req.user._id,
      targetUserId,
      'update',
      'Fee'
    );
    if (!canUpdate) {
      return res.status(403).json({ message: "Vous n'avez pas le droit de modifier cette cotisation" });
    }

    // 2. Get editable fields for this user on this model
    const editableFieldsResult = await PermissionService.getEditableFields(
      req.user._id,
      targetUserId,
      'Fee'
    );
    const allowedFields = editableFieldsResult.fields;

    // 3. Unflatten the request body (if needed)
    const updates = unflattenObject(req.body);

    // 4. Filter only allowed fields
    const filteredUpdates = {};
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        filteredUpdates[key] = updates[key];
      } else {
        console.warn(`Blocked attempt to update field "${key}" by user ${req.user._id}`);
      }
    }

    // 5. Update the cotisation
    const fee = await FeeService.updateFee({ feeId: cotisationId, updates: filteredUpdates });
    res.json(fee);
  } catch (error) {
    handleError(res, error);
  }
};

exports.payCotisation = async (req, res) => {
  try {
    const cotisationId = req.params.id;
    const targetUserId = await getCotisationUserId(cotisationId);
    const canPay = await PermissionService.canPerform(
      req.user._id,
      targetUserId,
      'update',
      'Fee'
    );
    if (!canPay) return res.status(403).json({ message: "Vous n'avez pas le droit d'effectuer un paiement" });
    const result = await FeeService.payCotisation({ feeId: cotisationId, ...req.body, viewerId: req.user._id });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

exports.cancelCotisation = async (req, res) => {
  try {
    const cotisationId = req.params.id;

    const targetUserId = await getCotisationUserId(cotisationId);
    const canCancel = await PermissionService.canPerform(
      req.user._id,
      targetUserId,
      'update',
      'Fee'
    );
    if (!canCancel) return res.status(403).json({ message: "Vous n'avez pas le droit d'annuler cette cotisation" });
    const result = await FeeService.cancelFee(cotisationId, req.user._id);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

exports.reactivateCotisation = async (req, res) => {
  try {
    const result = await FeeService.reactivateFee(req.params.id);
        const cotisationId = req.params.id;
    const targetUserId = await getCotisationUserId(cotisationId);
        const canReactivate = await PermissionService.canPerform(
      req.user._id,
      targetUserId,
      'update',
      'Fee'
    );
    if (!canReactivate) return res.status(403).json({ message: "Vous n'avez pas le droit d'annuler cette cotisation" });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

exports.deleteCotisation = async (req, res) => {
  try {
    const cotisationId = req.params.id;
    const targetUserId = await getCotisationUserId(cotisationId);
    const canDelete = await PermissionService.canPerform(
      req.user._id,
      targetUserId,
      'delete',
      'Fee'
    );
    if (!canDelete) return res.status(403).json({ message: "Vous n'avez pas le droit de supprimer cette cotisation" });
    await FeeService.deleteFee(cotisationId);
    res.json({ message: "Cotisation supprimée" });
  } catch (error) {
    handleError(res, error);
  }
};

exports.bulkCreateCotisations = async (req, res) => {
  try {
    // Bulk create is a global operation – check create with null target
    const canBulkCreate = await PermissionService.canPerform(
      req.user._id,
      null,
      'create',
      'Fee'
    );
    if (!canBulkCreate) return res.status(403).json({ message: "Vous n'avez pas le droit de créer des cotisations en masse" });
    const result = await FeeService.bulkCreateFees({ ...req.body, viewerId: req.user._id });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
//cleanup route
exports.deleteAllCotisations = async (req, res) => {
  try {
    const canDeleteAll = await PermissionService.canPerform(
      req.user._id,
      null,
      'delete',
      'Fee'
    );
    if (!canDeleteAll) return res.status(403).json({ message: "Accès non autorisé" });
    const result = await FeeService.deleteAllFees();
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

exports.getStats = async (req, res) => {
  try {
    const canViewStats = await PermissionService.canPerform(
      req.user._id,
      null,
      'read',
      'Fee'
    );
    if (!canViewStats) return res.status(403).json({ message: "Accès non autorisé" });
    const stats = await FeeService.getStats();
    res.json(stats);
  } catch (error) {
    handleError(res, error);
  }
};

exports.versement = async (req, res) => {
  try {
    const { userId, amount, paymentMethod, notes } = req.body;
    const id = req.user._id || req.user.id
    const canVersement = await PermissionService.canPerform(
      id,
      userId,
      'create',
      'Payement'
    );
    if (!canVersement) return res.status(403).json({ message: "Vous n'avez pas le droit d'effectuer un versement" });
    if (amount === 0) throw new Error('Le montant doit être différent de zéro');
    let result;
    if (amount > 0) {
      result = await FeeService.applyVersement(userId, amount, paymentMethod, notes, id);
    } else {
      result = await FeeService.applyRepayment(userId, amount, notes, id);
    }
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// --------------------------------------------------------------
// FeeDefinition endpoints (global, targetId = null)
// --------------------------------------------------------------
exports.getAllDefinitions = async (req, res) => {
  try {
    const canRead = await PermissionService.canPerform(
      req.user._id,
      null,
      'read',
      'FeeDefinition'
    );
    if (!canRead) return res.status(403).json({ message: "Accès non autorisé" });
    const definitions = await FeeService.getAllFeeDefinitions();
    res.json(definitions);
  } catch (error) {
    handleError(res, error);

  }
};

exports.createDefinition = async (req, res) => {
  try {
    const canCreate = await PermissionService.canPerform(
      req.user._id,
      null,
      'create',
      'FeeDefinition'
    );
    if (!canCreate) return res.status(403).json({ message: "Vous n'avez pas le droit de créer une définition" });
    const def = await FeeService.createFeeDefinition(req.body);
    res.status(201).json(def);
  } catch (error) {
    handleError(res, error);
  }
};

exports.updateDefinition = async (req, res) => {
  try {
    const canUpdate = await PermissionService.canPerform(
      req.user._id,
      null,
      'update',
      'FeeDefinition'
    );
    if (!canUpdate) return res.status(403).json({ message: "Vous n'avez pas le droit de modifier une définition" });
    const { id } = req.params;
    const userId = req.user.id;
    const { propagate } = req.query;
    const updated = await FeeService.updateFeeDefinition(id, userId, req.body, propagate === 'true');
    res.json(updated);
  } catch (error) {
    handleError(res, error);
  }
};

exports.deleteDefinition = async (req, res) => {
  try {
    const canDelete = await PermissionService.canPerform(
      req.user._id,
      null,
      'delete',
      'FeeDefinition'
    );
    if (!canDelete) return res.status(403).json({ message: "Vous n'avez pas le droit de supprimer une définition" });
    await FeeService.deleteFeeDefinition(req.params.id);
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
};