// services/ValidationService.js
const ValidationSchema = require('../Models/ValidationSchemaModel');
const ValidationRequest = require('../Models/ValidationRequestModel');
const User = require('../Models/UsersModels');
const VersioningService = require('./VersioningService');
const PermissionService = require('./PermissionService')
const { sendEmail } = require('../Middleware/sendEmail');
const mongoose = require('mongoose');


class ValidationService {
  // ===================== PRIVATE HELPERS =====================
  async _getRequestAndStep(requestId, stepOrder, userId, requirePending = true) {
    const request = await ValidationRequest.findById(requestId);
    if (!request) throw new Error('Request not found');
    if (['approved', 'rejected', 'expired', 'cancelled'].includes(request.status))
      throw new Error('Request already finalised');

    const stepIndex = request.steps.findIndex(s => s.order === stepOrder);
    if (stepIndex === -1) throw new Error('Step not found');
    const step = request.steps[stepIndex];
    if (requirePending && step.status !== 'pending') throw new Error('Step already processed');

    const firstPending = request.steps
      .filter(s => s.status === 'pending')
      .sort((a, b) => a.order - b.order)[0];
    if (firstPending && firstPending.order !== stepOrder)
      throw new Error('Cannot process this step out of order. Please process the next pending step first.');

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    return { request, step, stepIndex, user };
  }

  async _checkPermission(request, step, user) {
    // First check role
    if (user.role !== step.requiredRole) {
      return false;
    }
    // Role is OK – now check if a specific user list is defined
    if (step.allowedUserIds && step.allowedUserIds.length > 0) {
      const isAllowed = step.allowedUserIds.some(id => id.toString() === user._id.toString());
      if (!isAllowed) {
        return false;
      }
      
    }
    return true;
  }

  /**
   * Re‑evaluate the overall request status after a step change.
   * Finalises the request if approved or rejected.
   */
  async _reEvaluateRequestStatus(request) {
    const allFinished = request.steps.every(s => s.status === 'approved' || s.status === 'skipped');
    const anyRejected = request.steps.some(s => s.status === 'rejected' || s.status === 'expired');
    if (anyRejected) {
      request.status = 'rejected';
      await request.save();
      await this.finalizeValidation(request.targetType, request.targetId, 'rejected');
      return 'rejected';
    }
    if (allFinished) {
      request.status = 'approved';
      await request.save();
      await this.finalizeValidation(request.targetType, request.targetId, 'approved');
      return 'approved';
    }
    request.status = 'partial';
    await request.save();
    //await this.notifyNextApprovers(request);
    return 'partial';
  }

  /**
   * Central action processor for all actions (reject, timeout, skip, cancel, etc.)
   */

  async _escalateStep(request, step, newRole, reason, userId) {
    step.requiredRole = newRole;
    step.pendingSince = new Date();
    step.status = 'pending';
    step.rejectAction = 'reject_request';
    step.allowedUserIds = [];
    step.comments = (reason ? reason + '; ' : '') + `Escalated to ${newRole}`;
    await request.save();
    await this._reEvaluateRequestStatus(request);
  }

