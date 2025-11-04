const express = require("express");
const router = express.Router();

const signUp= require('../Middleware/SignUp')
const login= require('../Middleware/Login')

router.post('/signup', signUp.signup);
router.post('/login', login.login);

module.exports = router;