const express = require("express");
const router = express.Router();

const signUp= require('../Middleware/SignUp')
const login= require('../Middleware/Login')
const sendVerificationEmail = require("../Middleware/sendEmail")
router.post('/signup', signUp.signup);
router.get("/verify/:token",sendVerificationEmail.sendVerificationEmail);
router.post('/login', login.login);
module.exports = router;