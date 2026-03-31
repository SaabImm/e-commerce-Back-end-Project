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
          const {model} = req.query
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
    const {model} = req.query
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
      const {model} = req.query
      
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

    // Filtrer par modèle si présent dans la requête
    const filter = {};
    if (req.query.model) {
      filter.model = req.query.model;
    }

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
  //rollback to an old version
async rollbackVersion(req, res) {
  try {
    const { 
        targetStatus = 'archived',
        newStatus = 'active',
        model       
      } = req.query;
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Non autorisé'
      });
    }
    
    // Get latest active version
    const schema = await PermissionSchema.findForModel(model);
    if (!schema) {
      return res.status(404).json({
        success: false,
        message: 'Aucune version active trouvée'
      });
    }

    // Get the nearest previous version that is not flawed
    const rollback = await PermissionSchema.findOne({
      model: model,
      version: { $lt: schema.version },
      status: { $nin: ['flawed'] }
    }).sort({ version: -1 });

    if (!rollback) {
      return res.status(404).json({
        success: false,
        message: 'Aucune version valide antérieure trouvée'
      });
    }

    // Deactivate current, activate rollback
    schema.isActive = false;
    schema.status = targetStatus;
    schema.deactivatedAt = new Date();
    schema.changeLog.push({
      version: schema.version,
      changedAt: new Date(),
      changedBy: req.user._id,
      changes: [{
        field: 'isActive',
        oldValue: true,
        newValue: false
      }],
      reason: `Rollback to version ${rollback.version}`
    });

    rollback.isActive = true;
    rollback.status = newStatus;
    rollback.changeLog.push({
      version: rollback.version,
      changedAt: new Date(),
      changedBy: req.user._id,
      changes: [{
        field: 'isActive',
        oldValue: false,
        newValue: true
      }],
      reason: `Reactivated via rollback from version ${schema.version}`
    });

    await schema.save();
    await rollback.save();

    return res.json({
      success: true,
      rollback
    });
    
  } catch (error) {
    console.error('Rollback error:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du rollback'
    });
  }
}
  // Controller method for reactivating the next version (rollforward)
  async reactivateVersion(req, res) {
    try {
      const schemaId = req.params.schemaId
      const { 
          targetStatus = 'archived',
          newStatus = 'active',
          model       
        } = req.query;
      if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Non autorisé'
        });
      }
      
      // Get current active version
      const current = await PermissionSchema.findOne({ model, isActive: true });
      if (!current) {
        return res.status(404).json({
          success: false,
          message: 'Aucune version active trouvée pour ce modèle'
        });
      }


      const next = await PermissionSchema.findById(schemaId)

      if (!next) {
        return res.status(404).json({
          success: false,
          message: 'Version suivante non trouvée ou marquée comme défectueuse'
        });
      }
      if (next.status === "flawed")
        return res.status(401).json({
      success: false,
      message: "this version is flawed!!"})



      // Deactivate current, activate next
      current.isActive = false;
      current.status = targetStatus;
      current.deactivatedAt = new Date();
      current.changeLog.push({
        version: current.version,
        changedAt: new Date(),
        changedBy: req.user._id,
        changes: [{
          field: 'isActive',
          oldValue: true,
          newValue: false
        }],
        reason: `Rollforward to version ${next.version}`
      });

      next.isActive = true;
      next.status = newStatus;
      next.changeLog.push({
        version: next.version,
        changedAt: new Date(),
        changedBy: req.user._id,
        changes: [{
          field: 'isActive',
          oldValue: false,
          newValue: true
        }],
        reason: `Reactivated from version ${current.version}`
      });

      await current.save();
      await next.save();

      return res.json({
        success: true,
        message: `Version ${next.version} activée`,
        activated: next
      });

    } catch (error) {
      console.error('Reactivate error:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la réactivation'
      });
    }
  }
  //create a new Version for the schemas
  async createNewVersion(req, res) {
  try {
    const user = req.user;
    const model= req.params.model;
    const newSchemaData = req.body.schema; // Send the new field/operation definitions
    const status = req.body.status || "archived"
    // Just pass the changes, let service handle version logic
    const result = await PermissionService.createNewVersion(newSchemaData, user._id, status, model);
    
    res.status(200).json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
  } 
  //edit an inactive version 
async updateVersion(req, res) {
  try {
    const { versionId } = req.params;
    const updates = req.body;
    if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Non autorisé'
      });
    }

    const updated = await PermissionService.updateVersion(versionId, updates, req.user._id);

    res.json({
      success: true,
      message: 'Version mise à jour',
      version: updated
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
}
}

module.exports = new PermissionController();