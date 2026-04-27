const express = require('express');
const router = express.Router();
const validationController = require('../Controller/ValidationController');
const  authenticate  = require('../Middleware/Authenticate');

// Schemas
router.post('/schemas', authenticate, validationController.createValidationSchema);
router.put('/schemas/:id', authenticate, validationController.updateValidationSchema);
router.get('/schemas', authenticate, validationController.getAllValidationSchemas);
router.get('/schemas/:id', authenticate, validationController.getValidationSchemaById);
router.get('/schemas/:schemaId/versions', authenticate, validationController.getSchemaVersions);
router.post('/schemas/:id/rollback', authenticate , validationController.rollbackValidationSchema);
router.post('/schemas/:id/reactivateVersion', authenticate , validationController.reactivateValidationSchema);


// Requests
router.post('/requests', authenticate, validationController.createValidationRequest);
router.patch('/requests/:requestId/approve/:stepOrder', authenticate, validationController.approveStep);
router.patch('/requests/:requestId/reject/:stepOrder', authenticate, validationController.rejectStep);
router.get('/requests/approver', authenticate, validationController.getRequestsForApprover);
router.get('/request/:id', authenticate, validationController.getValidationRequest);
router.get('/requests/user/:userId', authenticate, validationController.getUserValidationRequests);
router.patch('/requests/:id/cancel', authenticate, validationController.cancelValidationRequest);
router.patch('/requests/:requestId/skip/:stepOrder', authenticate, validationController.skipStep);
router.post('/requests/expire', authenticate, validationController.forceExpirationCheck);
module.exports = router;