const User = require("../Models/UsersModels");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");


exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1️⃣ Check required fields
    if (!email || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 2️⃣ Find user
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // 3️⃣ Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // 4️⃣ Generate JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // 5️⃣ Respond with token
    res.status(200).json({
      message: "Login successful",
      user: { id: user._id, name: user.name, lastname: user.lastname, email: user.email, role: user.role },
      token
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error });
  }
};
