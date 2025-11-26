const mongoose = require('mongoose');
const User = require('../Models/UsersModels')
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const sendVerificationEmail = require("../Middleware/sendEmail")
const { filterUpdateFields } = require("../Helpers/FilteredUsers");

exports.getAllUsers= async (req,res) =>{
   try{
      const data = await User.find()   
      if(!data) {res.status(404).json({message: "Users Not Found"})}
      res.json({
        users : data,
        message: "data was retreived successfully"
      })
   } 
   catch(error){
    res.status(500).json({message: 'Server Error', error: error})
   }
};

exports.getUserById = async(req, res) => {
  try {
    //convert to number
    const {id} = req.params; 
    //verifies if it's anything but a number
    if (!mongoose.isValidObjectId(id)) {  
     return res.status(400).json({ message: "Invalid ID format / Bad Request " });
    }
    //finds the product if it exists
    const u = await User.findById(id);
    if (!u){ return res.status(404).json({ message: "User Not Found " });}
    //returns the product in json
    return res.json({message: "User Was Found", user:u});
    } 
   catch(error){
    res.status(500).json({message: 'Server Error', error: error})
   }
};

exports.createUser = async (req, res) => {
  try {
    const { name, lastname, email, password, role } = req.body;
    if (!name, !lastname || !email || !password ) {
    return  res.status(400).json({ message: "Missing required fields" });
}
    //verify duplicates
    const foundEmail = await User.findOne({email: email})
    if(foundEmail){return res.status(409).json({message: "a user with this email already exists" })}
    
  //Create the entry
  const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      lastname,
      email,
      password: hashedPassword,
      role
    });
  const savedElement= await newUser.save()
  //reponds with the data and a success message
  res.status(201).json({
    message: "User created successfully!",
    user: savedElement
  });
}   catch(error){
    res.status(500).json({message: 'Server Error'})
   }
};

exports.deleteUserById= async (req, res) => {
  try{
// verifies if it's anything but a number
    const {id} = req.params
  if (!mongoose.isValidObjectId(id)) { 
    return res.status(400).json({ message: "Invalid ID format / Bad Request " });
  }
//Finds the Element
  const deletedUser = await User.findByIdAndDelete(id);
  
  if (!deletedUser) {
    return res.status(404).json({ message: "Product not found" });
  }
   res.status(200).json({
    message: `User ${deletedUser.email} is deleted`,
    user:  deletedUser
  })
 }
 catch(err) {
    res.status(500).json({ error: err });
    console.log(err)
}

};

exports.deleteAllUsers= async (req, res) =>{
  try{
    //this will also verify roles later
    const dataCount= await User.countDocuments();
    if(dataCount === 0){
      return res.status(404).json({message : "No users found"})
    }
    await User.deleteMany({});
    return res.json({message : "Users deleted successfully!!"})
  }
   catch(error){
    res.status(500).json({message: 'Server Error', error: error})
   }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const Updater = await User.findById(req.user.id).select("+password");
    
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid ID format / Bad Request" });
    }

    const user = await User.findById(id).select("+password");
    if (!user) return res.status(404).json({ message: "User not found" });
   
    // Ownership check
    //if (Updater.role!=="admin" || Updater.id!== id) {
    //return res.status(403).json({ message: "Forbidden: you can only update your own profile" });}

    const data = req.body;
    const file = req.file;
    // Check password
      if (!data.password) {
    return res.status(400).json({ message: "Password is required to update profile" });
  } 

    const isMatch = await bcrypt.compare(data.password, Updater.password);
    if (!isMatch) return res.status(401).json({ message: "Password doesn't match" });
    //omit psw
    delete data.password;

    // Filter fields
    const dataToUpdate = filterUpdateFields(user, data);
    //update file
      if (file){
    dataToUpdate.profilePicture = `/uploads/${file.filename}`;
}

    let isVerified = user.isVerified;

    // Email change logic
    if (data.email && data.email !== user.email) {
      const foundEmail = await User.findOne({ email: data.email });
      if (foundEmail) {
        return res.status(409).json({ message: "A user with this email already exists" });
      }
      isVerified = false;
      const token = jwt.sign(
        { id: user._id, email: data.email },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );
      await sendVerificationEmail(data.email, token, "email-change");
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      id,
      { ...dataToUpdate, isVerified },
      { new: true, runValidators: true }
    );

    // Generate new token
    const token = jwt.sign(
      { id: updatedUser._id, email: updatedUser.email, role: updatedUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "15h" }
    );

    res.status(200).json({
      message: "User updated successfully!",
      user: updatedUser,
      token
    });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server Error", error });
  }
};

exports.resetPassword = async (req, res) =>{
  try{
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid ID format / Bad Request" });
    }

    const user = await User.findById(id).select("+password");
    const data = req.body;
    const isMatch = await bcrypt.compare(data.currentPassword, user.password);
    if (!isMatch) return res.status(401).json({ message: "Entered password doesn't match ur current one" });
    
    const hashedPassword = await bcrypt.hash(data.newPassword, 10);
    const updatedUser = await User.findByIdAndUpdate(id, { password: hashedPassword }, { new: true });


    res.status(200).json({
      message: "Psw updated successfully!",
      user: updatedUser,
    });
  }
  catch(error){
  
  console.error(error);
  res.status(500).json({message: 'Server Error', error: error})
  }
}

exports.resetUser = async (req, res) =>{
  try{
    const {id} = req.params; 
    //verifies if it's anything but a number
    if (!mongoose.isValidObjectId(id)) {  
     return res.status(400).json({ message: "Invalid ID format / Bad Request " });
    }

    //checks for empty fields
    if (!userName || !email || !password || !role ) {
    return  res.status(400).json({ error: "Missing required fields" });
}

    //update the thing
    const updatedUser= await User.findByIdAndUpdate(
        id,
        {userName, email, password, role}, 
        { new: true, runValidators: true } )

    if(!updatedUser){return res.status(404).json({message: "User not found"})}
  //response message
    return res.status(200).json({
    message: "User reset successfully!",
    data: updatedUser
  });

  }

  catch(error){
    
    console.error(error);
    res.status(500).json({message: 'Server Error', error: error})
   }
}

exports.getAllByRole = async(req, res) =>{
  try{
    const {role} = req.params;
    if(!['admin','user'].includes(role)){return res.status(400).json({ error : "Invalid Role"})}
    const foundUser = await User.find({role: role})

    
    if(foundUser.length===0){return res.status(404).json({message: "No user with this role found"});}
   
    return res.status(200).json({
      message: "User Found",
      Users: foundUser
    })
  }
  catch(error){
  console.error(error); 
  return res.status(500).json({message: 'Server Error', error: error})
  }
}