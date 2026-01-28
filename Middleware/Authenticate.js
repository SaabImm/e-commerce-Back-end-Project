const jwt = require("jsonwebtoken");
const User = require ("../Models/UsersModels")

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No Token Provided!!" });
  }

 

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const id = decoded.id || decoded._id 
     const user = await User.findById(id) 
     if (!user) {
      return res.status(401).json({message : "User Not found"})
     }
     req.user= user
    next(); 
  } catch (error) {
    return res.status(401).json({ message: "Invalid Token!!" });
  }
};

module.exports = authenticate; 
