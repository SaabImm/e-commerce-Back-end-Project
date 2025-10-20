const mongoose = require("mongoose");


const orderSchema = new mongoose.Schema({
  user: {type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true},
  products: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" }, // reference to Product collection
    quantity: { type: Number, min: 1, required: true },
    
  }],
  adress: {type: String},
  payMethod: {type: String, enum:["cash", "card"], default: "cash", require: true},
  total: {type: Number, default: 0},
  state: {type: String, enum:["pending", "confirmed"], default:"pending" }
},  { timestamps: true });

// Auto-calculate total before saving
orderSchema.pre("save", async function(next) {
  if (!this.isModified("products")) return next();

  try {
    // Populate product data to access prices
    await this.populate("products.product");
    this.total = this.products.reduce((sum, item) => {
      const price = item.product?.price || 0;
      return sum + price * item.quantity;
    }, 0);
    next();
  } catch (err) {
    next(err);
  }
});


//la collection s'appel Orders 
module.exports = mongoose.model("Orders", orderSchema);