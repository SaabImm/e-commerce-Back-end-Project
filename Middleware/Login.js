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
    const user = await User.findOne({ email }).select("+password").populate("files");
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // 3️⃣ Compare passwords
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    //is the user verified
    if(!user.isVerified){
      return res.status(403).json({message: "Your email is not Verified!!"})
    }

    //activate the user session
    user.isActive= true;
    await user.save();

    // 4️⃣ Generate JWT token
        const accessToken = jwt.sign(
      { id: user._id, 
        role: user.role, 
        email: user.email, 
        password: user.password },
      process.env.JWT_SECRET,
      { expiresIn: "15m" } // short lifetime
    );

    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET_REFRESH,
      { expiresIn: "7d" } 
    );

    // Send refresh token in HttpOnly cookie
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });



    // 5️⃣ Respond with token
    res.status(200).json({
      message: "Login successful",
      user: user,
      token :accessToken
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error });
  }
};
