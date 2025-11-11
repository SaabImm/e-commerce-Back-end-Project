const mongoose = require('mongoose');
const User = require('../Models/UsersModels')



exports.getAllUsers= async (req,res) =>{
   try{
      const data = await User.find()   
      if(!data) {res.status(404).json({message: "Users Not Found"})}
      res.json(data)
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
    const {username, email, password} = req.body
    if (!username || !email || !password ) {
    return  res.status(400).json({ message: "Missing required fields" });
}
    //verify duplicates
    const foundEmail = await User.findOne({email: email})
    if(foundEmail){return res.status(409).json({message: "Do you already Have an account with this e-mail? Consider Loging in" })}
  //Create the entry
  const newUser= new User (req.body)
  const savedElement= await newUser.save()
  //reponds with the data and a success message
  res.status(201).json({
    message: "User created successfully!",
    data: savedElement
  });
}   catch(error){
    res.status(500).json({message: 'Server Error', error: error})
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
   res.json({message: `User ${deletedUser.email} is deleted`})
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
  try{
    const {id} = req.params; 
    //verifies if it's anything but a number
    if (!mongoose.isValidObjectId(id)) {  
     return res.status(400).json({ message: "Invalid ID format / Bad Request " });
    }

    //update the thing
    const UpdateUser= await User.findByIdAndUpdate(id,req.body,{ new: true, runValidators: true } )
    if(!UpdateUser){return res.status(404).json({message: "User not found"})}
  //response message
    return res.status(200).json({
    message: "User updated successfully!",
    data: UpdateUser
  });

  }

  catch(error){
    console.log(error)
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