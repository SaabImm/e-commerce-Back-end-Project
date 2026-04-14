const User = require("../Models/UsersModels");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {sendVerificationEmail} = require("../Middleware/sendEmail")
const Cotisation = require('../Models/FeesModel');
const FeeDefinition = require('../Models/FeeDefinition')

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    // Vérifier les champs requis
    if (!email || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Trouver l'utilisateur
    const user = await User.findOne({ email }).select("+password").populate("files").populate("fees");
    if (!user) {
      return res.status(401).json({ message: "Unfound user, try another email" });
    }

    // Vérifier si le compte est verrouillé
    if (user.lockUntil && user.lockUntil > new Date()) {
      const remainingTime = Math.ceil((user.lockUntil - new Date()) / 1000);
      return res.status(429).json({
        message: `Compte temporairement bloqué. Réessayez dans ${remainingTime} secondes.`,
        remainingTime
      });
    } else if (user.lockUntil && user.lockUntil < new Date()) {
      // Verrou expiré : réinitialiser
      user.loginAttempts = 0;
      user.lockUntil = null;
      await user.save();
    }

    // Comparer les mots de passe
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // Incrémenter les tentatives
      user.loginAttempts += 1;
      await user.save();

      // Gérer les différents seuils
      if (user.loginAttempts === 3) {
        // Troisième tentative : avertissement
        return res.status(401).json({
          message: "Attention : Ceci est votre troisième tentative échouée. Une dernière tentative avant le blocage temporaire de votre compte pendant 1 minute."
        });
      } else if (user.loginAttempts > 3) {
        // Quatrième tentative et plus : verrouillage
        user.lockUntil = new Date(Date.now() + 60 * 1000); // 1 minute
        await user.save();
        return res.status(429).json({
          message: "Trop de tentatives de connexion échouées. Compte bloqué pendant 1 minute."
        });
      } else {
        // Première ou deuxième tentative
        return res.status(401).json({ message: "Wrong password" });
      }
    }

    // Vérifier si l'email est vérifié
    if (!user.isVerified) {
      return res.status(403).json({ message: "Your email is not verified!!" });
    }

    // Activer la session
    user.isActive = true;
    user.lastLogin = new Date();
    await user.save();

    // Générer les tokens
    const accessToken = jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "5d" }
    );

    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET_REFRESH,
      { expiresIn: "15min" }
    );

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(200).json({
      message: "Login successful",
      user: user,
      token: accessToken
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
    user.loginAttempts = 0;
    await user.save();
    res.clearCookie("refreshToken", { httpOnly: true, sameSite: "strict", secure: true });
    return res.status(200).json({message: "LOGGED OUT SUCCESSFULLY!!"});
  }
   catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error", error });
  }
};


exports.signup = async (req, res) => {
  try {
    const { name, lastname, email, password, dateOfBirth, sexe, startDate, registrationNumber } = req.body;

    // Validate required fields
    if (!name || !lastname || !email || !password) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email already in use" });
    }

    // Check if registration number already exists (if provided)
    if (registrationNumber) {
      const existingReg = await User.findOne({ registrationNumber });
      if (existingReg) {
        return res.status(409).json({ message: "Registration number already in use" });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Prepare user data
    const userData = {
      name,
      lastname,
      email,
      password: hashedPassword,
      role: "user",
      sexe,
      startDate: startDate ? new Date(startDate) : new Date(),
      registrationNumber
    };
    if (dateOfBirth) {
      userData.dateOfBirth = dateOfBirth;
    }

    // Create user
    const newUser = new User(userData);
    const savedUser = await newUser.save();

    // --- Create fees based on FeeDefinition campaigns ---
    const startYear = savedUser.startDate.getFullYear();
    const currentYear = new Date().getFullYear();

    // Find all active fee definitions from startYear to currentYear
    const feeDefinitions = await FeeDefinition.find({
      year: { $gte: startYear, $lte: currentYear },
      isActive: true
    }).sort({ year: 1, feeType: 1 });

    for (const def of feeDefinitions) {
      // Avoid duplicate cotisations for the same user/year/type
      const existing = await Cotisation.findOne({
        user: savedUser._id,
        year: def.year,
        feeType: def.feeType
      });
      if (existing) continue;

      // Create individual cotisation linked to the definition
      const cotisation = new Cotisation({
        user: savedUser._id,
        feeDefinition: def._id,
        year: def.year,
        amount: def.amount,
        dueDate: def.dueDate,
        feeType: def.feeType,
        penaltyConfig: def.penaltyConfig,
        notes: `Cotisation automatique à l'inscription (${def.title})`,
        createdBy: savedUser._id,
        cancelled: false
      });
      await cotisation.save();

      // Add reference to user's fees array
      if (!savedUser.fees) savedUser.fees = [];
      savedUser.fees.push(cotisation._id);
    }

    await savedUser.save();

    // Generate verification token
    const token = jwt.sign(
      { id: savedUser._id, role: savedUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    // Send verification email
    await sendVerificationEmail(savedUser.email, token);

    // Response
    res.status(201).json({
      token,
      message: "Email sent, please verify your inbox!",
      user: savedUser
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};


