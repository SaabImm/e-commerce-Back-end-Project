const express = require("express");
const router = express.Router();

const signUp= require('../Middleware/SignUp')
const login= require('../Middleware/Login')
const verifyEmail= require("../Middleware/verifyEmail")

router.post('/signup', signUp.signup);
router.get("/verify/:token",verifyEmail.verifyEmail);
router.post('/login', login.login);
module.exports = router;