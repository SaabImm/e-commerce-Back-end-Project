const File = require('../Models/FilesModels')
const User = require ("../Models/UsersModels")



const fileNumberLimit = (limitNb, folder) => async (req, res, next) => {
  try {
        const {id: userId} = req.params
        const fileFolder= req.body.folder
        if (fileFolder===folder) {
          
        
        const user = await User.findById(userId).populate("files")
        const filterFunction = (file) => {
          return file.folder === folder
        }
        const filteredArray = user.files.filter(filterFunction)
        if(filteredArray.length > limitNb-1)
        {
          return res.status(413).json({message: "Too many files uploaded"})
        }
        }

        next();
  }
  catch (err) {
    return res.status(500).json({ message: "Server error" });
  }}


  module.exports = fileNumberLimit;
