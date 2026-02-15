// Services/PermissionService.js
const PermissionSchema = require('../Models/PermissionsModel');
const User = require('../Models/UsersModels');

class PermissionService {
  constructor() {
    // We'll get models directly when needed to avoid circular deps
  }

  // Get permissions for a specific user and model
  async getUserPermissions(viewerId, targetId, model = 'User', tenantId = null) {
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
  calculatePermissions(permissionDoc, viewer, target, tenantId) {
    const isSelf = viewer._id.toString() === target._id.toString();
    const viewerRole = viewer.role;
    
    const permissions = {
      canUpdate: [],
      canView: [],
      operations: {},
      fieldConfigs: {}
    };
    
    // Check each field
    permissionDoc.fields.forEach(field => {
      const fieldName = field.name;
      
      // Check if viewer can EDIT this field
      const canEdit = field.editableBy.some(rule => 
        this.checkRule(rule, viewerRole, isSelf, viewer.tenantId, target.tenantId)
      );
      
      // Check if viewer can VIEW this field
      const canView = field.visibleTo.some(rule => 
        this.checkRule(rule, viewerRole, isSelf, viewer.tenantId, target.tenantId)
      );
      
      if (canEdit) permissions.canUpdate.push(fieldName);
      if (canView) permissions.canView.push(fieldName);
      
      // Add field config for frontend
      if (canView) {
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
          this.checkRule(rule, viewerRole, isSelf, viewer.tenantId, target.tenantId)
        );
      });
    }
    
    // Add context info
    permissions.context = {
      isSelf,
      viewerRole,
      targetRole: target.role,
      viewerTenant: viewer.tenantId,
      targetTenant: target.tenantId
    };
    
    return permissions;
  }

