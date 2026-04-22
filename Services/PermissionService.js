// Services/PermissionService.js
const PermissionSchema = require('../Models/PermissionsModel');
const User = require('../Models/UsersModels');
const VersioningService = require('../Services/VersioningService')
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
      // Helper to merge fields
    mergeFields(existingFields, changedFields = []) {
    if (!changedFields.length) return existingFields;
    const fieldMap = new Map(existingFields.map(f => [f.name, f]));
    for (const cf of changedFields) {
      fieldMap.set(cf.name, cf);
    }
    return Array.from(fieldMap.values());
  }

    // Helper to merge operations
  mergeOperations(existingOps, changedOps = []) {
    if (!changedOps.length) return existingOps;
    const opMap = new Map(existingOps.map(o => [o.operation, o]));
    for (const co of changedOps) {
      opMap.set(co.operation, co);
    }
    return Array.from(opMap.values());
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

  // Create a new version with custom merging for fields/operations
  async createNewVersion(changes, changedBy, status, model) {
    const current = await PermissionSchema.findOne({ model, isActive: true });
    if (!current) throw new Error('No active schema found');

    const mergedFields = this.mergeFields(current.fields, changes.fields);
    const mergedOperations = this.mergeOperations(current.operations, changes.operations);

    const newDocData = {
      ...current.toObject(),
      _id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      __v: undefined,
      fields: mergedFields,
      operations: mergedOperations,
      status: status || 'active'
    };

    return await VersioningService.createNewVersionFromData(
      PermissionSchema,
      current,
      newDocData,
      changedBy,
      { newStatus: status, deactivateStatus: 'archived', reason: changes.reason || 'New version created' }
    );
  }

  // Update an inactive version
  async updateVersion(versionId, updates, userId) {
    return await VersioningService.updateInactiveVersion(PermissionSchema, versionId, updates, userId, updates.reason);
  }

  // Rollback to previous non‑flawed version
  async rollback(model, userId, options = {}) {
    // Find the currently active version for this model
    const activeVersion = await PermissionSchema.findOne({ model, isActive: true }).sort({ version: -1 });
    if (!activeVersion) throw new Error('No active version found');
    const docId = activeVersion._id; // ID of the active version document
    return await VersioningService.rollback(PermissionSchema, docId, userId, options);
  }

  // Reactivate a specific version (by ID)
  async reactivateVersion(versionId, userId, options = {}) {
    return await VersioningService.reactivateVersion(PermissionSchema, versionId, userId, options);
  }

  async initializeDefaultSchemas(createdBy, model, schemaDefinition) {
  const filter = { model, tenantId: null };
  try {
    const existing = await PermissionSchema.findOne(filter);
    if (existing) {
      console.log(`ℹ️ Schema for ${model} already exists:`, existing._id);
      return { created: [{ model, id: existing._id, message: 'Already exists' }], errors: [] };
    }
    const newDoc = await VersioningService.initializeFirstVersion(
      PermissionSchema,
      filter,
      {
        model,
        tenantId: null,
        fields: schemaDefinition.fields || [],
        operations: schemaDefinition.operations || [],
        status: 'active'
      },
      createdBy
    );
    console.log(`✅ Created default permission schema for ${model}:`, newDoc._id);
    return { created: [{ model, id: newDoc._id }], errors: [] };
  } catch (error) {
    console.error(`❌ Error creating schema for ${model}:`, error.message);
    return { created: [], errors: [{ model, error: error.message }] };
  }
}
}

module.exports = new PermissionService();