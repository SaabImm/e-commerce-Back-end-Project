// Services/PermissionService.js
const PermissionSchema = require('../Models/PermissionsModel');
const User = require('../Models/UsersModels');
const File = require('../Models/FilesModels')
class PermissionService {
  constructor() {
    // We'll get models directly when needed to avoid circular deps
  }

  //get level helper
  getLevel(roleName) {
  const levels = {
    'user': 0,
    'moderator': 1,
    'admin': 2,
    'super_admin': 3
  };
  return levels[roleName] || 0;
}
  // Get permissions for a specific user and model
  async getUserPermissions(viewerId, targetId, model, tenantId = null) {
    try {
      // Get viewer and target users
      const viewer = await User.findById(viewerId);
      const target = await User.findById(targetId);
      if (!viewer || !target) {
        throw new Error('Viewer or target user not found');
      }
      
      // Get active permission schema for this model and tenant
      const permissionDoc = await PermissionSchema.findOne({ 
        model,
        tenantId: tenantId || null,
        isActive: true
      }).sort({ version: -1 });
      
      if (!permissionDoc) {
        console.log(`No permission schema found for ${model}, using defaults`);
        return this.getDefaultPermissions(viewer, target, tenantId);
      }
      
      // Calculate permissions based on the schema
      return this.calculatePermissions(permissionDoc, viewer, target, tenantId);
      
    } catch (error) {
      console.error('PermissionService error:', error);
      throw error;
    }
  }

  // Calculate permissions based on schema
  calculatePermissions(permissionDoc, viewer, target, tenantId=null) {

    const viewerLevel = this.getLevel(viewer.role);
    const targetLevel = this.getLevel(target.role);
    const context = {
      isSelf: viewer._id.toString() === target._id.toString(),
      viewerLevel,
      targetLevel,
      tenantId: viewer.tenantId,
      targetTenantId: target.tenantId
    };
    
    const permissions = {
      canUpdate: [],
      canView: [],
      canCreate : [],
      operations: {},
      fieldConfigs: {}
    };
    
    // Check each field
    permissionDoc.fields.forEach(field => {
      const fieldName = field.name;
      
      // Check if viewer can EDIT this field
      const canEdit = field.editableBy.some(rule => 
        permissionDoc.checkRule(rule, viewer.role, context)
      );
      const canCreate = field.creatableBy.some(rule => 
        permissionDoc.checkRule(rule, viewer.role, context)
      );
      
      // Check if viewer can VIEW this field
      const canView = field.visibleTo.some(rule => 
        permissionDoc.checkRule(rule, viewer.role, context)
      );
      
      if (canEdit) permissions.canUpdate.push(fieldName);
      if (canView) permissions.canView.push(fieldName);
      if (canCreate) permissions.canCreate.push(fieldName);
      
      // Add field config for frontend
      if (canView || canCreate) {
        permissions.fieldConfigs[fieldName] = {
          label: field.label,
          labelAr: field.labelAr,
          type: field.type,
          validation: field.validation,
          ui: field.ui
        };
      }
    });
    
    // Check document-level operations
    if (permissionDoc.operations && Array.isArray(permissionDoc.operations)) {
      permissionDoc.operations.forEach(op => {
        permissions.operations[op.operation] = op.allowed.some(rule => 
          permissionDoc.checkRule(rule, viewer.role, context)
        );
      });
    }
    
    // Add context info
    permissions.context = context;
    
    return permissions;
  }

  // Default permissions fallback
  getDefaultPermissions(viewer, target, tenantId) {
    const isSelf = viewer._id.toString() === target._id.toString();
    const isAdmin = viewer.role === 'admin';
    const isSuperAdmin = viewer.role === 'super_admin';
    const isSameTenant = !tenantId || 
      (viewer.tenantId && viewer.tenantId.toString() === target.tenantId?.toString());
    
    return {
      canUpdate: isSelf 
        ? ['name', 'lastname', 'profilePicture', 'dateOfBirth']
        : (isAdmin && isSameTenant)
          ? ['name', 'lastname', 'email', 'role', 'status']
          : [],
      
      canView: isSelf || (isAdmin && isSameTenant)
        ? ['name', 'lastname', 'email', 'role', 'createdAt', 'profilePicture']
        : ['name', 'lastname', 'profilePicture'],
      
      operations: {
        create: isAdmin && isSameTenant,
        read: isSelf || (isAdmin && isSameTenant),
        update: isSelf || (isAdmin && isSameTenant),
        delete: isAdmin && isSameTenant && !isSelf
      },
      
      fieldConfigs: {
        name: { label: 'Nom', type: 'text', validation: { required: true } },
        lastname: { label: 'Prénom', type: 'text', validation: { required: true } },
        email: { label: 'Email', type: 'email', validation: { required: true } },
        profilePicture: { label: 'Photo', type: 'image' }
      },
      
      context: {
        isSelf,
        viewerRole: viewer.role,
        targetRole: target.role
      }
    };
  }

