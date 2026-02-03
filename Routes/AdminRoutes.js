
const express = require("express");
const router = express.Router();
const UserController = require("../Controller/UserController");
const authorizeRoles= require("../Middleware/AuthorizeRole");
const authenticate= require("../Middleware/Authenticate")
const userOwnership = require("../Middleware/UserOwnership")



router.patch('/user/:id',authenticate, authorizeRoles('admin'), UserController.updateUser(['name']));



module.exports = router;
