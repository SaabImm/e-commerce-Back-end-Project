const express = require('express');
const router = express.Router();
const categoryController = require('../Controller/CategoryController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');

// Public routes
router.get('/', categoryController.getAllCategories);
router.get('/:id', categoryController.getCategoryById);

// Admin-only route
router.post('/', verifyToken, authorizeRoles('admin'), categoryController.createCategory);

module.exports = router;
