const User = require("../Models/UsersModels");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {sendVerificationEmail} = require("./sendEmail")

exports.signup = async (req, res) => {
  try {
    const { name, lastname, email, password, role } = req.body;
    
    // 1️⃣ Check required fields
    if (!name || !lastname || !email || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 2️⃣ Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email already in use" });
    }

    // 3️⃣ Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4️⃣ Create user
    const newUser = new User({
      name,
      lastname,
      email,
      password: hashedPassword,
      role: role || "user"
    });

    const savedUser = await newUser.save();
      //generates verification Token
    await sendVerificationEmail(user.email, token);



    // 6️⃣ Respond with token and user info
    res.status(201).json({
      message: "Email Sent please verify ur inbox!!"
    });
 
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error });
  }
};