  // Check if a rule applies
  checkRule(rule, viewerRole, isSelf, viewerTenant, targetTenant) {
    // Check role
    if (rule.role !== 'any' && rule.role !== viewerRole) {
      return false;
    }
    
    // Check condition
    switch (rule.condition) {
      case 'self':
        return isSelf;
      case 'same_tenant':
        return viewerTenant && targetTenant && 
               viewerTenant.toString() === targetTenant.toString();
      case 'any':
        return true;
      default:
        return false;
    }
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
  async canPerform(viewerId, targetId, operation, model = 'User', tenantId = null) {
    const permissions = await this.getUserPermissions(viewerId, targetId, model, tenantId);
    return permissions.operations[operation] || false;
  }

  // Get fields user can edit with configurations
  async getEditableFields(viewerId, targetId, model = 'User', tenantId = null) {
    const permissions = await this.getUserPermissions(viewerId, targetId, model, tenantId);
    
    return {
      fields: permissions.canUpdate,
      configs: permissions.fieldConfigs,
      permissions
    };
  }

  // Initialize default permission schemas
  async initializeDefaultSchemas(createdBy = null) {
    const defaultSchemas = {
      User: {
        model: 'User',
        version: 1,
        isActive: true,
        activatedAt: new Date(),
        tenantId: null,
        createdBy,
        updatedBy: createdBy,
        fields: [
          {
            name: 'name',
            label: 'Nom',
            editableBy: [
              { role: 'user', condition: 'self' },
              { role: 'admin', condition: 'self' },
              { role: 'admin', condition: 'any' } 
            ],
            visibleTo: [
              { role: 'user', condition: 'self' },
              { role: 'admin', condition: 'self' },
              { role: 'admin', condition: 'any' }
            ],
            type: 'text',
            validation: { 
              required: true, 
              requiredMessage: 'Le nom est requis',
              minLength: 2, 
              maxLength: 50 
            },
            ui: { 
              order: 1, 
              group: 'personal_info',
              groupLabel: 'Informations Personnelles',
              placeholder: 'Votre nom',
              colSpan: 6 
            }
          },
          {
            name: 'lastname',
            label: 'Prénom',
            editableBy: [
              { role: 'user', condition: 'self' },
              { role: 'admin', condition: 'self' },
              { role: 'admin', condition: 'any' } 
            ],
            visibleTo: [
              { role: 'user', condition: 'self' },
              { role: 'admin', condition: 'self' },
              { role: 'admin', condition: 'any' } 
            ],
            type: 'text',
            validation: { 
              required: true, 
              requiredMessage: 'Le prénom est requis',
              minLength: 2, 
              maxLength: 50 
            },
            ui: { 
              order: 2, 
              group: 'personal_info',
              placeholder: 'Votre prénom',
              colSpan: 6 
            }
          },
          {
            name: 'email',
            label: 'Adresse Email',
            editableBy: [
              { role: 'user', condition: 'self' },
              { role: 'admin', condition: 'self' },
              { role: 'admin', condition: 'any' } 
            ],
            visibleTo: [
              { role: 'user', condition: 'self' },
              { role: 'admin', condition: 'self' },
              { role: 'admin', condition: 'any' } 
            ],
            type: 'email',
            validation: { 
              required: true,
              requiredMessage: 'L\'email est requis',
              pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
              patternMessage: 'Veuillez entrer une adresse email valide'
            },
            ui: { 
              order: 3, 
              group: 'personal_info',
              placeholder: 'email@exemple.com',
              helpText: 'Cette adresse sera utilisée pour la connexion',
              colSpan: 12 
            }
          },
          {
            name: 'role',
            label: 'Rôle',
            editableBy: [
              { role: 'admin', condition: 'any' }
            ],
            visibleTo: [
              { role: 'user', condition: 'self' },
              { role: 'admin', condition: 'self' },
              { role: 'admin', condition: 'any' } 
            ],
            type: 'select',
            validation: { 
              required: true,
              requiredMessage: 'Le rôle est requis',
              options: [
                { value: 'user', label: 'Utilisateur' },
                { value: 'admin', label: 'Administrateur' },
                { value: 'super_admin', label: 'Super Admin' }
              ]
            },
            ui: { 
              order: 10, 
              group: 'security',
              groupLabel: 'Sécurité et Rôles',
              colSpan: 6 
            }
          },
          {
            name: 'profilePicture',
            label: 'Photo de Profil',
            editableBy: [
              { role: 'user', condition: 'self' },
              { role: 'admin', condition: 'self' }
            ],
            visibleTo: [
              { role: 'user', condition: 'self' },
              { role: 'admin', condition: 'self' },
              { role: 'admin', condition: 'any' } 
            ],
            type: 'image',
            validation: {
              fileTypes: ['image/jpeg', 'image/png', 'image/gif'],
              maxFileSize: 5242880
            },
            ui: { 
              order: 0, 
              group: 'personal_info',
              colSpan: 12 
            }
          }
        ],
        operations: [
          {
            operation: 'create',
            allowed: [{ role: 'admin', condition: 'any' },
              { role: 'admin', condition: 'self' }
            ]
          },
          {
            operation: 'read',
            allowed: [
              { role: 'user', condition: 'self' },
              { role: 'admin', condition: 'self' },
              { role: 'admin', condition: 'any' } 
            ]
          },
          {
            operation: 'update',
            allowed: [
              { role: 'user', condition: 'self' },
              { role: 'admin', condition: 'self' },
              { role: 'admin', condition: 'any' } 
            ]
          },
          {
            operation: 'delete',
            allowed: [
              { role: 'admin', condition: 'any' },
              

            ]
          }
        ]
      }
    };
    
    const results = { created: [], errors: [] };
    
    for (const [model, schema] of Object.entries(defaultSchemas)) {
      try {
        const exists = await PermissionSchema.findOne({ 
          model,
          tenantId: null,
          isActive: true 
        });
        
        if (!exists) {
          const created = await PermissionSchema.create(schema);
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
    }
    
    return results;
  }
}

module.exports = new PermissionService();