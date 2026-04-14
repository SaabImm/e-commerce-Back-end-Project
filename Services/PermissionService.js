// Services/PermissionService.js
const PermissionSchema = require('../Models/PermissionsModel');
const User = require('../Models/UsersModels');
const File = require('../Models/FilesModels');

class PermissionService {
  constructor() {}

  // Helper to get role level
  getLevel(roleName) {
    const levels = {
      'user': 0,
      'moderator': 1,
      'admin': 2,
      'super_admin': 3
    };
    return levels[roleName] || 0;
  }

  // Get permissions for a specific user and model (handles targetId = null)
  async getUserPermissions(viewerId, targetId, model, tenantId = null) {
    try {
      const viewer = await User.findById(viewerId);
      if (!viewer) throw new Error('Viewer user not found');

      let target = null;
      let context = {
        isSelf: false,
        viewerLevel: this.getLevel(viewer.role),
        targetLevel: 0,
        tenantId: viewer.tenantId,
        targetTenantId: null
      };

      if (targetId) {
        target = await User.findById(targetId);
        if (!target) throw new Error('Target user not found');
        context.isSelf = viewer._id.toString() === target._id.toString();
        context.targetLevel = this.getLevel(target.role);
        context.targetTenantId = target.tenantId;
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

      return this.calculatePermissions(permissionDoc, viewer, target, context, tenantId);
    } catch (error) {
      console.error('PermissionService error:', error);
      throw error;
    }
  }

  // Calculate permissions based on schema
  calculatePermissions(permissionDoc, viewer, target, context, tenantId = null) {
    const permissions = {
      canUpdate: [], 
      canView: [],
      canCreate: [],
      operations: {},
      fieldConfigs: {}
    };

    // Check each field
    permissionDoc.fields.forEach(field => {
      const fieldName = field.name;

      const canEdit = field.editableBy.some(rule =>
        permissionDoc.checkRule(rule, viewer.role, context)
      );
      const canCreate = field.creatableBy.some(rule =>
        permissionDoc.checkRule(rule, viewer.role, context)
      );
      const canView = field.visibleTo.some(rule =>
        permissionDoc.checkRule(rule, viewer.role, context)
      );

      if (canEdit) permissions.canUpdate.push(fieldName);
      if (canView) permissions.canView.push(fieldName);
      if (canCreate) permissions.canCreate.push(fieldName);

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

    permissions.context = context;
    return permissions;
  }

  // Default permissions fallback (handles null target)
  getDefaultPermissions(viewer, target, tenantId) {
    const isSelf = target ? viewer._id.toString() === target._id.toString() : false;
    const isAdmin = viewer.role === 'admin';
    const isSuperAdmin = viewer.role === 'super_admin';
    const isSameTenant = !tenantId ||
      (viewer.tenantId && target && viewer.tenantId.toString() === target.tenantId?.toString());

    return {
      canUpdate: isSelf
        ? ['name', 'lastname', 'profilePicture', 'dateOfBirth']
        : (isAdmin && isSameTenant)
          ? ['name', 'lastname', 'email', 'role', 'status']
          : [],
      canView: isSelf || (isAdmin && isSameTenant)
        ? ['name', 'lastname', 'email', 'role', 'createdAt', 'profilePicture']
        : ['name', 'lastname', 'profilePicture'],
      canCreate: [],
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
        targetRole: target ? target.role : null
      }
    };
  }

  // Check if user can perform a specific operation (targetId can be null)
  async canPerform(viewerId, targetId, operation, model, tenantId = null) {
    const permissions = await this.getUserPermissions(viewerId, targetId, model, tenantId);
    return permissions.operations[operation] || false;
  }

  // Get fields user can edit
  async getEditableFields(viewerId, targetId, model, tenantId = null) {
    const permissions = await this.getUserPermissions(viewerId, targetId, model, tenantId);
    return {
      fields: permissions.canUpdate,
      configs: permissions.fieldConfigs,
      permissions
    };
  }

  // Get viewable fields
  async getViewableFields(viewerId, targetId, model, tenantId = null) {
    const permissions = await this.getUserPermissions(viewerId, targetId, model, tenantId);
    return {
      fields: permissions.canView,
      configs: permissions.fieldConfigs,
      permissions
    };
  }

  // Get creatable fields
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

  // Create a new version from old version merged with new changes
  async createNewVersion(changes, changedBy, status, model) {
    const highestVersionDoc = await PermissionSchema.findOne({ model }).sort({ version: -1 });
    const highestVersion = highestVersionDoc ? highestVersionDoc.version : 0;

    const current = await PermissionSchema.findOne({ model, isActive: true });
    if (!current) throw new Error('No active schema found');

    // Merge fields
    const mergedFields = [];

    current.fields.forEach(existingField => {
      const changedField = changes.fields?.find(cf => cf.name === existingField.name);
      if (changedField) {
        mergedFields.push(changedField);
      } else {
        mergedFields.push(existingField);
      }
    });

    changes.fields?.forEach(changedField => {
      const exists = current.fields.some(ef => ef.name === changedField.name);
      if (!exists) mergedFields.push(changedField);
    });

    // Merge operations
    const mergedOperations = [];

    current.operations.forEach(existingOp => {
      const changedOp = changes.operations?.find(co => co.operation === existingOp.operation);
      if (changedOp) {
        mergedOperations.push(changedOp);
      } else {
        mergedOperations.push(existingOp);
      }
    });

    changes.operations?.forEach(changedOp => {
      const exists = current.operations.some(eo => eo.operation === changedOp.operation);
      if (!exists) mergedOperations.push(changedOp);
    });

    const newVersion = {
      ...current.toObject(),
      _id: undefined,
      model,
      version: highestVersion + 1,
      isActive: true,
      activatedAt: new Date(),
      updatedBy: changedBy,
      status: status || "active",
      fields: mergedFields,
      operations: mergedOperations
    };

    // Deactivate old version
    current.isActive = false;
    current.status = status || "archived";
    current.deactivatedAt = new Date();
    await current.save();

    return PermissionSchema.create(newVersion);
  }

  // Update an inactive version
  async updateVersion(versionId, updates, userId) {
    const version = await PermissionSchema.findById(versionId);
    if (!version) throw new Error('Version non trouvée');

    if (version.isActive) {
      throw new Error('Impossible de modifier une version active. Créez une nouvelle version.');
    }

    if (updates.fields !== undefined) version.fields = updates.fields;
    if (updates.operations !== undefined) version.operations = updates.operations;
    if (updates.status !== undefined) version.status = updates.status;

    version.changeLog.push({
      version: version.version,
      changedAt: new Date(),
      changedBy: userId,
      changes: [{
        field: 'schema',
        oldValue: 'previous',
        newValue: 'updated'
      }],
      reason: updates.reason || 'Mise à jour manuelle'
    });

    version.updatedBy = userId;
    await version.save();

    return version;
  }
}

module.exports = new PermissionService();