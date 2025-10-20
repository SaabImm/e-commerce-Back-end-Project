require('dotenv').config();
const express = require("express");

// Created the app
const app = express();
app.use(express.json());
const productsRouter = require('./Routes/productsRoute')
const ordersRouter = require('./Routes/ordersRoutes')
const usersRouter = require('./Routes/UsersRoutes')
const CategoryRouter = require('./Routes/CategoryRoutes')
//another route
app.use("/api/products", productsRouter);
app.use("/api/category", CategoryRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/user", usersRouter);
//MongoDB connection
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URI)
.then(() => console.log('✅ Connected to MongoDB with Mongoose'))
.catch(err => console.error('❌ Connection failed:', err));

// Server listening
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
