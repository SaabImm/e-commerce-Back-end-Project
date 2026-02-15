const express = require("express");
const router = express.Router();
const authenticate= require('../Middleware/Authenticate')
const AuthController= require('../Controller/AuthController')
const verifyEmail = require("../Middleware/verifyEmail")
const refreshAccessToken= require('../Helpers/RefreshToken')

router.post('/signup', AuthController.signup);
router.get('/verify',verifyEmail.verifyEmail);
router.post('/login', AuthController.login);
router.post('/logout',authenticate, AuthController.logout);
router.post('/refresh',refreshAccessToken.refreshAccessToken);

module.exports = router;