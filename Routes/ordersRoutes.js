const express = require('express');
const router = express.Router();

const ordersController = require('../Controller/OrdersController')

router.get('/', ordersController.getAllOrders);
//router.get('/:id', ordersController.getOrderById);
router.post('/', ordersController.createOrder);
//router.delete('/', ordersController.deleteAllOrders);
//router.delete('/:id', ordersController.deleteOrder);

module.exports = router;
