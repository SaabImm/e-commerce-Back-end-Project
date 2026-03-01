// Controllers/PermissionsController.js
const PermissionService = require('../Services/PermissionService');
const PermissionSchema = require('../Models/PermissionsModel');

class PermissionController {
  // GET /api/permissions/user/:userId
  async getUserPermissions(req, res) {
    try {
      const { userId } = req.params;
      const viewerId = req.user.id; // From JWT middleware, not body!
      const tenantId= req.user.tenantId
      const model = req.query.model
      const permissions = await PermissionService.getUserPermissions(
        viewerId,
        userId,
        model,
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
  
  async getViewableFields(req, res) {
  try {
    const { userId } = req.params;
    const viewerId = req.user.id;
    const tenantId = req.user.tenantId;
    
    const viewableFields = await PermissionService.getViewableFields(
      viewerId,
      userId,
      'User',
      tenantId
    );
    
    res.json({
      success: true,
      ...viewableFields
    });
    
  } catch (error) {
    console.error('Get editable fields error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des champs éditables'
    });
  }
}

  //get Creatable fields for Ui 
    async getCreatableFields(req, res) {
    try {
      const { userId } = req.params;
      const viewerId = req.user.id;
      const tenantId = req.user.tenantId;
      
      const creatableFields = await PermissionService.getCreatableFields(
        viewerId,
        userId,
        'User',
        tenantId
      );
      
      res.json({
        success: true,
        ...creatableFields
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
  
  // ADMIN ONLY: POST /api/permissions/initialize
  async initializeDefaults(req, res) {
    try {
      // Get user from auth middleware, not body!
      const user = req.user;
      const model = req.params.model
      const schema = req.body
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
      
      const schemas = await PermissionSchema.find({})
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
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

  //rollback to an old version
  async rollbackVersion(req, res) {
  try {
    const { 
        targetStatus = 'archived',     // Status for the version being rolled back
        newStatus = 'active'          // Status for the version being restored
      } = req.query;
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Non autorisé'
      });
    }
    
  // Get latest version 
  const schema = await PermissionSchema.findForModel('User');

  //get the rollback version
  const rollback = await PermissionSchema.findOne({
    version: schema.version-1,
    status: { $nin: ['flawed'] }
  })

  //check for existance
  if (!rollback) {
  return res.status(404).json({
    success: false,
    message: 'Version précédente non trouvée'
  });}

 
    //desactivate the newest version and activate the rollback version
    schema.isActive = false;
    schema.status = targetStatus;
    schema.deactivatedAt = new Date();
    schema.changeLog.push({
      version : schema.version,
      changedAt : new Date(),
      changedBy : req.user._id,
      changes: [{
        field: 'isActive',
        oldValue: true,
        newValue: false
      }],
      reason: `Rollback to version ${rollback.version}`
    })

    rollback.isActive = true;
    rollback.status = newStatus;
      rollback.changeLog.push({
      version : rollback.version,
      changedAt : new Date(),
      changedBy : req.user._id,
      changes: [{
        field: 'isActive',
        oldValue: false,
        newValue: true
      }],
      reason: `Reactivated via rollback from version ${schema.version}`
    })
    //save changes
    await schema.save();
    await rollback.save();
    return res.json({
      success: true,
      rollback
    });
    
  } catch (error) {
    console.error('List schemas error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des schémas'
    });
  }
}

//create a new Version for the schemas
  async createNewVersion(req, res) {
  try {
    const user = req.user;
    const newSchemaData = req.body.schema; // Send the new field/operation definitions
    const status = req.body.status
    
    // Just pass the changes, let service handle version logic
    const result = await PermissionService.createNewVersion(newSchemaData, user._id, status);
    
    res.status(200).json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
}
}

module.exports = new PermissionController();