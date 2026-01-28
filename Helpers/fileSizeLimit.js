

const FileSizeLimit = (limitMB = 2) => (req, res, next) => {
  try {
    if (!req.file) return next(); // nothing to check

    const maxSize = limitMB * 1024 * 1024;

    if (req.file.size > maxSize) {
      return res.status(413).json({
        message: `File too large. Max size is ${limitMB}MB`
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = FileSizeLimit;
