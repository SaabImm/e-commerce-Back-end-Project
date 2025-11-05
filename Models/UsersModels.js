const mongoose = require("mongoose");

const usersSchema = new mongoose.Schema({
  name: { type: String, required: true },
  lastname: { type: String, required: true },
  email: {  
    type: String, 
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email address"],
    required: true,
    unique: true
    },
  password:{type: String, required: true, select: false},
  profilePicture: {type: String},
  role: {type: String, 
    enum: ['user', 'admin'],
    required: true,
    default: 'user'
  },
  isActive: {type: Boolean, default: false},
  isVerified: {type: Boolean, default: false}
},
 { timestamps: true });

//la collection s'appel Users 
module.exports = mongoose.model("Users", usersSchema);