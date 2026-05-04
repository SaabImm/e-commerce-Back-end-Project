// controllers/FileController.js
const FileService = require('../Services/FileService');


exports.uploadFile = async (req, res) => {
  try {
    const userId = req.params.id || req.params._id;
    const viewerId = req.user._id;
    const folder = req.body.folder || 'misc';
    const file = req.file;
    if (!file) return res.status(400).json({ message: 'No file uploaded' });

    const result = await FileService.uploadFile(
      userId,
      viewerId,
      file.buffer,
      file.originalname,
      folder
    );
    res.status(201).json({
      message: 'File uploaded successfully',
      file: result.file,
      user: result.user
    });
  } catch (err) {
    if (err.message === 'Unauthorized') return res.status(403).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.replaceFile = async (req, res) => {
  try {
    const fileId = req.params.id;
    const viewerId = req.user._id;
    const folder = req.body.folder || null;
    const newFile = req.file;
    if (!newFile) return res.status(400).json({ message: 'No file uploaded' });

    const result = await FileService.replaceFile(
      fileId,
      viewerId,
      newFile.buffer,
      newFile.originalname,
      folder
    );
    res.status(200).json({
      message: 'File replaced successfully',
      file: result.file,
      user: result.user
    });
  } catch (err) {
    if (err.message === 'Unauthorized') return res.status(403).json({ message: err.message });
    if (err.message === 'File not found') return res.status(404).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.deleteFile = async (req, res) => {
  try {
    const fileId = req.params.id;
    const viewerId = req.user._id;

    const result = await FileService.deleteFile(fileId, viewerId);
    res.status(200).json({
      message: 'File deleted successfully',
      user: result.updatedUser
    });
  } catch (err) {
    if (err.message === 'Unauthorized') return res.status(403).json({ message: err.message });
    if (err.message === 'File not found') return res.status(404).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.clearUserFiles = async (req, res) => {
  try {
    const userId = req.params.id;
    const viewerId = req.user._id;

    const result = await FileService.clearUserFiles(userId, viewerId);
    res.status(200).json({
      message: 'All user files deleted successfully',
      deletedCount: result.deletedCount,
      user: result.user
    });
  } catch (err) {
    if (err.message === 'Unauthorized') return res.status(403).json({ message: err.message });
    if (err.message === 'User not found') return res.status(404).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.getFileById = async (req, res) => {
  try {
    const fileId = req.params.id;
    const viewerId = req.user._id;

    const file = await FileService.getFileById(fileId, viewerId);
    res.status(200).json({ message: 'File found', file });
  } catch (err) {
    if (err.message === 'Unauthorized') return res.status(403).json({ message: err.message });
    if (err.message === 'File not found') return res.status(404).json({ message: err.message });
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};