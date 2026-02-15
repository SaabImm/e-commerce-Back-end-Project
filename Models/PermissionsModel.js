const mongoose = require('mongoose');

const permissionFieldSchema = new mongoose.Schema({
  // Field identification
  name: {
    type: String,
    required: [true, 'Le nom du champ est requis'],
    trim: true
  },
  
  // Human-readable labels (French/Arabic context)
  label: {
    type: String,
    required: [true, 'Le libellé du champ est requis'],
    trim: true
  },
  
  labelAr: {
    type: String,
    trim: true
  },
  
  // Field type for frontend rendering
  type: {
    type: String,
    enum: [
      'text', 'email', 'password', 'number', 
      'tel', 'date', 'datetime', 'textarea', 
      'select', 'multiselect', 'checkbox', 
      'radio', 'file', 'image', 'richtext'
    ],
    default: 'text',
    required: true
  },
  
  // Who can EDIT this field
  editableBy: [{
    role: {
      type: String,
      enum: ['user', 'moderator', 'admin', 'super_admin', 'any'],
      required: true
    },
    condition: {
      type: String,
      enum: ['self', 'any', 'same_tenant', 'tenant_admin', 'custom'],
      default: 'any'
    },
    // Custom condition logic (stored as string to be eval'ed safely)
    customCondition: String
  }],
  
  // Who can VIEW this field
  visibleTo: [{
    role: {
      type: String,
      enum: ['user', 'moderator', 'admin', 'super_admin', 'any'],
      required: true
    },
    condition: {
      type: String,
      enum: ['self', 'any', 'same_tenant', 'tenant_admin', 'custom'],
      default: 'any'
    },
    customCondition: String
  }],
  
  // Validation rules
  validation: {
    required: {
      type: Boolean,
      default: false
    },
    requiredMessage: String,
    
    minLength: Number,
    maxLength: Number,
    
    min: Number, // For numbers
    max: Number, // For numbers
    
    pattern: String, // Regex pattern
    patternMessage: String,
    
    // For select fields
    options: [{
      value: String,
      label: String,
      labelAr: String
    }],
    
    // File-specific validation
    fileTypes: [String], // ['image/jpeg', 'application/pdf']
    maxFileSize: Number, // in bytes
    
    // Custom validation function (stored as string)
    customValidator: String
  },
  
  // UI Configuration
  ui: {
    order: {
      type: Number,
      default: 0
    },
    
    group: {
      type: String,
      enum: [
        'personal_info', 'professional_info', 'contact_info',
        'security', 'preferences', 'admin_only', 'public'
      ],
      default: 'personal_info'
    },
    
    groupLabel: String,
    groupLabelAr: String,
    
    placeholder: String,
    placeholderAr: String,
    
    helpText: String,
    helpTextAr: String,
    
    // Advanced UI controls
    readonly: {
      type: Boolean,
      default: false
    },
    
    hidden: {
      type: Boolean,
      default: false
    },
    
    // Conditional display
    dependsOn: {
      field: String,
      value: mongoose.Schema.Types.Mixed,
      operator: {
        type: String,
        enum: ['equals', 'not_equals', 'contains', 'greater_than', 'less_than']
      }
    },
    
    // CSS classes for custom styling
    className: String,
    
    // Grid layout
    colSpan: {
      type: Number,
      min: 1,
      max: 12,
      default: 12
    }
  },
  
  // Metadata
  description: String,
  version: {
    type: Number,
    default: 1
  },
  
  // Audit
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false }); // No _id for subdocuments

const permissionOperationSchema = new mongoose.Schema({
  // Operation type
  operation: {
    type: String,
    enum: ['create', 'read', 'update', 'delete', 'export', 'import', 'approve', 'reject'],
    required: true
  },
  
  // Who can perform this operation
  allowed: [{
    role: {
      type: String,
      enum: ['user', 'moderator', 'admin', 'super_admin'],
      required: true
    },
    condition: {
      type: String,
      enum: ['self', 'any', 'same_tenant', 'tenant_admin', 'custom'],
      default: 'any'
    },
    customCondition: String,
    
    // Additional constraints
    constraints: {
      timeOfDay: {
        start: String, // "09:00"
        end: String    // "17:00"
      },
      maxPerDay: Number,
      requiresApproval: Boolean
    }
  }],
  
  // Pre-conditions for the operation
  preConditions: [{
    field: String,
    value: mongoose.Schema.Types.Mixed,
    operator: String
  }],
  
  // Post-operation actions
  postActions: [{
    type: {
      type: String,
      enum: ['notification', 'webhook', 'log', 'email', 'sms']
    },
    config: mongoose.Schema.Types.Mixed
  }]
}, { _id: false });

