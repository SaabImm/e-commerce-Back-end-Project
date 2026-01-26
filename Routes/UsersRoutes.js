const express = require("express");
const router = express.Router();
const UserController = require("../Controller/UserController");
const authorizeRoles= require("../Middleware/AuthorizeToken");
const authenticate= require("../Middleware/Authenticate")

// Only admin can get all users
router.get('/', authenticate, authorizeRoles('admin'), UserController.getAllUsers);
//router.get('/', UserController.getAllUsers);


// Get user by ID - authenticated
router.get('/:id', UserController.getUserById);

// Only admin can get users by role
router.get('/role=/:role', UserController.getAllByRole);

// Create user - requires auth (admin)
router.post('/', UserController.createUser);

// Only admin can delete all users
router.delete('/', UserController.deleteAllUsers);

// Delete a specific user - authenticated (admin or owner check in controller)
router.delete('/:id', authenticate, UserController.deleteUserById);

// Update one's profile - authenticated (admin or owner)
router.patch('/me/:id',authenticate, UserController.updateUser);

// Update user - authenticated (admin only )
router.patch('/:id',authenticate, authorizeRoles('admin'), UserController.updateUser);

//updatepsw
router.patch('/psw/:id',authenticate, UserController.resetPassword);

// Reset user - authenticated (admin only)
router.put('/:id', UserController.resetUser);

//validate user
router.patch('/validate/:id', UserController.validateUser);


module.exports = router;
