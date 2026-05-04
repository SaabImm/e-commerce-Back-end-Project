const mongoose = require('mongoose');

const validationStepDefinitionSchema = new mongoose.Schema({
  stepName: { type: String, required: true },
  requiredRole: {
    type: String,
    enum: ['user', 'moderator', 'admin', 'super_admin'],
    required: true
  },
  allowedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }],
  order: { type: Number, required: true },
  required: { type: Boolean, default: true },
  timeout: {
    duration: { type: Number, default: 0 },
    action: {
      type: String,
      enum: ['reject_step', 'cancel_request', 'escalate'],
      default: 'reject_step'
    },
    escalateToRole: { type: String, enum: ['user', 'moderator', 'admin', 'super_admin'] }
  },
  rejectAction: {
    type: String,
    enum: [
      'reject_request', 'escalate', 'skip_step', 'notify_only',
      'wait_for_another', 'cancel_request', 'go_back'
    ],
    default: 'reject_request'
  },
  approveConditions: {
    type: [{
      type: { type: String, enum: [
        'file_exists', 'file_missing', 'field_equals', 'field_exists',
        'payment_status', 'debt_zero'
      ], required: true },
      params: { type: mongoose.Schema.Types.Mixed, default: {} },
    }],
    default: []
  },
  escalateToRole: { type: String, enum: ['user', 'moderator', 'admin', 'super_admin'], default: 'super_admin' },
  skipToStepOrder: { type: Number, default: null },
  customRejectAction: String,
  description: String,
}, { _id: false });

const validationSchema = new mongoose.Schema({
  targetType: { type: String, enum: ['User', 'File', 'Cotisation', 'Custom'], required: true, index: true },
  name: { type: String, required: true },
  description: String,
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null, index: true },
  version: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true, index: true },
  status: { type: String, enum: ['active', 'flawed', 'archived', 'stable'], default: 'active' },
  steps: [validationStepDefinitionSchema],
  globalTimeout: {
    duration: { type: Number, default: 0 },
    action: { type: String, enum: ['reject', 'cancel'], default: 'reject' }
  },
  onApproval: {
    type: {
      action: { type: String, enum: ['setField', 'callService', 'sendEmail'], default: 'setField' },
      params: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    default: {}
  },
  onRejection: {
    type: {
      action: { type: String, enum: ['setField', 'callService', 'sendEmail'], default: 'setField' },
      params: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    default: {}
  },
  notificationConfig: {
    methods: {
      email: { type: Boolean, default: true },
      system: { type: Boolean, default: false }
    },
    emailTemplate: String
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  changeLog: [{
    version: Number,
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changes: [{
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed
    }],
    reason: String
  }]
}, { timestamps: true });

validationSchema.index({ targetType: 1, tenantId: 1, isActive: 1, version: -1 });
module.exports = mongoose.model('ValidationSchema', validationSchema);