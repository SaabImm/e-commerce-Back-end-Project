const File = require('../Models/FilesModels')
const User = require ("../Models/UsersModels")



const fileNumberLimit = (limitNb) => async (req, res, next) => {
  try {
        const {id: userId} = req.params
        const user = await User.findById(userId)
        console.log("user", user)

        if(user.files.length > limitNb-1)
        {
          return res.status(413).json({message: "Too many files uploaded"})
        }

        next();
  }
  catch (err) {
    return res.status(500).json({ message: "Server error" });
  }}


  module.exports = fileNumberLimit;
