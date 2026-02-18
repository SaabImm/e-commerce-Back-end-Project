const mongoose = require('mongoose');
const User = require('../Models/UsersModels')
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const PermissionService = require('../Services/PermissionService');

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
    const targetId = req.params.id; 
    const viewerId = req.user.id;

    //verifies if it's anything but a number
    if (!mongoose.isValidObjectId(targetId)) {  
     return res.status(400).json({ message: "Invalid ID format / Bad Request " });
    }

    //finds the product if it exists
    const targetUser = await User.findById(targetId).populate("files");
    if (!targetUser){ return res.status(404).json({ message: "User Not Found !!" });}

    const canPerform = await PermissionService.canPerform(viewerId,targetId, "read")
    console.log(canPerform)
    if (!canPerform){
      return res.status(403).json({message : "Unauthorized!!"})
    }
    //returns the product in json
    return res.json({
      message: "User Found", 
      user:targetUser
    });
    } 
   catch(error){
    res.status(500).json({message: 'Server Error', error: error})
   }
};

exports.createUser = async (req, res) => {
  try {
    const { name, lastname, email, password, role } = req.body;
    const viewerId = req.user.id || req.user._id 
    if (!name || !lastname || !email || !password ) {
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
    const targetId = req.params.id
    const viewerId = req.user.id
  if (!mongoose.isValidObjectId(targetId)) { 
    return res.status(400).json({ message: "Invalid ID format / Bad Request " });
  }


//Finds the Element and delets it
  const canDelete = await PermissionService.canPerform(viewerId, targetId, "delete")
  if (!canDelete) {
    return res.status(403).json({ message: "unauthorized operation!!"})
  }

    const deletedUser = await User.findByIdAndDelete(targetId);
      if (!deletedUser) {
    return res.status(404).json({ message: "User not found" });
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

exports.updateUser = async (req, res) =>{
    try {
    const targetId = req.params.id;
    const viewer = await User.findById(req.user.id).select("+password");

    if (!viewer) {
      return res.status(404).json({ message: "not found" });
    }

    const targetUser = await User.findById(targetId).select("+password").populate("files");
    if (!targetUser) {
      return res.status(404).json({ message: "Target User not found" });
    }
    const canUpdate = await PermissionService.canPerform(viewer.id, targetId, "update" )

    if (!canUpdate) {
      return res.status(403).json({message: "unauthorized operation !"})
    }

    const { password, ...updates } = req.body;
        
    
    //check for password
    if (!password) {
      return res.status(400).json({ message: "Password required" });
    }
    const isMatch = await bcrypt.compare(password, viewer.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Wrong password" });
    }
    //get permissions
    const EditableFields = await PermissionService.getEditableFields(viewer.id, targetId)
    const allowedFields = EditableFields.permissions.canUpdate
    allowedFields.forEach((field) => {
    if (updates[field] !== undefined) {
      targetUser[field] = updates[field];
    }
    });

    //update user
    const UpdatedUser= await targetUser.save();
    const token = jwt.sign(
      { id: targetUser._id, role: targetUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "15h" }
    );

    res.status(200).json({
      message: "User updated",
      user: UpdatedUser,
      token,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err });
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

exports.validateUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid ID format / Bad Request" });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User Not Found" });
    }

    if (user.isAdminVerified) {
      return res.status(400).json({ message: "User is already verified" });
    }

    // Update and save
    user.isAdminVerified = true;
    await user.save(); 
    return res.status(200).json({ message: "User is Validated", user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server Error", error });
  }
};
