const express = require("express");
const router = express.Router();
const UserController = require("../Controller/UserController");


// Only admin can get all users
//router.get('/', authenticate, authorizeRoles('admin'), UserController.getAllUsers);
router.get('/', UserController.getAllUsers);


// Get user by ID - authenticated
router.get('/:id', UserController.getUserById);

// Only admin can get users by role
router.get('/role=/:role', UserController.getAllByRole);

// Create user - requires auth (admin)
//router.post('/', UserController.createUser);
router.post('/', UserController.createUser);

// Only admin can delete all users
router.delete('/', UserController.deleteAllUsers);

// Delete a specific user - authenticated (admin or owner check in controller)
router.delete('/:id', UserController.deleteUserById);

// Update user - authenticated (admin or owner)
router.patch('/:id', UserController.updateUser);

// Reset user - authenticated (admin only)
router.put('/:id', UserController.resetUser);

module.exports = router;
