
const User = require('../Models/UsersModels')

const userOwnership = (enforce = true) => async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const isOwner = id === req.user.id;
    console.log(id, req.user.id, isOwner)
    req.canActOnFile = isOwner;

    if (enforce && !isOwner) {
      return res.status(403).json({ message: "unauthorized!!" });
    }

    next();
  } catch (err) {
    return res.status(500).json({ message: "Server Error" });
  }
};



module.exports = userOwnership;