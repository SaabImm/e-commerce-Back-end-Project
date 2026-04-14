const jwt = require("jsonwebtoken");
const User = require("../Models/UsersModels");
const mongoose = require("mongoose");

const authenticate = async (req, res, next) => {
  let token;

  // ✅ 1. Try Authorization header (standard way)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  // ✅ 2. Fallback to query param (for iframe / download)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  // ❌ No token at all
  if (!token) {
    return res.status(401).json({ message: "No Token Provided!!" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const id = decoded.id || decoded._id;

    // ✅ Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(401).json({ message: "Invalid user ID in token" });
    }

    // ✅ Fetch user
    const user = await User.findById(id);
    if (!user) {
      return res.status(401).json({ message: "User Not found" });
    }

    // ✅ Attach user to request
    req.user = user;

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid Token!!" });
  }
};

module.exports = authenticate;