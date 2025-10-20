const express = require('express');
const router = express.Router();
const categoryController = require('../Controller/CategoryController');

router.get('/', categoryController.getAllCategories);
router.get('/:id', categoryController.getCategoryById);
router.post('/', categoryController.createCategory);

module.exports = router;