// services/UserService.js
const User = require('../Models/UsersModels');
const File = require('../Models/FilesModels');
const Cotisation = require('../Models/FeesModel');
const Payment = require('../Models/PayementModel');
const FeeDefinition = require('../Models/FeeDefinition');
const cloudinary = require('../Config/claudinary');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const PermissionService = require('./PermissionService');
const ValidationSchema= require('../Models/ValidationSchemaModel')
const ValidationService= require('../Services/ValidationService')
const FeeService = require('./FeeService'); 
const { filterAllowedUpdates } = require('../Helpers/Utils/ControllerHelpers');

class UserService {
  /**
   * Get all users filtered by viewer's read permission
   */
  async getAllUsers(viewerId) {
    const allUsers = await User.find().populate('fees');
    const permissions = await Promise.all(
      allUsers.map(user => PermissionService.canPerform(viewerId, user._id, "read", 'User'))
    );
    return allUsers.filter((_, idx) => permissions[idx]);
  }

  /**
   * Get a single user by ID, with permission check
   */
  async getUserById(viewerId, targetId) {
    const targetUser = await User.findById(targetId).populate('files fees');
    if (!targetUser) throw new Error('User not found');
    const canRead = await PermissionService.canPerform(viewerId, targetId, "read", 'User');
    if (!canRead) throw new Error('Unauthorised');
    return targetUser;
  }

  /**
   * Create a new user with auto‑created cotisations
   */
  async createUser(viewerId, userData, plainPassword, validationSchemaName = 'Admin approval for new users') {
    if (!plainPassword) throw new Error('Password required');

    // Permission check
    const canCreate = await PermissionService.canPerform(viewerId, viewerId, "create", 'User');
    if (!canCreate) throw new Error('Unauthorised operation');

    // Get creatable fields
    const creatable = await PermissionService.getCreatableFields(viewerId, viewerId, 'User');
    const allowedFields = creatable.fields;
    const filteredData = filterAllowedUpdates(userData, allowedFields);

    // Hash password
    filteredData.password = await bcrypt.hash(plainPassword, 10);

    // Duplicate checks
    if (filteredData.email) {
      const existing = await User.findOne({ email: filteredData.email });
      if (existing) throw new Error('Email already exists');
    }
    if (filteredData.registrationNumber) {
      const existing = await User.findOne({ registrationNumber: filteredData.registrationNumber });
      if (existing) throw new Error('Registration Number already exists');
    }

    filteredData.createdBy = viewerId;
    filteredData.isAdminVerified = false;
    const savedUser = await new User(filteredData).save();

    // Auto‑create cotisations
    const startYear = savedUser.startDate ? savedUser.startDate.getFullYear() : new Date().getFullYear();
    const currentYear = new Date().getFullYear();
    
    const definitions = await FeeDefinition.find({
      year: { $gte: startYear, $lte: currentYear },
      isActive: true
    }).sort({ year: 1, feeType: 1 });

    for (const def of definitions) {
      const existing = await Cotisation.findOne({
        user: savedUser._id,
        year: def.year,
        feeType: def.feeType
      });
      if (existing) continue;
      const cotisation = new Cotisation({
        user: savedUser._id,
        feeDefinition: def._id,
        year: def.year,
        amount: def.amount,
        dueDate: def.dueDate,
        feeType: def.feeType,
        penaltyConfig: def.penaltyConfig,
        notes: `Cotisation automatique à la création du compte (${def.title})`,
        createdBy: viewerId,
        cancelled: false
      });
      await cotisation.save();
      savedUser.fees = savedUser.fees || [];
      savedUser.fees.push(cotisation._id);
    }
    await savedUser.save();

    // Choose validation schema name based on the role being created
    let finalSchemaName = validationSchemaName;
    if (filteredData.role === 'admin') {
      finalSchemaName = 'Validation des nouveaux Administrateurs';
    } else if (filteredData.role === 'moderator') {
      finalSchemaName = 'Validation des nouveaux Administrateurs';
    }

    // Create validation request
    try {
      await ValidationService.createValidationRequest(
        savedUser._id,
        'User',
        finalSchemaName,
        viewerId
      );
    } catch (err) {
      console.error('Failed to create validation request for user:', err);
    }

    return savedUser;
  }
  /**
   * Update a user – only allowed fields, requires viewer's password confirmation
   */
  async updateUser(viewerId, targetId, updates, viewerPassword) {
    const targetUser = await User.findById(targetId);
    if (!targetUser) throw new Error('Target user not found');

    const canUpdate = await PermissionService.canPerform(viewerId, targetId, "update", 'User');
    if (!canUpdate) throw new Error('Unauthorised operation');

    // Password confirmation (viewer's password)
    const viewer = await User.findById(viewerId).select('+password');
    if (!viewer) throw new Error('Viewer not found');
    const isMatch = await bcrypt.compare(viewerPassword, viewer.password);
    if (!isMatch) throw new Error('Wrong password');

    // Get editable fields
    const editable = await PermissionService.getEditableFields(viewerId, targetId, 'User');
    const allowedFields = editable.permissions.canUpdate;
    if (allowedFields.length === 0) throw new Error('No fields to update');

    const filteredUpdates = filterAllowedUpdates(updates, allowedFields);
    Object.assign(targetUser, filteredUpdates);
    targetUser.updatedBy = viewerId;
    const updatedUser = await targetUser.save();

    // Generate new token (because role might have changed)
    const token = jwt.sign(
      { id: updatedUser._id, role: updatedUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "15h" }
    );
    return { user: updatedUser, token };
  }

