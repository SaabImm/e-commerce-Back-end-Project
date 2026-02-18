
const express = require("express");
const router = express.Router();
const UserController = require("../Controller/UserController");
const authorizeRoles= require("../Middleware/AuthorizeRole");
const authenticate = require("../Middleware/Authenticate")
const userOwnership = require("../Middleware/UserOwnership")

router.use(authenticate); 
router.use(authorizeRoles('admin')); 
router.get('/all', UserController.getAllUsers);
router.patch('/user/:id',  UserController.updateUser);

// Only admin can delete all users
router.delete('/all', UserController.deleteAllUsers);


module.exports = router;
