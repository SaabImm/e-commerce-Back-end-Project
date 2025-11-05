require('dotenv').config();
const cors = require("cors");
const express = require("express");
// Created the app
const app = express();
//allow the front-end to access the back-end
const VITEURL = process.env.VITE_API_URL;
const allowedOrigins = [
  "http://localhost:5173",
  VITEURL
];

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json());

const usersRouter = require('./Routes/UsersRoutes')

const AuthRoutes = require('./Routes/AuthRoutes')

//define routes

app.use("/user", usersRouter);
app.use("/auth", AuthRoutes);




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
