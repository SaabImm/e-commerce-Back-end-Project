const express = require('express');
const router = express.Router();
const authenticate = require('../Middleware/Authenticate');
const PayementController = require('../Controller/PayementController')

router.use(authenticate);

router.get('/user/:userId', PayementController.getPaymentsForUser);


module.exports = router;
