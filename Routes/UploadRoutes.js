const express = require('express');
const router = express.Router();
const upload = require('../Config/multer'); 
const FileController = require("../Controller/FileController");
const authorizeRoles= require("../Middleware/AuthorizeRole");
const authenticate= require("../Middleware/Authenticate")
const FileOwnership= require('../Middleware/FileOwnership')
const FileSizeLimit= require("../Helpers/fileSizeLimit")


//router.post('/', upload.single('file'), FileController.uploadFile);
//user id 
router.post('/:id', authenticate , upload.single('file'), FileSizeLimit(1), FileController.uploadFile);
router.patch('/:id', authenticate, FileOwnership(false), authorizeRoles("admin"), upload.single('file'), FileController.replaceFile);

//file id
router.delete('/:id', authenticate, FileOwnership(false), authorizeRoles("admin"), FileController.deleteFile);
router.delete('/all/:id', authenticate, authorizeRoles('admin'), FileController.clearUserFiles);
router.get('/:id', FileController.getFileById);
module.exports = router;
    