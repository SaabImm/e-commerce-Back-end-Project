const express = require("express");
const router = express.Router();
const PermissionController = require('../Controller/PermissionsController')
const authenticate = require ('../Middleware/Authenticate')


// ===== AUTHENTICATED ROUTES =====
router.use(authenticate); // All routes below require authentication

// Get permissions for a specific user
router.get('/user/:userId', PermissionController.getUserPermissions);

// Get editable fields for a user (for form building)
router.get('/user/:userId/fields', PermissionController.getEditableFields);

// Check if user can perform specific operation
router.post('/user/:userId/check-operation', PermissionController.checkOperation);

// ===== ADMIN-ONLY ROUTES =====
// Initialize default permission schemas (admin only)
router.post('/initialize', PermissionController.initializeDefaults);

// List all permission schemas (admin only)
router.get('/schemas', PermissionController.listSchemas);

module.exports = router;
