const express = require("express");
const router = express.Router();
const UserController = require("../Controller/UserController");
const authenticate = require("../Middleware/Authenticate");
const userOwnership = require("../Middleware/UserOwnership");

// ===================== PUBLIC / NON‑RESTRICTED =====================
// (none – all user routes require authentication)

// ===================== AUTHENTICATED ROUTES =====================

// Get current user statistics (admin only)
router.get("/stats", authenticate, UserController.getUserStats);

// Get user by ID (authenticated, permission checks inside controller)
router.get("/:id", authenticate, UserController.getUserById);

// Get users by role (admin only)
router.get("/role/:role", authenticate, UserController.getAllByRole);

// Create a new user (admin only)
router.post("/", authenticate, UserController.createUser);

// Update a user (authenticated, password confirmation required)
router.patch("/:id", authenticate, UserController.updateUser);

// Delete a user (admin or owner, checked in service)
router.delete("/:id", authenticate, UserController.deleteUserById);

// Reset password (authenticated, userOwnership ensures only the user themselves)
router.patch("/psw/:id", authenticate, userOwnership(true), UserController.resetPassword);

// Validate a user (admin only – add admin check inside controller or middleware)
router.patch("/validate/:id", authenticate, UserController.validateUser);

// Optional: delete all users (super_admin only)
router.delete("/all", authenticate, UserController.deleteAllUsers);

module.exports = router;