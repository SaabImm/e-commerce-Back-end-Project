require("dotenv").config();
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

transporter.sendMail({
  from: process.env.EMAIL_USER,
  to: "yourfriend@example.com",
  subject: "Test Email",
  html: "<h1>Hello, this is a test</h1>",
})
  .then(info => console.log("Sent:", info))
  .catch(err => console.error("Error:", err));


  
