const express = require('express');
const router = express.Router();
const verifyToken = require('../Middleware/authToken')
const authorizeToken = require('../Middleware/AuthorizeToken')

const UserController=require('../Controller/UserController')

router.get('/', verifyToken, authorizeToken('admin'), UserController.getAllUsers);
router.get('/:id', UserController.getUserById);
router.get('/role=/:role', UserController.getAllByRole);
router.post('/', UserController.createUser);
router.delete('/', UserController.deleteAllUsers);
router.delete('/:id', UserController.deleteUserById);
router.patch('/:id', UserController.updateUser);
router.put('/:id', UserController.resetUser);

module.exports = router;
