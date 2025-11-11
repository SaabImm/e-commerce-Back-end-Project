
const jwt = require("jsonwebtoken");
const User = require("../Models/UsersModels");

exports.verifyEmail = async (req, res) => {
  try {
    //grabs the token from the clicked URL 
    const token = req.query.token;

    //verifies its integrity
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) return res.status(400).json({ message: "Invalid token" });

    //checks if it's already verified
    if (user.isVerified) {return res.status(400).json({ message: "Email already verified" });}
    
    
    user.isVerified = true;
    user.isActive= true;
    await user.save();
    //login without credentials 
    //creates a token for login
      const VerifyToken = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

    res.status(200).json({ message: "Email verified successfully!",
      user: user,
      token: VerifyToken
    });
  } catch (err) {
    res.status(400).json({ message: "Invalid or expired token" });
  }
};
