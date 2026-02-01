const express = require("express");
const router = express.Router();
const authenticate= require('../Middleware/Authenticate')
const signUp= require('../Middleware/SignUp')
const login= require('../Middleware/Login')
const logout= require('../Middleware/LogOut')
const verifyEmail = require("../Middleware/verifyEmail")
const sendVerificationEmail = require('../Middleware/sendEmail')
const refreshAccessToken= require('../Helpers/RefreshToken')

router.post('/signup', signUp.signup);
router.get('/verify',verifyEmail.verifyEmail);
router.post('/login', login.login);
router.post('/logout',authenticate, logout.logout);
router.post('/refresh',refreshAccessToken.refreshAccessToken);

router.post("/email", async (req, res) => {
  try {
    await sendVerificationEmail("sabrinabessa754@gmail.com"); // hardcoded recipient
    res.status(200).json({ message: "✅ Test email sent successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "❌ Failed to send test email" });
  }
});
module.exports = router;