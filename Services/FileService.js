// services/FileService.js
const cloudinary = require('../Config/claudinary');
const streamifier = require('streamifier');
const File = require('../Models/FilesModels');
const User = require('../Models/UsersModels');
const PermissionService = require('./PermissionService');
const ValidationService = require('./ValidationService')
  // Configuration: which folders trigger validation and which schema to use
    const VALIDATION_MAP = {
    'uploads': 'Document verification for official records',
    // add other folder names as needed, e.g.:
    // 'id_documents': 'Identity document verification',
    };
class FileService {
  /**
   * Upload a new file for a user
   * @param {string} userId - Owner of the file
   * @param {string} viewerId - Current user performing the action
   * @param {Buffer} fileBuffer - Raw file buffer
   * @param {string} originalName - Original file name
   * @param {string} folder - Destination folder (default 'misc')
   * @returns {Promise<Object>} - { file, updatedUser }
   */
  async uploadFile(userId, viewerId, fileBuffer, originalName, folder = 'misc') {
      // Permission check
      const canUpload = await PermissionService.canPerform(viewerId, userId, 'create', 'File');
      if (!canUpload) throw new Error('Unauthorized');

      // Upload to Cloudinary
      const result = await this._uploadToCloudinary(fileBuffer, `${folder}/${userId}`);
      const { secure_url, public_id, format } = result;

      // Create file record
      const newFile = new File({
      url: secure_url,
      fileName: originalName,
      type: format,
      folder,
      fileId: public_id,
      owner: userId
      });
      const savedFile = await newFile.save();

      // Update user's files array
      const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $push: { files: savedFile._id } },
      { new: true }
      ).populate('files').populate('fees');

      // Create validation request if the folder matches a configured rule
      const schemaName = VALIDATION_MAP[folder];
      if (schemaName) {
      try {
          await ValidationService.createValidationRequest(
          savedFile._id,
          'File',
          schemaName,
          viewerId
          );
      } catch (err) {
          console.error(`Failed to create validation request for file ${savedFile._id}:`, err);
          // Do not block the upload; just log the error
      }
      }

      return { file: savedFile, user: updatedUser };
  }

  
  /**
   * Replace an existing file with a new one
   * @param {string} fileId - ID of the file to replace
   * @param {string} viewerId - Current user
   * @param {Buffer} fileBuffer - New file buffer
   * @param {string} originalName - New file name
   * @param {string} folder - Destination folder (optional, keeps old folder if not provided)
   * @returns {Promise<Object>} - { file, updatedUser }
   */
  async replaceFile(fileId, viewerId, fileBuffer, originalName, folder = null) {
    const oldFile = await File.findById(fileId);
    if (!oldFile) throw new Error('File not found');

    const canUpdate = await PermissionService.canPerform(viewerId, oldFile.owner, 'update', 'File');
    if (!canUpdate) throw new Error('Unauthorized');

    const targetFolder = folder || oldFile.folder;
    const result = await this._uploadToCloudinary(fileBuffer, `${targetFolder}/${oldFile.owner}`);
    const { secure_url, public_id, format } = result;

    // Create new file record before deleting the old one (to avoid data loss)
    const newFileDoc = new File({
      url: secure_url,
      fileName: originalName,
      type: format,
      folder: targetFolder,
      fileId: public_id,
      owner: oldFile.owner
    });
    const savedFile = await newFileDoc.save();

    // Update user's files array: replace old file ID with new one
    await User.updateOne(
      { _id: oldFile.owner, files: oldFile._id },
      { $set: { 'files.$': savedFile._id } }
    );

    // Now safely delete old file from Cloudinary and DB
    await cloudinary.uploader.destroy(oldFile.fileId);
    await File.findByIdAndDelete(fileId);

    const updatedUser = await User.findById(oldFile.owner).populate('files').populate('fees');
    return { file: savedFile, user: updatedUser };
  }

  /**
   * Delete a single file
   * @param {string} fileId - File ID
   * @param {string} viewerId - Current user
   * @returns {Promise<Object>} - { updatedUser }
   */
  async deleteFile(fileId, viewerId) {
    const file = await File.findById(fileId);
    if (!file) throw new Error('File not found');

    const canDelete = await PermissionService.canPerform(viewerId, file.owner, 'delete', 'File');
    if (!canDelete) throw new Error('Unauthorized');

    // Delete from Cloudinary
    const cloudRes = await cloudinary.uploader.destroy(file.fileId);
    if (cloudRes.result !== 'ok') throw new Error('Cloudinary deletion failed');

    // Remove file reference from user
    const updatedUser = await User.findByIdAndUpdate(
      file.owner,
      { $pull: { files: file._id } },
      { new: true }
    ).populate('files').populate('fees');

    // Delete from database
    await File.findByIdAndDelete(fileId);

    return { updatedUser };
  }

  /**
   * Delete all files belonging to a user
   * @param {string} userId - Owner of the files
   * @param {string} viewerId - Current user (admin or the user themselves)
   * @returns {Promise<Object>} - { deletedCount, updatedUser }
   */
  async clearUserFiles(userId, viewerId) {
    // Permission: user can only clear their own files, admin can clear any
    if (userId !== viewerId) {
      const canClear = await PermissionService.canPerform(viewerId, userId, 'delete', 'File');
      if (!canClear) throw new Error('Unauthorized');
    }

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const files = await File.find({ owner: userId });
    for (const file of files) {
      if (file.fileId) await cloudinary.uploader.destroy(file.fileId);
    }
    await File.deleteMany({ owner: userId });

    user.files = [];
    await user.save();

    const updatedUser = await User.findById(userId).populate('files').populate('fees');
    return { deletedCount: files.length, user: updatedUser };
  }

  /**
   * Get a file by ID with permission check
   * @param {string} fileId - File ID
   * @param {string} viewerId - Current user
   * @returns {Promise<Object>} - File document
   */
  async getFileById(fileId, viewerId) {
    const file = await File.findById(fileId);
    if (!file) throw new Error('File not found');

    const canRead = await PermissionService.canPerform(viewerId, file.owner, 'read', 'File');
    if (!canRead) throw new Error('Unauthorized');

    return file;
  }

  // ---- Private helper ----
  async _uploadToCloudinary(fileBuffer, folderPath) {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: folderPath },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      streamifier.createReadStream(fileBuffer).pipe(uploadStream);
    });
  }
}

module.exports = new FileService();