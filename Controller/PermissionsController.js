// Controllers/PermissionsController.js
const PermissionService = require('../Services/PermissionService');
const PermissionSchema = require('../Models/PermissionsModel');

class PermissionController {
  // GET /api/permissions/user/:userId
  async getUserPermissions(req, res) {
    try {
      const { userId } = req.params;
      const viewerId = req.user.id;
      const tenantId = req.user.tenantId;
      const model = req.query.model;
      const permissions = await PermissionService.getUserPermissions(
        viewerId,
        userId,
        model,
        tenantId
      );
      res.json({
        success: true,
        permissions,
        viewer: {
          id: viewerId,
          role: req.user.role
        },
        targetUser: userId
      });
    } catch (error) {
      console.error('Get permissions error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des permissions',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // GET /api/permissions/user/:userId/fields
  async getEditableFields(req, res) {
    try {
      const { userId } = req.params;
      const viewerId = req.user.id;
      const tenantId = req.user.tenantId;
      const { model } = req.query;
      const editableFields = await PermissionService.getEditableFields(
        viewerId,
        userId,
        model,
        tenantId
      );
      res.json({
        success: true,
        ...editableFields
      });
    } catch (error) {
      console.error('Get editable fields error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des champs éditables'
      });
    }
  }

  async getViewableFields(req, res) {
    try {
      const { userId } = req.params;
      const viewerId = req.user.id;
      const tenantId = req.user.tenantId;
      const { model } = req.query;
      const viewableFields = await PermissionService.getViewableFields(
        viewerId,
        userId,
        model,
        tenantId
      );
      res.json({
        success: true,
        ...viewableFields
      });
    } catch (error) {
      console.error('Get viewable fields error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des champs éditables'
      });
    }
  }

  async getCreatableFields(req, res) {
    try {
      const { userId } = req.params;
      const viewerId = req.user.id;
      const tenantId = req.user.tenantId;
      const { model } = req.query;
      const creatableFields = await PermissionService.getCreatableFields(
        viewerId,
        userId,
        model,
        tenantId
      );
      res.json({
        success: true,
        ...creatableFields
      });
    } catch (error) {
      console.error('Get creatable fields error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des champs éditables'
      });
    }
  }

  // POST /api/permissions/check-operation
  async checkOperation(req, res) {
    try {
      const { operation, model } = req.body;
      const targetId = req.params.userId;
      const viewerId = req.user.id;
      const tenantId = req.user.tenantId;
      const canPerform = await PermissionService.canPerform(
        viewerId,
        targetId,
        operation,
        model,
        tenantId
      );
      res.json({
        success: true,
        canPerform,
        operation,
        model,
        viewerId,
        targetId
      });
    } catch (error) {
      console.error('Check operation error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification de l\'opération'
      });
    }
  }

  // ADMIN ONLY: POST /api/permissions/initialize/:model
  async initializeDefaults(req, res) {
    try {
      const user = req.user;
      const model = req.params.model;
      const schema = req.body;
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({
          success: false,
          message: 'Non autorisé. Admin requis.'
        });
      }
      const results = await PermissionService.initializeDefaultSchemas(user._id, model, schema);
      res.status(201).json({
        success: true,
        message: results.created.length > 0
          ? 'Schémas de permissions initialisés avec succès'
          : 'Les schémas existent déjà',
        results
      });
    } catch (error) {
      console.error('Initialize error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'initialisation des schémas'
      });
    }
  }

  // ADMIN ONLY: GET /api/permissions/schemas
  async listSchemas(req, res) {
    try {
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Non autorisé'
        });
      }
      const filter = {};
      if (req.query.model) filter.model = req.query.model;
      const schemas = await PermissionSchema.find(filter)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .populate('changeLog.changedBy', 'name email')
        .sort({ model: 1, version: -1 });
      return res.json({
        success: true,
        count: schemas.length,
        schemas
      });
    } catch (error) {
      console.error('List schemas error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des schémas'
      });
    }
  }

  // ADMIN ONLY: POST /api/permissions/rollback
  async rollbackVersion(req, res) {
    try {
      const { targetStatus = 'archived', newStatus = 'active', model } = req.query;
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: 'Non autorisé' });
      }
      if (!model) {
        return res.status(400).json({ success: false, message: 'Model parameter required' });
      }
      const result = await PermissionService.rollback(model, req.user._id, {
        targetVersion: null, // automatic rollback to previous non‑flawed
        excludeStatuses: ['flawed'],
        newStatus,
        deactivateStatus: targetStatus,
        reason: `Manual rollback by ${req.user._id}`
      });
      return res.json({ success: true, rollback: result });
    } catch (error) {
      console.error('Rollback error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ADMIN ONLY: POST /api/permissions/reactivate/:schemaId
  async reactivateVersion(req, res) {
    try {
      const { schemaId } = req.params;
      const { newStatus = 'active', deactivateStatus = 'archived' } = req.query;
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: 'Non autorisé' });
      }
      const result = await PermissionService.reactivateVersion(
        schemaId,
        req.user._id,
        { newStatus, deactivateStatus, reason: `Reactivated by ${req.user._id}` }
      );
      return res.json({ success: true, message: `Version ${result.version} activée`, activated: result });
    } catch (error) {
      console.error('Reactivate error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  // ADMIN ONLY: POST /api/permissions/versions/:model
  async createNewVersion(req, res) {
    try {
      const user = req.user;
      const model = req.params.model;
      const newSchemaData = req.body.schema;
      const status = req.body.status || "archived";
      const result = await PermissionService.createNewVersion(newSchemaData, user._id, status, model);
      res.status(200).json({ success: true, result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ADMIN ONLY: PUT /api/permissions/versions/:versionId
  async updateVersion(req, res) {
    try {
      const { versionId } = req.params;
      const updates = req.body;
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({ success: false, message: 'Non autorisé' });
      }
      const updated = await PermissionService.updateVersion(versionId, updates, req.user._id);
      res.json({ success: true, message: 'Version mise à jour', version: updated });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}

module.exports = new PermissionController();