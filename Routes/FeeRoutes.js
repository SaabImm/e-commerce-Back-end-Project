// routes/cotisations.js
const express = require('express');
const router = express.Router();
const authenticate = require('../Middleware/Authenticate');
const CotisationController = require('../Controller/FeeController');

router.use(authenticate);

// Routes admin / lecture
router.get('/', CotisationController.getCotisations);
router.get('/stats', CotisationController.getStats);
router.get('/:id', CotisationController.getCotisationById);
router.get('/user/:userId', CotisationController.getUserCotisations);



router.post('/', CotisationController.createCotisation);
router.post('/bulk-create', CotisationController.bulkCreateCotisations);
router.patch('/:id', CotisationController.updateCotisation);
router.patch('/pay/:id', CotisationController.payCotisation);
router.delete('/:id', CotisationController.cancelCotisation);

//super admin only
router.delete('/super-admin/all', CotisationController.deleteAllCotisations);
router.delete('/:id/delete', CotisationController.deleteCotisation);



module.exports = router;