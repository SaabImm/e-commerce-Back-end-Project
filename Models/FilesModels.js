const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema({
  url: {type: String, required: true},
  fileName: { type: String },
  type: { type: String},
  fileId: {type: String, required: true},
  folder:{type: String},
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
},
 { timestamps: true }
);



 module.exports = mongoose.model("File", fileSchema);