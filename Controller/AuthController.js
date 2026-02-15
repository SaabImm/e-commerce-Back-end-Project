const User = require("../Models/UsersModels");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sendVerificationEmail = require("../Middleware/sendEmail")

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
        email: user.email
        },
      process.env.JWT_SECRET,
      { expiresIn: "5d" } // short lifetime
    );

    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET_REFRESH,
      { expiresIn: "15min" } 
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


exports.logout = async (req, res) => {
  try {
    //convert to number
    const id = req.query.id;  
    //verifies if it's anything but a number

    //finds the product if it exists
    const user = await User.findById(id);
    user.isActive=false;
    await user.save();
    res.clearCookie("refreshToken", { httpOnly: true, sameSite: "strict", secure: true });
    return res.status(200).json({message: "LOGGED OUT SUCCESSFULLY!!"});
  }
   catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error });
  }
}



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
      role: "user"
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