  // Check if user can perform a specific operation
  async canPerform(viewerId, targetId, operation, model, tenantId = null) {
    const permissions = await this.getUserPermissions(viewerId, targetId, model, tenantId);
    return permissions.operations[operation] || false;
  }

  // Get fields user can edit with configurations
  async getEditableFields(viewerId, targetId, model, tenantId = null) {
    const permissions = await this.getUserPermissions(viewerId, targetId, model, tenantId);
    
    return {
      fields: permissions.canUpdate,
      configs: permissions.fieldConfigs,
      permissions
    };
  }

    async getViewableFields(viewerId, targetId, model, tenantId = null) {
    const permissions = await this.getUserPermissions(viewerId, targetId, model, tenantId);
    return {
      fields: permissions.canView,
      configs: permissions.fieldConfigs,
      permissions
    };
  }


    async getCreatableFields(viewerId, targetId, model, tenantId = null) {
    const permissions = await this.getUserPermissions(viewerId, targetId, model, tenantId);
   
    return {
      fields: permissions.canCreate,
      configs: permissions.fieldConfigs,
      permissions
    };
  }

  // Initialize default permission schemas
async initializeDefaultSchemas(createdBy = null, model, schemaDefinition) {
  // schemaDefinition doit contenir les champs et opérations pour ce modèle
  const newSchema = {
    model: model,
    version: 1,
    isActive: true,
    activatedAt: new Date(),
    tenantId: null,
    createdBy,
    updatedBy: createdBy,
    fields: schemaDefinition.fields || [],
    operations: schemaDefinition.operations || []
  };

  const results = { created: [], errors: [] };

  try {
    const exists = await PermissionSchema.findOne({ 
      model,
      tenantId: null,
      isActive: true 
    });
    console.log(exists)
    if (!exists) {
      const created = await PermissionSchema.create(newSchema);
      results.created.push({ model, id: created._id });
      console.log(`✅ Created default permission schema for ${model}:`, created._id);
    } else {
      results.created.push({ model, id: exists._id, message: 'Already exists' });
      console.log(`ℹ️ Schema for ${model} already exists:`, exists._id);
    }
  } catch (error) {
    results.errors.push({ model, error: error.message });
    console.error(`❌ Error creating schema for ${model}:`, error.message);
  }

  return results;
}

  async createNewVersion(changes, changedBy, status) {
    //get the highest version doc 
      const highestVersionDoc = await PermissionSchema.findOne({ 
    model: 'User' 
  }).sort({ version: -1 });
  
  const highestVersion = highestVersionDoc ? highestVersionDoc.version : 0;

  // Get current active version
  const current = await PermissionSchema.findOne({ 
    model: 'User', 
    isActive: true 
  });

  
  if (!current) {
    throw new Error('No active schema found');
  }

  // Merge fields - keep existing, update changed, add new
const mergedFields = [];

// 1. Process all existing fields
current.fields.forEach((existingField) => {
  // Check if this field is being changed
  const changedField = changes.fields?.find(cf => cf.name === existingField.name);
  
  if (changedField) {
    // Field exists in changes - use the updated version
    mergedFields.push(changedField);
  } else {
    // Field not in changes - keep existing
    mergedFields.push(existingField);
  }
});

// 2. Add any completely new fields (not in current)
changes.fields?.forEach((changedField) => {
  const exists = current.fields.some(ef => ef.name === changedField.name);
  if (!exists) {
    mergedFields.push(changedField);
  }
});

// Merge operations - same logic
const mergedOperations = [];

// Process existing operations
current.operations.forEach((existingOp) => {
  const changedOp = changes.operations?.find(co => co.operation === existingOp.operation);
  
  if (changedOp) {
    mergedOperations.push(changedOp);
  } else {
    mergedOperations.push(existingOp);
  }
});

// Add new operations
changes.operations?.forEach((changedOp) => {
  const exists = current.operations.some(eo => eo.operation === changedOp.operation);
  if (!exists) {
    mergedOperations.push(changedOp);
  }
});

// Create new version with merged data
const newVersion = {
  ...current.toObject(),
  _id: undefined,
  version: highestVersion + 1,
  isActive: true,
  activatedAt: new Date(),
  updatedBy: changedBy,
  status: status,
  fields: mergedFields,
  operations: mergedOperations
};

  
  // Deactivate old version
  current.isActive = false;
  current.status = "archived"
  current.deactivatedAt = new Date();
  await current.save();
  
  // Save new version
  return PermissionSchema.create(newVersion);
}



}

module.exports = new PermissionService();