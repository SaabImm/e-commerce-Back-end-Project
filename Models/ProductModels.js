const mongoose = require("mongoose");

  const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true, min:0 },
    description: { type: String, required: true, maxlength: 300},
    longDescription: {type: String},
    image: {type: String},
    rating: {type: Number, min:0, max:5},
    category:{type: mongoose.Schema.Types.ObjectId,
      ref: "Category",      
      required: true},
    stock:{type: Number, required:true, min:0},
    inStock: { type: Boolean, default: function() { return this.stock > 0; } }
  }, { timestamps: true });


//la collection s'appel Product 
module.exports = mongoose.model("Product", productSchema);