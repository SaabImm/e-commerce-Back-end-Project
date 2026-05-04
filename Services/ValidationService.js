const ValidationSchema = require('../Models/ValidationSchemaModel');
const ValidationRequest = require('../Models/ValidationRequestModel');
const User = require('../Models/UsersModels');
const Cotisation = require('../Models/FeesModel');
const File = require('../Models/FilesModels');
const VersioningService = require('./VersioningService');
const FeeService = require('./FeeService');
const PermissionService = require('./PermissionService');
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
    if (user.role !== step.requiredRole) return false;
    if (step.allowedUserIds && step.allowedUserIds.length > 0) {
      const isAllowed = step.allowedUserIds.some(id => id.toString() === user._id.toString());
      if (!isAllowed) return false;
    }
    return true;
  }

  // ===================== CONDITION HELPERS =====================
  async _getTargetEntity(targetType, targetId) {
    let model;
    switch (targetType) {
      case 'User': model = User; break;
      case 'File': model = File; break;
      case 'Cotisation': model = Cotisation; break;
      default: throw new Error(`Unknown target type: ${targetType}`);
    }
    const entity = await model.findById(targetId);
    if (!entity) throw new Error(`Target entity not found: ${targetType} ${targetId}`);
    return entity;
  }

  async _evaluateSingleCondition(condition, target) {
    const { type, params } = condition;
    let satisfied = false;
    let message = '';
    switch (type) {
      case 'file_exists':
        const fileExists = await File.findOne({ user: target._id, folder: params.folder });
        satisfied = !!fileExists;
        if (!satisfied) message = `Fichier manquant dans le dossier: ${params.folder}`;
        break;
      case 'file_missing':
        const fileMissing = await File.findOne({ user: target._id, folder: params.folder });
        satisfied = !fileMissing;
        if (!satisfied) message = `Fichier présent dans le dossier: ${params.folder}`;
        break;
      case 'field_equals':
        let oldVal = target[params.field];
        let newVal = params.value;
        if (typeof oldVal === 'boolean') newVal = newVal === 'true' || newVal === true;
        else if (typeof oldVal === 'number') { newVal = Number(newVal); if (isNaN(newVal)) newVal = params.value; }
        else if (typeof oldVal === 'string') newVal = String(newVal);
        satisfied = oldVal === newVal;
        if (!satisfied) message = `Le champ "${params.field}" ne vaut pas "${params.value}"`;
        break;
      case 'field_exists':
        satisfied = target[params.field] !== undefined && target[params.field] !== null;
        if (!satisfied) message = `Le champ "${params.field}" n'existe pas`;
        break;
      case 'payment_status':
        const fee = await Cotisation.findOne({ user: target._id, feeType: params.feeType, year: params.year });
        if (!fee) {
          satisfied = false;
          message = `Aucune cotisation trouvée pour ${params.feeType} ${params.year}`;
        } else {
          const state = await FeeService.computeFeeState(fee._id);
          satisfied = state.status === (params.status || 'paid');
          if (!satisfied) message = `La cotisation ${params.feeType} ${params.year} n'est pas ${params.status || 'payée'}`;
        }
        break;
      case 'debt_zero':
        const fees = await Cotisation.find({ user: target._id, cancelled: false });
        let totalDebt = 0;
        for (const fee of fees) {
          const state = await FeeService.computeFeeState(fee._id);
          if (state.remaining > 0) totalDebt += state.remaining;
        }
        satisfied = totalDebt === 0;
        if (!satisfied) message = `L'utilisateur a une dette restante de ${totalDebt} DA`;
        break;
      default:
        satisfied = false;
        message = `Type de condition inconnu: ${type}`;
    }
    return { satisfied, message };
  }

  async _evaluateConditions(conditions, targetType, targetId) {
    if (!conditions || conditions.length === 0) return { success: true, message: null };
    const target = await this._getTargetEntity(targetType, targetId);
    for (const cond of conditions) {
      const { satisfied, message } = await this._evaluateSingleCondition(cond, target);
      if (!satisfied) return { success: false, message };
    }
    return { success: true, message: null };
  }

  async _reEvaluateRequestStatus(request) {
    const allFinished = request.steps.every(s => s.status === 'approved' || s.status === 'skipped');
    const anyRejected = request.steps.some(s => s.status === 'rejected' || s.status === 'expired');
    if (anyRejected) {
      request.status = 'rejected';
      await request.save();
      await this.finalizeValidation(request, 'rejected');
      return 'rejected';
    }
    if (allFinished) {
      request.status = 'approved';
      await request.save();
      await this.finalizeValidation(request, 'approved');
      return 'approved';
    }
    request.status = 'partial';
    await request.save();
    await this.notifyNextApprovers(request);
    return 'partial';
  }

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
        await this.finalizeValidation(request, 'rejected');
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
        let candidateUserIds = [];
        if (step.allowedUserIds && step.allowedUserIds.length > 0) {
          candidateUserIds = [...step.allowedUserIds];
        } else {
          const roleUsers = await User.find({ role: step.requiredRole }).select('_id');
          candidateUserIds = roleUsers.map(u => u._id);
        }
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
        await this.finalizeValidation(request, 'cancelled');
        break;

      case 'go_back':
        const previousStep = request.steps
          .filter(s => s.order < step.order && (s.status === 'approved' || s.status === 'skipped'))
          .sort((a, b) => b.order - a.order)[0];
        if (!previousStep) {
          request.status = 'rejected';
          await request.save();
          await this.finalizeValidation(request, 'rejected');
          break;
        }
        previousStep.status = 'pending';
        previousStep.pendingSince = new Date();
        previousStep.comments = (previousStep.comments ? previousStep.comments + '; ' : '') +
          `Réouvert par rejet de l'étape ${step.order}`;
        step.status = 'pending';
        step.comments = (reason ? reason + '; ' : '') + 'Action de retour déclenchée';
        request.status = 'partial';
        await request.save();
        await this.notifyNextApprovers(request);
        break;

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  // ===================== SCHEMA =====================
  async createValidationSchema(data, createdBy) {
      // Operation permission: create on ValidationSchema
      const canCreate = await PermissionService.canPerform(createdBy, null, 'create', 'Validation');
      if (!canCreate) throw new Error('Unauthorised to create validation schemas');

      const filter = { targetType: data.targetType, name: data.name, tenantId: data.tenantId || null };
      return await VersioningService.initializeFirstVersion(ValidationSchema, filter, { ...data, status: 'active' }, createdBy);
  }

  async createValidationSchema(data, createdBy) {
    const canCreate = await PermissionService.canPerform(createdBy, null, 'create', 'Validation');
    if (!canCreate) throw new Error('Unauthorised to create validation schemas');

    const creatable = await PermissionService.getCreatableFields(createdBy, null, 'Validation');
    const allowedFields = creatable.fields;
    const filteredData = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) filteredData[field] = data[field];
    }

    const filter = { targetType: filteredData.targetType, name: filteredData.name, tenantId: filteredData.tenantId || null };
    return await VersioningService.initializeFirstVersion(ValidationSchema, filter, { ...filteredData, status: 'active' }, createdBy);
  }

  async updateValidationSchema(schemaId, updates, userId, reason = '') {
    const canUpdate = await PermissionService.canPerform(userId, null, 'update', 'Validation');
    if (!canUpdate) throw new Error('Unauthorised to update validation schemas');

    const editable = await PermissionService.getEditableFields(userId, null, 'Validation');
    const allowedFields = editable.fields;
    const filteredUpdates = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) filteredUpdates[field] = updates[field];
    }

    const schema = await ValidationSchema.findById(schemaId);
    if (!schema) throw new Error('Schema not found');
    if (schema.isActive) {
      return await VersioningService.createNewVersion(ValidationSchema, schemaId, filteredUpdates, userId, { reason });
    } else {
      return await VersioningService.updateInactiveVersion(ValidationSchema, schemaId, filteredUpdates, userId, reason);
    }
  }

  async updateInactiveValidationSchema(schemaId, updates, userId, reason = '') {
    const canUpdate = await PermissionService.canPerform(userId, null, 'update', 'Validation');
    if (!canUpdate) throw new Error('Unauthorised to update inactive validation schemas');

    const editable = await PermissionService.getEditableFields(userId, null, 'Validation');
    const allowedFields = editable.fields;
    const filteredUpdates = {};
    for (const field of allowedFields) {
      if (updates[field] !== undefined) filteredUpdates[field] = updates[field];
    }

    return await VersioningService.updateInactiveVersion(ValidationSchema, schemaId, filteredUpdates, userId, reason);
  }

  async getActiveSchema(targetType, tenantId = null, name = null) {
    const canRead = await PermissionService.canPerform(null, null, 'read', 'Validation');
    if (!canRead) throw new Error('Unauthorised to read validation schemas');
    const filter = { targetType, isActive: true };
    if (tenantId) filter.tenantId = tenantId;
    if (name) filter.name = name;
    return await ValidationSchema.findOne(filter).sort({ version: -1 });
  }

  async getAllValidationSchemas(userId, targetType = null, includeInactive = false, tenantId = null) {
    const canRead = await PermissionService.canPerform(userId, null, 'read', 'Validation');
    if (!canRead) throw new Error('Unauthorised to list validation schemas');
    const filter = {};
    if (tenantId) filter.tenantId = tenantId;
    if (targetType) filter.targetType = targetType;
    if (!includeInactive) filter.isActive = true;
    return await ValidationSchema.find(filter).sort({ targetType: 1, name: 1, version: -1 });
  }

  async rollbackValidationSchema(schemaId, userId, options = {}) {
    const canUpdate = await PermissionService.canPerform(userId, null, 'update', 'Validation');
    if (!canUpdate) throw new Error('Unauthorised to rollback validation schema');
    const schema = await ValidationSchema.findById(schemaId);
    if (!schema) throw new Error('Validation schema not found');
    const familyFilter = { targetType: schema.targetType, name: schema.name };
    return await VersioningService.rollback(ValidationSchema, familyFilter, userId, options);
  }

  async reactivateValidationSchema(versionId, userId, options = {}) {
    const canUpdate = await PermissionService.canPerform(userId, null, 'update', 'Validation');
    if (!canUpdate) throw new Error('Unauthorised to reactivate validation schema');
    const version = await ValidationSchema.findById(versionId);
    if (!version) throw new Error('Validation schema version not found');
    const familyFilter = { targetType: version.targetType, name: version.name };
    return await VersioningService.reactivateVersion(ValidationSchema, familyFilter, versionId, userId, options);
  }

  // ===================== REQUEST =====================

  async createValidationRequest(targetId, targetType, schemaIdentifier, createdBy) {
    let schema;
    const isValidObjectId = mongoose.Types.ObjectId.isValid(schemaIdentifier);
    if (isValidObjectId) {
      schema = await ValidationSchema.findById(schemaIdentifier);
    } else {
      schema = await ValidationSchema.findOne({ targetType, name: schemaIdentifier, isActive: true }).sort({ version: -1 });
      if (!schema) schema = await ValidationSchema.findOne({ targetType, isActive: true }).sort({ version: -1 });
    }
    if (!schema) throw new Error('Validation schema not found');
    if (!schema.isActive) throw new Error('Schema is not active');

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
      approveConditions: step.approveConditions || [],
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
      request.expiresAt = new Date(Date.now() + schema.globalTimeout.duration * 1000); // seconds
    }
    await request.save();
    // await this.notifyNextApprovers(request, schema);
    return request;
  }

  async approveStep(requestId, stepOrder, userId, comments = '') {
    const { request, step, user } = await this._getRequestAndStep(requestId, stepOrder, userId, true);
    const isAuthorized = await this._checkPermission(request, step, user);
    if (!isAuthorized) throw new Error('Unauthorised to approve this step');

    if (step.approveConditions && step.approveConditions.length > 0) {
      const { success, message } = await this._evaluateConditions(step.approveConditions, request.targetType, request.targetId);
      if (!success) throw new Error(message);
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
    if (!isAuthorized) throw new Error('Unauthorised to reject this step');

    const action = step.rejectAction || 'reject_request';
    const escalateToRole = step.escalateToRole || 'admin';

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
    if (!isAuthorized) throw new Error('Unauthorised to skip this step');
    if (step.required) throw new Error('Cannot skip a required step.');
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
    const isCreator = request.createdBy.toString() === userId;
    const isAdmin = ['admin', 'super_admin'].includes(user.role);
    if (!isCreator && !isAdmin) throw new Error('Unauthorised to cancel this request');
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
    if (nextStep.allowedUserIds && nextStep.allowedUserIds.length > 0) {
      usersToNotify = await User.find({ _id: { $in: nextStep.allowedUserIds } });
    } else {
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
            action: schema.globalTimeout.action,
            escalateToRole: schema.globalTimeout.escalateToRole
          };
        }
      }
      if (!timeout || timeout.duration <= 0) continue;

      const pendingSince = step.pendingSince || request.createdAt;
      const secondsPassed = (Date.now() - pendingSince) / 1000;
      if (secondsPassed >= timeout.duration) {
        await this._applyAction(request, step, timeout.action, {
          userId: null,
          reason: `Timeout after ${timeout.duration} seconds`,
          escalateToRole: timeout.escalateToRole || step.escalateToRole,
          user: null
        });
        if (timeout.action === 'reject_step' || timeout.action === 'cancel_request') return;
      }
    }
  }

  async expireStaleRequests() {
    const pendingRequests = await ValidationRequest.find({ status: { $in: ['pending', 'partial'] } });
    for (const req of pendingRequests) await this.checkExpiration(req._id);
  }

  // ===================== FINALIZATION =====================
  async finalizeValidation(request, outcome) {
    const schema = await ValidationSchema.findById(request.validationSchemaId);
    if (!schema) return;

    const actionConfig = outcome === 'approved' ? schema.onApproval : schema.onRejection;
    if (!actionConfig || !actionConfig.action) return;

    switch (actionConfig.action) {
      case 'setField':
        const { field, value } = actionConfig.params;
        if (!field) break;
        let Model;
        switch (request.targetType) {
          case 'User': Model = User; break;
          case 'File': Model = File; break;
          case 'Cotisation': Model = Cotisation; break;
          default: return;
        }
        await Model.findByIdAndUpdate(request.targetId, { [field]: value });
        break;
      case 'callService':
        const { service, method, args = [] } = actionConfig.params;
        try {
          const Service = require(`./${service}`);
          await Service[method](...args);
        } catch (err) {
          console.error(`Failed to call service ${service}.${method}:`, err);
        }
        break;
      default:
        break;
    }
  }
}

module.exports = new ValidationService();