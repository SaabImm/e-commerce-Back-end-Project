const express = require('express');
const router = express.Router();

const productsController=require('../Controller/productsController')

router.get('/', productsController.getAllProducts);
router.get('/:id', productsController.getProductById);
router.get('/category=/:category', productsController.getAllByCategory);
router.post('/', productsController.createProduct);
router.delete('/', productsController.deleteAllProducts);
router.delete('/:id', productsController.deleteProduct);
router.patch('/:id', productsController.updateProduct);
router.put('/:id', productsController.resetProduct);

module.exports = router;
