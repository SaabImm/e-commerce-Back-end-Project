const User = require('../Models/UsersModels')
const mongoose = require('mongoose');
exports.logout = async (req, res) => {
  try {
    //convert to number
    const id = req.query.id;  
    //verifies if it's anything but a number

    //finds the product if it exists
    const user = await User.findById(id);
    user.isActive=false;
    await user.save();
    res.clearCookie("refreshToken", { httpOnly: true, sameSite: "strict", secure: true });
    return res.status(200).json({message: "LOGGED OUT SUCCESSFULLY!!"});
  }
   catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error });
  }
}