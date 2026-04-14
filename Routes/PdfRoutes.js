
const express = require('express');
const router = express.Router();
const authenticate = require('../Middleware/Authenticate')
const pdfController = require('../Controller/PdfController');

router.get('/payment/:id/receipt', authenticate, pdfController.downloadPaymentReceipt);

router.get('/versement/:id/receipt', authenticate, pdfController.downloadVersementReceipt);

router.get('/payment/:id/email', authenticate , pdfController.emailPaymentReceipt);


router.get('/versement/:id/email', authenticate , pdfController.emailVersementReceipt);


module.exports = router;