const express = require("express");
const router = express.Router();
const UserController = require("../Controller/UserController");
const authorizeRoles= require("../Middleware/AuthorizeRole");
const authenticate = require("../Middleware/Authenticate")


router.use(authenticate); 
router.use(authorizeRoles('admin',"super_admin")); 

router.get('/allUsers', UserController.getAllUsers);


router.delete('/all', UserController.deleteAllUsers);


module.exports = router;
