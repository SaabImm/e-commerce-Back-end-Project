const express = require('express');
const router = express.Router();
const productsController = require('../Controller/productsController');
const { verifyToken, authorizeRoles } = require('../middleware/auth');

// Public routes - anyone can view products
router.get('/', productsController.getAllProducts);
router.get('/:id', productsController.getProductById);
router.get('/category=/:category', productsController.getAllByCategory);

// Admin-only routes
router.post('/', verifyToken, authorizeRoles('admin'), productsController.createProduct);
router.delete('/', verifyToken, authorizeRoles('admin'), productsController.deleteAllProducts);
router.delete('/:id', verifyToken, authorizeRoles('admin'), productsController.deleteProduct);
router.patch('/:id', verifyToken, authorizeRoles('admin'), productsController.updateProduct);
router.put('/:id', verifyToken, authorizeRoles('admin'), productsController.resetProduct);

module.exports = router;
