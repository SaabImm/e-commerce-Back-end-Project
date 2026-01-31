const mongoose = require('mongoose'); 
const cloudinary = require('../Config/claudinary'); 
const streamifier = require('streamifier');
const File = require('../Models/FilesModels')
const User = require ("../Models/UsersModels")



exports.uploadFile = async (req, res) => {
  try {
    const id = req.params.id || req.params._id
    const folder = req.body.folder || "misc";

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: `${folder}/${id}`},
      async (error, result) => {
        try {
          if (error) {
            return res.status(500).json({
              message: 'Cloudinary error',
              error
            });
          }
          
          const {
            secure_url,
            public_id,
            format
          } = result;
          
          const newFile = new File({
            url: secure_url,
            fileName: req.file.originalname,
            type: format,
            folder: folder,
            fileId: public_id,
            owner: id
          });

          const savedFile = await newFile.save();
        const updatedUser = await User.findByIdAndUpdate(
            id,
            { $push: { files: savedFile._id } },
            { new: true }
          ).populate("files");
          return res.status(201).json({
            message: 'File uploaded successfully',
            file: savedFile,
            user: updatedUser            
          });

        } catch (dbError) {
          return res.status(500).json({
            message: 'Database error',
            error: dbError
          });
        }
      }
    );

    streamifier.createReadStream(req.file.buffer).pipe(uploadStream);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Server error',
      error: err
    });
  }
};

exports.getFileById = async (req, res) => {
  try{
    const {id}= req.params;
    const file = await File.findById(id)
        if(!file) {
      return res.status(404).json({
        message: "File not found"
      })
    }
     return res.status(201).json({
      message: 'File Found',
      file: file
  })
  }
  catch(err){console.error(err);
    return res.status(500).json({
      message: 'Server error',
      error: err
    });}
  
}

exports.getFileByUser = async (req, res) => {
   try{
    const {id}= req.params;
    const file = await File.findById(id)
        if(!file) {
      res.status(404).json({
        message: "File not found"
      })
    }
     res.status(201).json({
      message: 'File Found',
      file: file
  })
  }
  catch(err){console.error(err);
    res.status(500).json({
      message: 'Server error',
      error: err
    });}
  
}
exports.deleteFile = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Find file FIRST (do NOT delete yet)
    const file = await File.findById(id);
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    // 2️⃣ Delete from Cloudinary
    const cloudRes = await cloudinary.uploader.destroy(file.fileId);

    if (cloudRes.result !== "ok") {
      return res.status(500).json({
        message: "Cloudinary deletion failed",
        cloudinary: cloudRes
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
        file.owner,
        { $pull: { files: file._id } },
        { new: true }
      ).populate("files");

    // 3️⃣ Delete from DB only after Cloudinary succeeds
    await File.findByIdAndDelete(id);
    

    // 4️⃣ Respond
    return res.status(200).json({
      user : updatedUser,
      message: "File deleted successfully"
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
};

exports.clearUserFiles = async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Make sure user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2️⃣ Get all files belonging to this user
    const files = await File.find({ owner: id });

    // 3️⃣ Delete files from Cloudinary
    for (const file of files) {
      if (file.fileId) {
        await cloudinary.uploader.destroy(file.fileId);
      }
    }

    // 4️⃣ Delete file documents from DB
    await File.deleteMany({ owner: id });

    // 5️⃣ Empty user's files array
    user.files = [];
    await user.save();

    // 6️⃣ Respond
    return res.status(200).json({
      message: "All user files deleted successfully",
      deletedCount: files.length
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
};

exports.replaceFile = async (req, res) => {
  try {
    const {id} = req.params;
    //find the file
    const oldFile = await File.findById(id)
        if (!oldFile) {
      return res.status(404).json({ message: "File not found" });
    }
    //upload it to claudinary and update db
    const folder = req.body.folder || "misc";
    const newFile = req.file
    if (!newFile) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: `${folder}/${oldFile.owner}`},
      async (error, result) => {
        try {
          if (error) {
            return res.status(500).json({
              message: 'Cloudinary error',
              error
            });
          }
          
          const {
            secure_url,
            public_id,
            format
          } = result;

          const createdFile = new File({
            url: secure_url,
            fileName: newFile.originalname,
            type: format,
            folder: folder,
            fileId: public_id,
            owner: oldFile.owner
          });

          const savedFile = await createdFile.save();

          //delete from claudinary
          const cloudRes = await cloudinary.uploader.destroy(oldFile.fileId);
          if (cloudRes.result !== "ok") {
            return res.status(500).json({
              message: "Cloudinary deletion failed",
              cloudinary: cloudRes
            });
          }

          await User.updateOne(
          { _id: oldFile.owner, files: oldFile },
          { $set: { "files.$": savedFile._id } }
        );

        const updatedUser = await User.findById(oldFile.owner).populate("files");

        //delete from db
        await File.findByIdAndDelete(id);

          return res.status(201).json({
            message: 'File replaced successfully',
            file: savedFile,
            user: updatedUser            
          });

        } catch (dbError) {
          return res.status(500).json({
            message: 'Database error',
            error: dbError
          });
        }
      }
    );

    streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
  }
   catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Server error",
      error: err.message
    });
  }
}
