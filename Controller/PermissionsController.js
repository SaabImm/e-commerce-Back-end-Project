// Controllers/PermissionsController.js
const PermissionService = require('../Services/PermissionService');
const User = require('../Models/UsersModels');

class PermissionController {
  // GET /api/permissions/user/:userId
  async getUserPermissions(req, res) {
    try {
      const { userId } = req.params;
      const viewerId = req.user.id; // From JWT middleware, not body!
      const tenantId= req.user.tenantId
      
      const permissions = await PermissionService.getUserPermissions(
        viewerId,
        userId,
        'User',
        tenantId
      );
      console.log(permissions)
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
      
      const editableFields = await PermissionService.getEditableFields(
        viewerId,
        userId,
        'User',
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
  
  // POST /api/permissions/check-operation
  async checkOperation(req, res) {
    try {
      const { operation, model = 'User' } = req.body;
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
  
  // ADMIN ONLY: POST /api/permissions/initialize
  async initializeDefaults(req, res) {
    try {
      // Get user from auth middleware, not body!
      const user = req.user;
      
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({
          success: false,
          message: 'Non autorisé. Admin requis.'
        });
      }
      
      const results = await PermissionService.initializeDefaultSchemas(user._id);
  
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
      
      const PermissionSchema = require('../Models/PermissionsModel');
      const schemas = await PermissionSchema.find({})
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .sort({ model: 1, version: -1 });
      
      res.json({
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
}

module.exports = new PermissionController();