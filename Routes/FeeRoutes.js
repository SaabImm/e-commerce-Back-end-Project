// routes/cotisations.js
const express = require('express');
const router = express.Router();
const authenticate = require('../Middleware/Authenticate');
const CotisationController = require('../Controller/FeeController');

router.use(authenticate);

// Routes admin / lecture
router.get('/', CotisationController.getCotisations);


router.get('/stats', CotisationController.getStats);
router.get('/user/:userId', CotisationController.getUserCotisations);
//router.get('/:id', CotisationController.getCotisationById);




router.post('/', CotisationController.createCotisation);
router.post('/versement', CotisationController.versement);

router.post('/bulk-create', CotisationController.bulkCreateCotisations);
router.patch('/:id', CotisationController.updateCotisation);
//router.patch('/pay/:id', CotisationController.payCotisation);
router.patch('/cancel/:id', CotisationController.cancelCotisation);
router.patch('/reactivate/:id', CotisationController.reactivateCotisation);


//super admin only
router.delete('/super-admin/all', CotisationController.deleteAllCotisations);
router.delete('/:id', CotisationController.deleteCotisation);

//definition Routes

router.get('/definitions', CotisationController.getAllDefinitions);
router.post('/definitions', CotisationController.createDefinition);
router.put('/definitions/:id', CotisationController.updateDefinition);
router.delete('/definitions/:id', CotisationController.deleteDefinition);
router.get('/:id', CotisationController.getCotisationById);
module.exports = router;