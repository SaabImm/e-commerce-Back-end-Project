let Product = require('../Models/ProductModels')
let Categories = require('../Models/CategoryModel')
const mongoose = require('mongoose');

exports.getAllProducts= async (req,res) =>{
   try{
      const data = await Product.find()
      res.json(data)
      if(!data) {res.status(404).json({message: "Product Not Found"})}
   } 
   catch(error){
    res.status(500).json({message: 'Server Error', error: error})
   }
};

exports.getProductById = async(req, res) => {
  try {
    //convert to number
    const {id} = req.params; 
    //verifies if it's anything but a number
    if (!mongoose.isValidObjectId(id)) {  
     return res.status(400).json({ message: "Invalid ID format / Bad Request " });
    }
    //finds the product if it exists
    const p = await Product.findById(id);
    console.log("📦 Product found:", p);
    if (!p){ return res.status(404).json({ message: "Product Not Fount " });}
    //returns the product in json
    return res.json(p);
    } 
   catch(error){
    res.status(500).json({message: 'Server Error', error: error})
   }
};

exports.createProduct = async (req, res) => {
  try {
    const {name, price, description, category, stock}=req.body
    if (!name || !price || !description || !category || !stock ) {
    return  res.status(400).json({ error: "Missing required fields" });
}
  const catId = await Categories.findOne({name: category})
  if(!catId) {return res.status(400).json({message: 'Unexisting Category'})}
  //Create the entry
  const newProduct= new Product({
    name, price, description, category: catId._id, stock,
  })
  const savedElement= await newProduct.save()
  //reponds with the data and a success message
  res.status(201).json({
    message: "Product created successfully!",
    data: savedElement
  });
}   catch(error){
    res.status(500).json({message: 'Server Error', error: error})
   }
};

exports.deleteProduct= async (req, res) => {
  try{
// verifies if it's anything but a number
    const {id} = req.params
  if (!mongoose.isValidObjectId(id)) { 
    return res.status(400).json({ message: "Invalid ID format / Bad Request " });
  }
//Finds the Element
  const deletedProduct = await Product.findByIdAndDelete(id);
  
  if (!deletedProduct) {
    return res.status(404).json({ message: "Product not found" });
  }
   res.json({message: `Element ${id} is deleted`})
 }
 catch(err) {
    res.status(500).json({ error: err });
    console.log(err)
}

};

exports.deleteAllProducts= async (req, res) =>{
  try{
    //this will also verify roles later
    const dataCount= await Product.countDocuments();
    if(dataCount === 0){
      return res.status(404).json({message : "No products found"})
    }
    await Product.deleteMany({});
    return res.json({message : "Data deleted successfully!!"})
  }
   catch(error){
    res.status(500).json({message: 'Server Error', error: error})
   }
};


exports.updateProduct = async (req, res) =>{
  try{
    const {id} = req.params; 
    //verifies if it's anything but a number
    if (!mongoose.isValidObjectId(id)) {  
     return res.status(400).json({ message: "Invalid ID format / Bad Request " });
    }

    //update the thing
    const updatedProduct= await Product.findByIdAndUpdate(id,req.body,{ new: true, runValidators: true } )
    if(!updatedProduct){return res.status(404).json({message: "Product not found"})}
  //response message
    return res.status(200).json({
    message: "Product updated successfully!",
    data: updatedProduct
  });

  }

  catch(error){
    console.log(error)
    res.status(500).json({message: 'Server Error', error: error})

   }
}


exports.resetProduct = async (req, res) =>{
  try{
    const {id} = req.params; 
    //verifies if it's anything but a number
    if (!mongoose.isValidObjectId(id)) {  
     return res.status(400).json({ message: "Invalid ID format / Bad Request " });
    }
    //checks for empty fields
    const {name, price, description, category, stock}=req.body
    if (!name || !price || !description || !category || !stock ) {
    return  res.status(400).json({ error: "Missing required fields" });
    }

    //update the thing
    const updatedProduct= await Product.findByIdAndUpdate(id,{
    name, price, description, category, stock,
  }, { new: true, runValidators: true } )
    if(!updatedProduct){return res.status(404).json({message: "Product not found"})}
  //response message
    return res.status(200).json({
    message: "Product reset successfully!",
    data: updatedProduct
  });

  }

  catch(error){
    
    console.error(error);
    res.status(500).json({message: 'Server Error', error: error})
   }
}

exports.getAllByCategory = async(req, res) =>{
  try{
    const {category} = req.params;
    const cat= await Categories.findOne({name: category})
    if (!cat) {return res.status(400).json({ error: 'Invalid category' });}
    const foundProducts = await Product.find({category: cat._id})

    
    if(foundProducts.length===0){return res.status(404).json({message: "No Products In this Category"});}
   
    return res.status(200).json({
      message: "Products Found",
      Products: foundProducts
    })
  }
  catch(error){
  console.error(error); 
  return res.status(500).json({message: 'Server Error', error: error})
  }
}
