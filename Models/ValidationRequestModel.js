const mongoose = require('mongoose');

const validationRequestStepSchema = new mongoose.Schema({
  stepName: { type: String, required: true },
  requiredRole: { type: String, enum: ['user', 'moderator', 'admin', 'super_admin'] },
  allowedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }],
  order: { type: Number, required: true },
  required: { type: Boolean, default: true },
  isActive: { type: Boolean, default: false },
  timeout: {
    duration: { type: Number, default: 0 },
    action: { type: String, enum: ['reject_step', 'cancel_request', 'escalate'], default: 'reject_step' },
    escalateToRole: { type: String, enum: ['user', 'moderator', 'admin', 'super_admin'] }
  },
  rejectAction: {
    type: String,
    enum: [
      'reject_request',
      'escalate',
      'skip_step',
      'notify_only',
      'wait_for_another',
      'cancel_request',
      'go_back'  
    ],
    default: 'reject_request'
  },
  approveConditions: {
    type: [{
      type: { type: String, enum: [
        'file_exists', 
        'file_missing', 
        'field_equals', 
        'field_exists', 
        'payment_status', 
        'debt_zero'
      ], 
      required: true },
      params: { type: mongoose.Schema.Types.Mixed, default: {} },
    }],
      default: []
    },
  escalateToRole: { type: String, enum: ['user', 'moderator', 'admin', 'super_admin'], default: 'super_admin' },
  skipToStepOrder: { type: Number, default: null },
  customRejectAction: String,
  description: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired', 'skipped'], default: 'pending' },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  comments: String,
  pendingSince: { type: Date, default: Date.now }
}, { _id: false });

const validationRequestSchema = new mongoose.Schema({
  validationSchemaId: { type: mongoose.Schema.Types.ObjectId, ref: 'ValidationSchema', required: true },
  schemaVersion: { type: Number, required: true },
  targetType: { type: String, enum: ['User', 'File', 'Cotisation', 'Custom'], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'targetType' },
  status: { type: String, enum: ['pending', 'partial', 'approved', 'rejected', 'cancelled', 'expired'], default: 'pending' },
  steps: [validationRequestStepSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
  expiresAt: Date,
  cancelledAt: Date,
  cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectActionTaken: { type: Boolean, default: false }
}, { timestamps: true });

validationRequestSchema.index({ targetType: 1, targetId: 1 });
validationRequestSchema.index({ status: 1 });
validationRequestSchema.index({ validationSchemaId: 1 });
validationRequestSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('ValidationRequest', validationRequestSchema);