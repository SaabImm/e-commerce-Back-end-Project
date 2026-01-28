
const File = require('../Models/FilesModels')
const FileOwnership = (enforce = true) => async (req, res, next) => {
  try {
    const { id: fileId } = req.params;
    const file = await File.findById(fileId);
    
    const isOwner = file.owner.toString() === req.user.id;
    req.canActOnFile = isOwner;

    if (enforce && !isOwner) {
      return res.status(403).json({ message: "unauthorized" });
    }

    next();
  } catch (err) {
    return res.status(500).json({ message: "Server Error" });
  }
};



module.exports = FileOwnership;