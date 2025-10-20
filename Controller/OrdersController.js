let Orders = require("../Models/OrderModels")

exports.getAllOrders= async (req,res) =>{
   try{
      const data = await Orders.find().populate("products.product")
      res.json(data)
   } 
   catch(error){
    res.status(404).json({message: "Product Not Fount "})
   }
};


exports.createOrder = async (req, res) => {
  try {
  //Create the entry
  const newOrder= new Orders(req.body)
  //newOrder.id=ID;
  const savedOrder= await newOrder.save()
  //reponds with the data and a success message
  res.status(201).json({
    message: "Order created successfully!",
    data: savedOrder
  });
} catch(err) {
    res.status(500).json({ error: err });
    console.log(err)
}
};