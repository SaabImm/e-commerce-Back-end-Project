// const { Resend } = require("resend");
// const resend = new Resend(process.env.RESEND_API_KEY);

// const sendVerificationEmail = async (email, token, mode = "signup") => {
//   const verifyUrl = `${process.env.VERIFY_URL}?token=${encodeURIComponent(token)}&mode=${mode}`;

//   try {
//     await resend.emails.send({
//       from: "onboarding@resend.dev",
//       to: email,
//       subject: "Verify your email",
//       html: `
//         <h2>Hello!</h2>
//         <p>Please click this link <a href="${verifyUrl}">${verifyUrl} </a> to verify your email.</p>
//       `,
//       click_tracking: false
//     });
//   } catch (error) {
//     console.error("❌ Error sending email:", error);
//     throw new Error("Email sending failed");
//   }
// };

// module.exports = sendVerificationEmail;


const nodemailer = require("nodemailer");

// ⚡ Create transporter

const transporter = nodemailer.createTransport({
  service: "gmail", // can be "outlook" or others
  auth: {
    user: process.env.EMAIL_USER, // your Gmail address
    pass: process.env.EMAIL_PASS, // your Gmail App Password if 2FA enabled
  },
});

// ⚡ Hardcoded email sender
const sendVerificationEmail = async (to, token, mode= "signup") => {
  try {
    const verifyUrl = `${process.env.VERIFY_URL}?token=${encodeURIComponent(token)}&mode=${mode}`;
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,          // sender
      to,       // recipient 
      subject: "Test Email from Node.js",    // hardcoded subject
      html: `
        <h2>Hello!</h2>
        <p>This is a test email from Node.js/Express.</p>
        <a href=${verifyUrl}>Click here ${verifyUrl}</a>
      `,                                      // hardcoded HTML
    });

    console.log("✅ Email sent:", info.response);
  } catch (err) {
    console.error("❌ Error sending email:", err);
  }
};

module.exports = sendVerificationEmail;
