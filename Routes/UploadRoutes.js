const express = require('express');
const router = express.Router();
const upload = require('../Config/multer'); 
const FileController = require("../Controller/FileController");
const authorizeRoles= require("../Middleware/AuthorizeRole");
const authenticate= require("../Middleware/Authenticate")
const FileOwnership= require('../Middleware/FileOwnership')
const FileSizeLimit= require("../Helpers/fileSizeLimit")
const fileNumberLimit= require ('../Helpers/filesNumberLimit')
const fileTypeFilter= require('../Helpers/fileTypeFilter')
//router.post('/', upload.single('file'), FileController.uploadFile);
//user id
router.post('/:id', authenticate , upload.single('file'), fileTypeFilter('jpg',"pdf", "zip"), fileNumberLimit(10, 'uploads'), FileSizeLimit(10),  FileController.uploadFile);
router.patch('/:id', authenticate, FileOwnership(false), authorizeRoles("admin"), upload.single('file'), FileSizeLimit(5), FileController.replaceFile);

//file id
router.delete('/:id', authenticate, FileOwnership(false), authorizeRoles("admin"), FileController.deleteFile);
router.delete('/all/:id', FileController.clearUserFiles);
router.get('/:id', FileController.getFileById);
module.exports = router;
    