// Main Permission Schema
const permissionSchema = new mongoose.Schema({
  // Which model this permission applies to
  model: {
    type: String,
    required: [true, 'Le modèle est requis'],
    trim: true,
    index: true
  },
  
  // Model version (for schema evolution)
  modelVersion: {
    type: String,
    default: '1.0.0'
  },
  
  // Tenant-specific permissions (null = global/default)
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    default: null,
    index: true
  },
  
  // Field-level permissions
  fields: [permissionFieldSchema],
  
  // Document-level operations
  operations: [permissionOperationSchema],
  
  // Workflow definitions
  workflows: [{
    name: String,
    description: String,
    states: [{
      name: String,
      label: String,
      transitions: [{
        to: String,
        allowedBy: [{
          role: String,
          condition: String
        }],
        conditions: mongoose.Schema.Types.Mixed
      }]
    }]
  }],
  
  // Default values for new documents
  defaults: mongoose.Schema.Types.Mixed,
  
  // Field dependencies and business rules
  businessRules: [{
    name: String,
    description: String,
    condition: String, // JavaScript condition string
    action: String,    // JavaScript action string
    priority: Number
  }],
  
  // Audit trail configuration
  auditConfig: {
    trackFields: [String],
    excludeFields: [String],
    retentionDays: {
      type: Number,
      default: 365
    }
  },
  
  // Cache configuration
  cacheConfig: {
    ttl: { // Time to live in seconds
      type: Number,
      default: 300 // 5 minutes
    },
    enabled: {
      type: Boolean,
      default: true
    }
  },
  
  // Versioning
  version: {
    type: Number,
    default: 1,
    index: true
  },
  
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  
  // Activation/Deactivation dates
  activatedAt: Date,
  deactivatedAt: Date,
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Change history
  changeLog: [{
    version: Number,
    changedAt: {
      type: Date,
      default: Date.now
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    changes: [{
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed
    }],
    reason: String
  }],
  
  // Tags for organization
  tags: [String],
  
  // Notes for administrators
  notes: String
  
}, {
  timestamps: true, // Adds createdAt, updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ===== INDEXES =====
permissionSchema.index({ model: 1, tenantId: 1, version: -1 });
permissionSchema.index({ model: 1, isActive: 1 });
permissionSchema.index({ 'fields.name': 1 });
permissionSchema.index({ tags: 1 });

// ===== VIRTUAL PROPERTIES =====
permissionSchema.virtual('isGlobal').get(function() {
  return !this.tenantId;
});

permissionSchema.virtual('fieldNames').get(function() {
  return this.fields.map(f => f.name);
});

// ===== INSTANCE METHODS =====
permissionSchema.methods.getField = function(fieldName) {
  return this.fields.find(f => f.name === fieldName);
};

permissionSchema.methods.getEditableFields = function(role, conditionContext) {
  return this.fields.filter(field => 
    field.editableBy.some(rule => 
      this.checkRule(rule, role, conditionContext)
    )
  );
};

permissionSchema.methods.checkRule = function(rule, role, context) {
  // Check role
  if (rule.role !== 'any' && rule.role !== role) {
    return false;
  }
  
  // Check condition
  switch (rule.condition) {
    case 'self':
      return context.isSelf === true;
    case 'same_tenant':
      return context.tenantId && context.tenantId === context.targetTenantId;
    case 'tenant_admin':
      return role === 'admin' && context.tenantId && context.tenantId === context.targetTenantId;
    case 'custom':
      // In production, you'd use a safe evaluator like vm2
      return rule.customCondition ? this.evaluateCondition(rule.customCondition, context) : false;
    case 'any':
    default:
      return true;
  }
};

permissionSchema.methods.evaluateCondition = function(condition, context) {
  // IMPORTANT: In production, use a safe sandbox like vm2
  // This is a simplified version
  try {
    const func = new Function('context', `return ${condition}`);
    return func(context);
  } catch (error) {
    console.error('Error evaluating condition:', error);
    return false;
  }
};

permissionSchema.methods.canPerformOperation = function(operation, role, context) {
  const op = this.operations.find(o => o.operation === operation);
  if (!op) return false;
  
  return op.allowed.some(rule => 
    this.checkRule(rule, role, context)
  );
};

permissionSchema.methods.toSafeConfig = function() {
  // Return a safe version for frontend (no server-side logic)
  return {
    model: this.model,
    fields: this.fields.map(field => ({
      name: field.name,
      label: field.label,
      labelAr: field.labelAr,
      type: field.type,
      validation: field.validation,
      ui: field.ui
    })),
    operations: this.operations.map(op => ({
      operation: op.operation,
      allowed: op.allowed.map(a => ({ role: a.role, condition: a.condition }))
    }))
  };
};

// ===== STATIC METHODS =====
permissionSchema.statics.findForModel = function(model, tenantId = null) {
  return this.findOne({
    model,
    tenantId: tenantId || null,
    isActive: true
  }).sort({ version: -1 });
};

permissionSchema.statics.createDefaultForModel = async function(model, createdBy = null) {
  const defaultPermissions = require('../config/defaultPermissions')[model];
  if (!defaultPermissions) {
    throw new Error(`No default permissions defined for model: ${model}`);
  }
  
  const permission = new this({
    model,
    ...defaultPermissions,
    createdBy,
    updatedBy: createdBy
  });
  
  return permission.save();
};

// ===== MIDDLEWARE =====
permissionSchema.pre('save', function(next) {
  // Update change log if version changes
  if (this.isModified() && !this.isNew) {
    if (!this.changeLog) this.changeLog = [];
    
    // Compare with previous version to log changes
    // (In real implementation, you'd diff the documents)
    
    this.updatedAt = new Date();
  }
  
  next();
});

// Create a new version when deactivating old one
permissionSchema.pre('save', async function(next) {
  if (this.isModified('isActive') && !this.isActive && this.isNew) {
    // Find and deactivate previous active version
    await this.constructor.updateMany(
      { model: this.model, tenantId: this.tenantId, isActive: true, _id: { $ne: this._id } },
      { isActive: false, deactivatedAt: new Date() }
    );
    
    this.activatedAt = new Date();
  }
  
  next();
});

module.exports = mongoose.model('PermissionSchema', permissionSchema);