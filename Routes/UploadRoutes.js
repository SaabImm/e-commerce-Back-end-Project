const express = require('express');
const router = express.Router();
const upload = require('../Config/multer'); 
const FileController = require("../Controller/FileController");

//router.post('/', upload.single('file'), FileController.uploadFile);
router.post('/:id', upload.single('file'), FileController.uploadFile);
router.delete('/:id', FileController.deleteFile);
router.patch('/:id',upload.single('file'), FileController.replaceFile);
router.delete('/all/:id', FileController.clearUserFiles);
router.get('/:id', FileController.getFileById);
module.exports = router;
