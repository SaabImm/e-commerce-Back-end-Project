const File = require('../Models/FilesModels')
const User = require ("../Models/UsersModels")



const FileSizeLimit = (limitNb = 10) => async (req, res, next) => {
  try {
        const {id: userId} = req.params
        const user = await User.findById(userId)
        

  }
  catch (err) {
    return res.status(500).json({ message: "Server error" });
  }}