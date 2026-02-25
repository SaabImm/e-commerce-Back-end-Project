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

//gerCreatableFields
router.get('/user/:userId/crFields', PermissionController.getCreatableFields);

//gerviewableFields
router.get('/user/:userId/vwFields', PermissionController.getViewableFields);
// Check if user can perform specific operation
router.post('/:userId/check-operation', PermissionController.checkOperation);

// ===== ADMIN-ONLY ROUTES =====
// Initialize default permission schemas (admin only)
router.post('/initialize', PermissionController.initializeDefaults);

router.post('/versions', PermissionController.createNewVersion)

// List all permission schemas (admin only)
router.get('/schemas', PermissionController.listSchemas);

// get Last Active Version
router.get('/rollbackVersion', PermissionController.rollbackVersion);



module.exports = router;