  /**
   * Delete a user and all associated data (files, cotisations, payments)
   */
  async deleteUser(viewerId, targetId) {
    const canDelete = await PermissionService.canPerform(viewerId, targetId, "delete", 'User');
    if (!canDelete) throw new Error('Unauthorised operation');

    const user = await User.findById(targetId).populate('files');
    if (!user) throw new Error('User not found');

    // Delete files from Cloudinary and DB
    for (const file of user.files || []) {
      if (file.fileId) await cloudinary.uploader.destroy(file.fileId).catch(e => console.error(e));
      await File.findByIdAndDelete(file._id);
    }
    await Cotisation.deleteMany({ user: targetId });
    await Payment.deleteMany({ user: targetId });
    await User.findByIdAndDelete(targetId);
    return user.email;
  }

  /**
   * Delete all users (super_admin only)
   */
  async deleteAllUsers(viewerId) {
    const viewer = await User.findById(viewerId);
    if (!viewer || viewer.role !== 'super_admin') throw new Error('Only super_admin can delete all users');
    const count = await User.countDocuments();
    if (count === 0) throw new Error('No users found');
    await User.deleteMany({});
    return count;
  }

  /**
   * Reset password – requires current password and respects 24h cooldown
   */
  async resetPassword(viewerId, targetId, currentPassword, newPassword) {
    const canUpdate = await PermissionService.canPerform(viewerId, targetId, "update", 'User');
    if (!canUpdate) throw new Error('Unauthorised operation');

    const user = await User.findById(targetId).select('+password');
    if (!user) throw new Error('User not found');

    if (user.passwordChangedAt) {
      const hoursSince = (Date.now() - user.passwordChangedAt) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        const remaining = Math.ceil(24 - hoursSince);
        throw new Error(`Password change limit: try again in ${remaining} hour(s)`);
      }
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) throw new Error('Current password incorrect');

    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordChangedAt = new Date();
    await user.save();

    const userResponse = user.toObject();
    delete userResponse.password;
    return userResponse;
  }

  /**
   * Validate a user (set isAdminVerified = true)
   */
  async validateUser(viewerId, targetId) {
    const canUpdate = await PermissionService.canPerform(viewerId, targetId, "update", 'User');
    if (!canUpdate) throw new Error('Unauthorised operation');

    const user = await User.findById(targetId);
    if (!user) throw new Error('User not found');
    if (user.isAdminVerified) throw new Error('User already verified');
    user.isAdminVerified = true;
    await user.save();
    return user;
  }

  /**
   * Get users by role (only admin and super_admin can access)
   */
  async getUsersByRole(viewerId, role) {
    const viewer = await User.findById(viewerId);
    if (!viewer || !['admin', 'super_admin'].includes(viewer.role))
      throw new Error('Unauthorised');
    const validRoles = ['user', 'moderator', 'admin', 'super_admin'];
    if (!validRoles.includes(role)) throw new Error('Invalid role');
    const users = await User.find({ role });
    if (!users.length) throw new Error('No users with this role');
    return users;
  }

  /**
   * Get user statistics (admin only)
   */
  async getUserStats(viewerId) {
    const viewer = await User.findById(viewerId);
    if (!viewer || !['admin', 'super_admin'].includes(viewer.role))
      throw new Error('Unauthorised');

    const totalUsers = await User.countDocuments();
    const byRole = await User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    const byWilaya = await User.aggregate([
      { $match: { wilaya: { $ne: null } } },
      { $group: { _id: '$wilaya', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    const byProfession = await User.aggregate([
      { $match: { profession: { $ne: null } } },
      { $group: { _id: '$profession', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    const byVerification = await User.aggregate([
      {
        $group: {
          _id: null,
          verified: { $sum: { $cond: ['$isVerified', 1, 0] } },
          notVerified: { $sum: { $cond: ['$isVerified', 0, 1] } },
          adminVerified: { $sum: { $cond: ['$isAdminVerified', 1, 0] } },
          notAdminVerified: { $sum: { $cond: ['$isAdminVerified', 0, 1] } }
        }
      }
    ]);
    const byStatus = await User.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newUsers = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });
    const bySexe = await User.aggregate([
      { $match: { Sexe: { $ne: null } } },
      { $group: { _id: '$Sexe', count: { $sum: 1 } } }
    ]);

    return {
      totalUsers,
      byRole,
      byWilaya,
      byProfession,
      byVerification: byVerification[0] || { verified: 0, notVerified: 0, adminVerified: 0, notAdminVerified: 0 },
      byStatus,
      newUsers,
      bySexe
    };
  }
}

module.exports = new UserService();