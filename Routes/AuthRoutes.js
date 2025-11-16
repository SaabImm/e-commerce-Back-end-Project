const express = require("express");
const router = express.Router();
const authenticate= require('../Middleware/Authenticate')
const signUp= require('../Middleware/SignUp')
const login= require('../Middleware/Login')
const logout= require('../Middleware/LogOut')
const verifyEmail = require("../Middleware/verifyEmail")

router.post('/signup', signUp.signup);
router.get("/verify",verifyEmail.verifyEmail);
router.post('/login', login.login);
router.post('/logout',authenticate, logout.logout);
module.exports = router;