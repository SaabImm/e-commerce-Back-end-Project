// models/ValidationSchema.js
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
      'reject_request',   // default – stop and mark request rejected
      'escalate',         // escalate to a higher role (reset timer)
      'skip_step',        // skip this step, continue with next step
      'notify_only',      // send notification but keep step pending
      'wait_for_another', // add a new step for secondary approval
      'cancel_request'    //stop and cancel the request 
    ],
    default: 'reject_request'
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
globalRejectAction: {
  type: String,
  enum: ['reject_request', 'escalate', 'skip_step', 'notify_only', 'wait_for_another'],
  default: 'reject_request'
},
globalEscalateToRole: { type: String, enum: ['user', 'moderator', 'admin', 'super_admin'] },
globalSkipToStepOrder: { type: Number, default: null },
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