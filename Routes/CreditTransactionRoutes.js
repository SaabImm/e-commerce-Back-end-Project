const express = require('express');
const router = express.Router();
const CreaditTransactionController  = require('../Controller/CreaditTransactionController');
const authenticate = require('../Middleware/Authenticate'); 

router.get('/user/:userId', authenticate, CreaditTransactionController.getUserCreditTransactions);

module.exports = router;