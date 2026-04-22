const ValidationService = require('../Services/ValidationService');
const ValidationSchema = require('../Models/ValidationSchemaModel');
const ValidationRequest = require('../Models/ValidationRequestModel');
const PermissionService = require('../Services/PermissionService');

// ===================== SCHEMA CONTROLLERS =====================

exports.createValidationSchema = async (req, res) => {
  try {
    const { targetType, name, description, steps, globalTimeout } = req.body;
    const createdBy = req.user._id;

    if (!targetType || !name || !steps) {
      return res.status(400).json({ error: 'targetType, name, and steps are required' });
    }

    const schema = await ValidationService.createValidationSchema(
      { targetType, name, description, steps, globalTimeout },
      createdBy
    );
    res.status(201).json(schema);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateValidationSchema = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.user._id;
    const updated = await ValidationService.updateValidationSchema(id, updates, userId);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllValidationSchemas = async (req, res) => {
  try {
    const { targetType } = req.query;
    const schemas = await ValidationService.getAllActiveSchemas(targetType);
    res.json(schemas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getValidationSchemaById = async (req, res) => {
  try {
    const schema = await ValidationSchema.findById(req.params.id);
    if (!schema) return res.status(404).json({ error: 'Schema not found' });
    res.json(schema);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.rollbackValidationSchema = async (req, res) => {
  try {
    const { id } = req.params; // can be any version ID, we'll extract base _id in service
    const userId = req.user._id;
    const { targetVersion, reason, newStatus = 'active', deactivateStatus = 'archived' } = req.query;

    const options = {
      targetVersion: targetVersion ? parseInt(targetVersion) : null,
      reason: reason || `Manual rollback to version ${targetVersion || 'previous'}`,
      newStatus,
      deactivateStatus
    };

    const rolledBack = await ValidationService.rollbackValidationSchema(id, userId, options);
    res.json({
      success: true,
      message: `Rolled back to version ${rolledBack.version}`,
      schema: rolledBack
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

exports.reactivateValidationSchema = async (req, res) => {
  try {
    const { id } = req.params; // versionId (the specific version document ID)
    const userId = req.user._id;
    const { newStatus = 'active', deactivateStatus = 'archived', reason } = req.query;

    const options = {
      newStatus,
      deactivateStatus,
      reason: reason || `Reactivated by user ${userId}`
    };

    const reactivated = await ValidationService.reactivateValidationSchema(id, userId, options);
    res.json({
      success: true,
      message: `Validation schema version ${reactivated.version} reactivated`,
      schema: reactivated
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// ===================== REQUEST CONTROLLERS =====================

exports.createValidationRequest = async (req, res) => {
  try {
    const { targetId, targetType, schemaName } = req.body;
    const createdBy = req.user._id;

    if (!targetId || !targetType || !schemaName) {
      return res.status(400).json({ error: 'targetId, targetType, and schemaName are required' });
    }

    const schema = await ValidationSchema.findOne({
      targetType,
      name: schemaName,
      isActive: true
    }).sort({ version: -1 });

    if (!schema) {
      return res.status(404).json({ error: `No active validation schema found for name "${schemaName}" and targetType "${targetType}"` });
    }

    const request = await ValidationService.createValidationRequest(
      targetId,
      targetType,
      schema._id,
      createdBy
    );
    res.status(201).json(request);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.approveStep = async (req, res) => {
  try {
    const { requestId, stepOrder } = req.params;
    const { comments } = req.body;
    const userId = req.user._id;

    const updated = await ValidationService.approveStep(requestId, parseFloat(stepOrder), userId, comments);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.rejectStep = async (req, res) => {
  try {
    const { requestId, stepOrder } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;

    const updated = await ValidationService.rejectStep(requestId, parseFloat(stepOrder), userId, reason);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getValidationRequest = async (req, res) => {
  try {
    const request = await ValidationRequest.findById(req.params.id)
      .populate('validationSchemaId')
      .populate('createdBy', 'name lastname email');
    if (!request) return res.status(404).json({ error: 'Request not found' });

    // Permission check: only creator, admins, or approvers can view
    const isCreator = request.createdBy && request.createdBy._id.toString() === req.user._id.toString();
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    if (!isCreator && !isAdmin) {
      return res.status(403).json({ error: 'Unauthorised' });
    }
    res.json(request);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getUserValidationRequests = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id;
    const requests = await ValidationRequest.find({ createdBy: userId })
      .populate('validationSchemaId')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.cancelValidationRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;
    const cancelled = await ValidationService.cancelValidationRequest(id, userId, reason);
    res.json({ success: true, request: cancelled });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.skipStep = async (req, res) => {
  try {
    const { requestId, stepOrder } = req.params;
    const { reason } = req.body;
    const userId = req.user._id;
    const updated = await ValidationService.skipStep(requestId, parseFloat(stepOrder), userId, reason);
    res.json({ success: true, request: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.forceExpirationCheck = async (req, res) => {
  try {
    await ValidationService.expireStaleRequests();
    res.json({ message: 'Expiration check completed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};