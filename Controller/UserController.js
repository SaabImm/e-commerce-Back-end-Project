const mongoose = require('mongoose');
const User = require('../Models/UsersModels')
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const PermissionService = require('../Services/PermissionService');


exports.getAllUsers = async (req, res) => {
  try {
    const viewerId = req.user._id; // l'ID du viewer est déjà un ObjectId valide

    // Récupérer tous les utilisateurs (vous pourrez plus tard ajouter un filtre par tenant)
    const allUsers = await User.find();

    if (!allUsers.length) {
      return res.status(404).json({ message: "Aucun utilisateur trouvé" });
    }

    // Vérifier pour chaque utilisateur si le viewer a le droit de lecture
    const permissions = await Promise.all(
      allUsers.map(async (user) => {
        const canRead = await PermissionService.canPerform(viewerId, user._id, "read", 'User');
        return { user, canRead };
      })
    );

    // Ne garder que ceux pour lesquels canRead est true
    const allowedUsers = permissions.filter(p => p.canRead).map(p => p.user);

    res.json({
      users: allowedUsers,
      message: "Données récupérées avec succès"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Erreur  serveur', error });
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

    const canPerform = await PermissionService.canPerform(viewerId,targetId, "read", 'User')
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
    const viewerId = req.user.id || req.user._id;
    const { password, ...otherFields } = req.body;

    // 1. Basic password check
    if (!password) {
      return res.status(400).json({ message: "Password required" });
    }

    // 2. Check create operation permission
    const canCreate = await PermissionService.canPerform(viewerId, viewerId, "create",'User');
    if (!canCreate) {
      return res.status(403).json({ message: "Unauthorized operation" });
    }

    // 3. Get creatable fields for this viewer (based on their role/tenant)
    const creatable = await PermissionService.getCreatableFields(viewerId, viewerId);
    const allowedFields = creatable.fields; // array of field names

    // 4. Build user data using only allowed fields
    const userData = {};
    allowedFields.forEach(field => {
      if (otherFields[field] !== undefined) {
        userData[field] = otherFields[field];
      }
    });

    // 5. Hash password and add it
    const hashedPassword = await bcrypt.hash(password, 10);
    userData.password = hashedPassword;

    // 6. Check for duplicate email (if email is being set)
    if (userData.email) {
      const existing = await User.findOne({ email: userData.email });
      if (existing) {
        return res.status(409).json({ message: "Email already exists" });
      }
    }

    // 7. Create and save the user
    const newUser = new User(userData);
    const savedUser = await newUser.save();

    return res.status(201).json({
      message: "User created successfully",
      user: savedUser
    });
  } catch (error) {
    console.error("Create user error:", error);
    return res.status(500).json({ message: 'Server error' });
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
  const canDelete = await PermissionService.canPerform(viewerId, targetId, "delete", 'User')
  if (!canDelete) {
    return res.status(403).json({ message: "Opération Non autorisée!"})
  }

    const deletedUser = await User.findByIdAndDelete(targetId);
      if (!deletedUser) {
    return res.status(404).json({ message: "Utilisateur Non trouvé" });
  }
    res.status(200).json({
    message: `Utilisateur ${deletedUser.email} a été supprimé`,
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
    const targetId = req.params.id;
    const viewerId = req.user._id; // safer

    const viewer = await User.findById(viewerId).select("+password");
    if (!viewer) {
      return res.status(404).json({ message: "VIEWER not found" });
    }

    const targetUser = await User.findById(targetId).select("+password").populate("files");
    if (!targetUser) {
      return res.status(404).json({ message: "Target User not found" });
    }

    const canUpdate = await PermissionService.canPerform(viewerId, targetId, "update", 'User');
    if (!canUpdate) {
      return res.status(403).json({ message: "Unauthorized operation!" });
    }

    const { password, ...updates } = req.body;

    if (!password) {
      return res.status(400).json({ message: "Password required" });
    }
    const isMatch = await bcrypt.compare(password, viewer.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Wrong password" });
    }

    const editableFields = await PermissionService.getEditableFields(viewerId, targetId);
    const allowedFields = editableFields.permissions.canUpdate;

    if (allowedFields.length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    allowedFields.forEach((field) => {
      if (updates[field] !== undefined) {
        targetUser[field] = updates[field];
      }
    });

    const updatedUser = await targetUser.save();

    const token = jwt.sign(
      { id: updatedUser._id, role: updatedUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "15h" }
    );

    return res.status(200).json({
      message: "User updated",
      user: updatedUser,
      token,
    });
  } catch (err) {
    console.error("Update user error:", err);
    return res.status(500).json({ message: "Server error" });
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
};

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
};

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
};

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
