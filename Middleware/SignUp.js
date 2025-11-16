const User = require("../Models/UsersModels");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendVerificationEmail = require("./sendEmail")

exports.signup = async (req, res) => {
  try {
    const { name, lastname, email, password } = req.body;
    
    // 1️⃣ Check required fields
    if (!name || !lastname || !email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    //check if the email is valid
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
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
      role: "admin"
    });

    const savedUser = await newUser.save();
      //generates verification Token
         const token = jwt.sign(
            { id: savedUser._id, role: savedUser.role },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
          );

    await sendVerificationEmail(savedUser.email, token);

    // 6️⃣ Respond with token and user info
    res.status(201).json({
      token: token,
      message: "Email Sent please verify ur inbox!!",
      user: savedUser
    });
 
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};