  async _applyAction(request, step, action, context) {
    const { userId, reason, escalateToRole, user } = context;

    switch (action) {
      case 'reject_request':
        request.status = 'rejected';
        await request.save();
        await this.finalizeValidation(request.targetType, request.targetId, 'rejected');
        break;

      case 'escalate':
        await this._escalateStep(request, step, escalateToRole || 'admin', reason, userId);
        break;

      case 'skip_step':
        await this.skipStep(request._id, step.order, userId, reason);
        break;

      case 'notify_only':
        step.status = 'pending';
        step.comments = (reason ? reason + '; ' : '') + 'Rejection noted, step remains pending';
        await request.save();
        await this.notifyRejectionOnly(request, step, userId);
        break;

      case 'wait_for_another':
        // Determine candidate user list
        let candidateUserIds = [];
        if (step.allowedUserIds && step.allowedUserIds.length > 0) {
          candidateUserIds = [...step.allowedUserIds];
        } else {
          const roleUsers = await User.find({ role: step.requiredRole }).select('_id');
          candidateUserIds = roleUsers.map(u => u._id);
        }
        // Remove the rejecting user
        const filteredUserIds = candidateUserIds.filter(id => id.toString() !== userId.toString());
        if (filteredUserIds.length === 0) {
          const nextRole = step.escalateToRole || 'admin';
          await this._escalateStep(request, step, nextRole, reason, userId);
          break;
        }
        const newStepOrder = step.order + 0.5;
        const newStep = {
          stepName: `Second opinion: ${step.stepName}`,
          requiredRole: step.requiredRole,
          allowedUserIds: filteredUserIds,
          order: newStepOrder,
          status: 'pending',
          pendingSince: new Date(),
          comments: `Created after rejection by ${user?.name || 'system'}`,
          rejectAction: 'reject_request',
          required: true
        };
        request.steps.push(newStep);
        request.steps.sort((a, b) => a.order - b.order);
        step.status = 'skipped';
        await request.save();
        await this._reEvaluateRequestStatus(request);
        break;

      case 'reject_step':
        step.status = 'expired';
        step.approvedAt = new Date();
        step.comments = reason || step.comments;
        await request.save();
        await this._reEvaluateRequestStatus(request);
        break;

      case 'cancel_request':
        request.status = 'cancelled';
        request.cancelledAt = new Date();
        request.cancelledBy = userId || null;
        await request.save();
        await this.finalizeValidation(request.targetType, request.targetId, 'cancelled');
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
  // ===================== SCHEMA =====================

  async createValidationSchema(data, createdBy) {
    const filter = { targetType: data.targetType, name: data.name, tenantId: data.tenantId || null };
    return await VersioningService.initializeFirstVersion(
      ValidationSchema,
      filter,
      { ...data, status: 'active' },
      createdBy
    );
  }

  async updateValidationSchema(schemaId, updates, userId, reason = '') {
    const schema = await ValidationSchema.findById(schemaId);
    if (!schema) throw new Error('Schema not found');
    if (schema.isActive) {
      return await VersioningService.createNewVersion(ValidationSchema, schemaId, updates, userId, { reason });
    } else {
      return await VersioningService.updateInactiveVersion(ValidationSchema, schemaId, updates, userId, reason);
    }
  }

  async createNewValidationVersion(schemaId, updates, userId, reason = '') {
    return await VersioningService.createNewVersion(ValidationSchema, schemaId, updates, userId, { reason });
  }

  async updateInactiveValidationSchema(schemaId, updates, userId, reason = '') {
    return await VersioningService.updateInactiveVersion(ValidationSchema, schemaId, updates, userId, reason);
  }

  async getActiveSchema(targetType, tenantId = null, name = null) {
    const filter = { targetType, isActive: true };
    if (tenantId) filter.tenantId = tenantId;
    if (name) filter.name = name;
    return await ValidationSchema.findOne(filter).sort({ version: -1 });
  }

  async getAllValidationSchemas(targetType = null, includeInactive = false, tenantId = null) {
    const filter = {};
    if (tenantId) filter.tenantId = tenantId;
    if (targetType) filter.targetType = targetType;
    if (!includeInactive) filter.isActive = true;
    return await ValidationSchema.find(filter).sort({ targetType: 1, name: 1, version: -1 });
  }

  async rollbackValidationSchema(schemaId, userId, options = {}) {
    const schema = await ValidationSchema.findById(schemaId);
    if (!schema) throw new Error('Validation schema not found');
    const familyFilter = { targetType: schema.targetType, name: schema.name };
    return await VersioningService.rollback(ValidationSchema, familyFilter, userId, options);
  }

  async reactivateValidationSchema(versionId, userId, options = {}) {
    const version = await ValidationSchema.findById(versionId);
    if (!version) throw new Error('Validation schema version not found');
    const familyFilter = { targetType: version.targetType, name: version.name };
    return await VersioningService.reactivateVersion(ValidationSchema, familyFilter, versionId, userId, options);
  }

  // ===================== REQUEST =====================


  async createValidationRequest(targetId, targetType, schemaIdentifier, createdBy) {
    let schema;

    // Check if schemaIdentifier is a valid ObjectId
    const isValidObjectId = mongoose.Types.ObjectId.isValid(schemaIdentifier);
    if (isValidObjectId) {
      schema = await ValidationSchema.findById(schemaIdentifier);
    } else {
      // Treat as schema name – find latest active schema for this targetType
      schema = await ValidationSchema.findOne({
        targetType,
        name: schemaIdentifier,
        isActive: true
      }).sort({ version: -1 });
      if (!schema) {
        // Fallback: any active schema for this targetType
        schema = await ValidationSchema.findOne({
          targetType,
          isActive: true
        }).sort({ version: -1 });
      }
    }
    if (!schema) throw new Error('Validation schema not found');
    if (!schema.isActive) throw new Error('Schema is not active');

    // Check if a request already exists for this target and schema
    const existing = await ValidationRequest.findOne({ targetId, targetType, validationSchemaId: schema._id });
    if (existing && ['pending', 'partial'].includes(existing.status)) {
      throw new Error('A validation request already exists for this target');
    }

    const steps = schema.steps.map(step => ({
      stepName: step.stepName,
      requiredRole: step.requiredRole,
      allowedUserIds: step.allowedUserIds || [],
      order: step.order,
      required: step.required !== false,
      timeout: step.timeout ? {
        duration: step.timeout.duration || 0,
        action: step.timeout.action || 'reject_request',
        escalateToRole: step.timeout.escalateToRole || 'admin'
      } : { duration: 0, action: 'reject_request', escalateToRole: 'admin' },
      rejectAction: step.rejectAction || 'reject_request',
      escalateToRole: step.escalateToRole || 'admin',
      skipToStepOrder: step.skipToStepOrder || null,
      customRejectAction: step.customRejectAction || null,
      description: step.description || '',
      pendingSince: new Date(),
      status: 'pending'
    }));

    const request = new ValidationRequest({
      validationSchemaId: schema._id,
      schemaVersion: schema.version,
      targetType,
      targetId,
      steps,
      status: 'pending',
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    if (schema.globalTimeout && schema.globalTimeout.duration > 0) {
      request.expiresAt = new Date(Date.now() + schema.globalTimeout.duration * 60 * 60 * 1000);
    }

    await request.save();
    return request;
  }

  async approveStep(requestId, stepOrder, userId, comments = '') {
    const { request, step, user } = await this._getRequestAndStep(requestId, stepOrder, userId, true);
    const isAuthorized = await this._checkPermission(request, step, user);
      if (!isAuthorized) {
        throw new Error('Unauthorised to approve this step');
      }
    step.status = 'approved';
    step.approvedBy = userId;
    step.approvedAt = new Date();
    step.comments = comments;
    request.updatedAt = new Date();
    await request.save();
    await this._reEvaluateRequestStatus(request);
    return request;
  }

  async rejectStep(requestId, stepOrder, userId, reason = '') {
    const { request, step, user } = await this._getRequestAndStep(requestId, stepOrder, userId, true);
      const isAuthorized = await this._checkPermission(request, step, user);
  if (!isAuthorized) {
    throw new Error('Unauthorised to reject this step');
  }

    const action = step.rejectAction || 'reject_request';
    const escalateToRole = step.escalateToRole || 'admin';

    // Record rejection before applying action
    step.status = 'rejected';
    step.approvedBy = userId;
    step.approvedAt = new Date();
    step.comments = reason;
    request.updatedAt = new Date();

    await this._applyAction(request, step, action, { userId, reason, escalateToRole, user });
    return request;
  }

  async skipStep(requestId, stepOrder, userId, reason = '') {
    const { request, step, user } = await this._getRequestAndStep(requestId, stepOrder, userId, true);
    const isAuthorized = await this._checkPermission(request, step, user);
    if (!isAuthorized) {
      throw new Error('Unauthorised to skip this step');
    }
    if (step.required)
      throw new Error('Cannot skip a required step. The step must be approved or the request rejected.');
    step.status = 'skipped';
    step.approvedBy = userId;
    step.approvedAt = new Date();
    step.comments = reason || 'Step skipped by admin';
    request.updatedAt = new Date();
    await request.save();
    await this._reEvaluateRequestStatus(request);
    return request;
  }

  async cancelValidationRequest(requestId, userId, reason = '') {
    const request = await ValidationRequest.findById(requestId);
    if (!request) throw new Error('Request not found');
    if (['approved', 'rejected', 'expired', 'cancelled'].includes(request.status))
      throw new Error('Request already finalised');

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Permission: only the creator, an admin, or a super_admin can cancel
    const isCreator = request.createdBy.toString() === userId;
    const isAdmin = ['admin', 'super_admin'].includes(user.role);
    if (!isCreator && !isAdmin) {
      throw new Error('Unauthorised to cancel this request');
    }

    await this._applyAction(request, null, 'cancel_request', { userId, reason, user: null });
    return request;
  }

  // ===================== NOTIFICATIONS =====================

  async notifyNextApprovers(request, schema = null) {
    const nextStep = request.steps.find(s => s.status === 'pending');
    if (!nextStep) return;
    if (!schema) schema = await ValidationSchema.findById(request.validationSchemaId);
    const notificationMethods = schema?.notificationConfig?.methods || { email: true, system: false };
    let usersToNotify = [];

    // If allowedUserIds is defined and non-empty, only those users
    if (nextStep.allowedUserIds && nextStep.allowedUserIds.length > 0) {
      usersToNotify = await User.find({ _id: { $in: nextStep.allowedUserIds } });
    } else {
      // Otherwise, notify all users with the required role
      usersToNotify = await User.find({ role: nextStep.requiredRole });
    }

    for (const user of usersToNotify) {
      if (notificationMethods.email) {
        await sendEmail({
          to: user.email,
          subject: `Validation required: ${request.targetType}`,
          html: `<p>Bonjour ${user.name},</p><p>A validation request for ${request.targetType} is pending your approval.</p>`
        });
      }
      // In-app notification placeholder
    }
  }

  async notifyRejectionOnly(request, step, userId) {
    let usersToNotify = [];
    if (step.allowedUserIds && step.allowedUserIds.length > 0) {
      usersToNotify = await User.find({ _id: { $in: step.allowedUserIds } });
    } else {
      usersToNotify = await User.find({ role: step.requiredRole });
    }
    for (const user of usersToNotify) {
      await sendEmail({
        to: user.email,
        subject: `Rejection noted for ${request.targetType}`,
        html: `<p>Bonjour ${user.name},</p><p>A rejection comment was added to step "${step.stepName}" but the step remains pending.</p><p>Comment: ${step.comments}</p>`
      });
    }
  }

  async notifyRequestRejected(request, reason) { 
    let targetUser = null;
    if (request.targetType === 'User') {
      targetUser = await User.findById(request.targetId);
    } else if (request.targetType === 'File') {
      const File = require('../Models/FilesModels');
      const file = await File.findById(request.targetId);
      if (file) targetUser = await User.findById(file.user);
    }
    if (targetUser && targetUser.email) {
      await sendEmail({
        to: targetUser.email,
        subject: 'Validation request rejected',
        html: `<p>Your ${request.targetType} validation request has been rejected.</p><p>Reason: ${reason || 'No reason provided'}</p>`
      });
    }
  }

  async notifyRequestCancelled(request, reason) {
    let targetUser = null;
    if (request.targetType === 'User') {
      targetUser = await User.findById(request.targetId);
    } else if (request.targetType === 'File') {
      const File = require('../Models/FilesModels');
      const file = await File.findById(request.targetId);
      if (file) targetUser = await User.findById(file.user);
    }
    if (targetUser && targetUser.email) {
      await sendEmail({
        to: targetUser.email,
        subject: 'Validation request cancelled',
        html: `<p>Your ${request.targetType} validation request has been cancelled.</p><p>Reason: ${reason || 'No reason provided'}</p>`
      });
    }
  }

  // ===================== EXPIRATION =====================

  async checkExpiration(requestId) {
    const request = await ValidationRequest.findById(requestId);
    if (!request) throw new Error('Request not found');
    if (!['pending', 'partial'].includes(request.status)) return;

    for (const step of request.steps) {
      if (step.status !== 'pending') continue;

      let timeout = step.timeout;
      if (!timeout || timeout.duration === 0) {
        const schema = await ValidationSchema.findById(request.validationSchemaId);
        if (schema && schema.globalTimeout && schema.globalTimeout.duration > 0) {
          timeout = {
            duration: schema.globalTimeout.duration,
            action: schema.globalTimeout.action, // now 'reject_step', 'cancel_request', or 'escalate'
            escalateToRole: schema.globalTimeout.escalateToRole
          };
        }
      }
      if (!timeout || timeout.duration <= 0) continue;

      const pendingSince = step.pendingSince || request.createdAt;
      const hoursPassed = (Date.now() - pendingSince) / (1000);
      if (hoursPassed >= timeout.duration) {
        await this._applyAction(request, step, timeout.action, {
          userId: null,
          reason: `Timeout after ${timeout.duration} hours`,
          escalateToRole: timeout.escalateToRole || step.escalateToRole,
          user: null
        });
        // If the action finalises the request, stop processing further steps
        if (timeout.action === 'reject_step' || timeout.action === 'cancel_request') return;
      }
    }
  }

  async expireStaleRequests() {
    const pendingRequests = await ValidationRequest.find({
      status: { $in: ['pending', 'partial'] }
    });
    for (const req of pendingRequests) {
      await this.checkExpiration(req._id);
    }
  }

  // ===================== FINALIZATION =====================

  async finalizeValidation(targetType, targetId, outcome) {
    if (targetType === 'User') {
      if (outcome === 'approved') {
        await User.findByIdAndUpdate(targetId, { isAdminVerified: true });
      } else if (outcome === 'rejected') {
        await User.findByIdAndUpdate(targetId, { isAdminVerified: false });
      }
    } else if (targetType === 'File') {
      const File = require('../Models/FilesModels');
      await File.findByIdAndUpdate(targetId, { verified: outcome === 'approved' });
    }
  }
}

module.exports = new ValidationService();