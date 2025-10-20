const express = require("express");
const router = express.Router();
const UserController = require("../controllers/UserController");
const { verifyToken, authorizeRoles } = require("../middleware/auth");

// Only admin can get all users
router.get('/', verifyToken, authorizeRoles('admin'), UserController.getAllUsers);

// Get user by ID - authenticated
router.get('/:id', verifyToken, UserController.getUserById);

// Only admin can get users by role
router.get('/role=/:role', verifyToken, authorizeRoles('admin'), UserController.getAllByRole);

// Create user - requires auth (admin)
router.post('/', verifyToken, authorizeRoles('admin'), UserController.createUser);

// Only admin can delete all users
router.delete('/', verifyToken, authorizeRoles('admin'), UserController.deleteAllUsers);

// Delete a specific user - authenticated (admin or owner check in controller)
router.delete('/:id', verifyToken, UserController.deleteUserById);

// Update user - authenticated (admin or owner)
router.patch('/:id', verifyToken, UserController.updateUser);

// Reset user - authenticated (admin only)
router.put('/:id', verifyToken, authorizeRoles('admin'), UserController.resetUser);

module.exports = router;
