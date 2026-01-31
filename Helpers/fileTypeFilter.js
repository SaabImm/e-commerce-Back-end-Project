const File = require('../Models/FilesModels')
const User = require ("../Models/UsersModels")


const path = require("path");

const fileTypeFilter = (...allowedExts) => async (req, res, next) => {
  try {
        if (!req.file) {
      return res.status(400).json({ message: "No file provided" });
    }
    const ext = path.extname(req.file.originalname).slice(1).toLowerCase();
    if (!allowedExts.includes(ext)) {
      return res.status(415).json({ message: "Unsupported file type" });
    }
    next();
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
};


  module.exports = fileTypeFilter;