const jwt = require("jsonwebtoken");
const User = require("../Models/UsersModels");
const mongoose = require("mongoose"); // Ajout pour la validation d'ObjectId

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No Token Provided!!" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const id = decoded.id || decoded._id;

    // 1. Vérifier que l'ID est un ObjectId MongoDB valide
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(401).json({ message: "Invalid user ID in token" });
    }

    // 2. Rechercher l'utilisateur dans la base de données
    const user = await User.findById(id);
    if (!user) {
      return res.status(401).json({ message: "User Not found" });
    }

    req.user = user;
    next();
  } catch (error) {
    // Si l'erreur provient de jwt.verify ou d'ailleurs, on considère le token invalide
    return res.status(401).json({ message: "Invalid Token!!" });
  }
};

module.exports = authenticate;