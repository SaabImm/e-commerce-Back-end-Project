require('dotenv').config({
  path: `.env.${process.env.NODE_ENV || "development"}`
});
const cors = require("cors");
const express = require("express");
// Created the app
const app = express();

//allow the front-end to access the back-end
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const allowed = [
      process.env.CLIENT_URL,
      "http://localhost:5173"
    ];

    if (allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS blocked: " + origin));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
}));


app.use(express.json());

const usersRouter = require('./Routes/UsersRoutes')

const AuthRoutes = require('./Routes/AuthRoutes')
const UploadRoutes = require('./Routes/UploadRoutes')

//define routes

app.use("/user", usersRouter);
app.use("/auth", AuthRoutes);
app.use("/upload", UploadRoutes);

//MongoDB connection
const mongoose = require('mongoose');
mongoose.connect(process.env.MONGO_URL)
.then(() => console.log('✅ Connected to MongoDB with Mongoose'))
.catch(err => console.error('❌ Connection failed:', err));

// Server listening
const PORT = process.env.PORT;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
