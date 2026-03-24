const express = require("express");
const router = express.Router();
const PermissionController = require('../Controller/PermissionsController')
const authenticate = require ('../Middleware/Authenticate')



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

// Initialize default permission schemas 
router.post('/initialize/:model', PermissionController.initializeDefaults);

// create new version
router.post('/versions/:model', PermissionController.createNewVersion)

// List all permission schemas
router.get('/schemas', PermissionController.listSchemas);

// get Last Active Version
router.get('/rollbackVersion', PermissionController.rollbackVersion);

//reactivate version 
router.get('/reactivateVersion/:schemaId', PermissionController.reactivateVersion);

//patch inactive version
router.patch('/versions/:versionId', PermissionController.updateVersion);








module.exports = router;
