
const nodemailer = require("nodemailer");

// Create transporter once
const transporter = nodemailer.createTransport({
  service: "gmail", // or "outlook", etc.
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Generic email sender
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML content of the email
 * @param {Array} [options.attachments] - Optional attachments (array of objects with filename, content, path, etc.)
 * @returns {Promise<void>}
 */
const sendEmail = async ({ to, subject, html, attachments = [] }) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      html,
      attachments,
    });
    console.log(`✅ Email sent to ${to}: ${info.response}`);
  } catch (err) {
    console.error(`❌ Error sending email to ${to}:`, err);
    throw new Error("Email sending failed");
  }
};

/**
 * Send verification email (compatible with existing code)
 * @param {string} to - Recipient email
 * @param {string} token - Verification token
 * @param {string} mode - "signup" or other (default "signup")
 */
const sendVerificationEmail = async (to, token, mode = "signup") => {
  const verifyUrl = `${process.env.VERIFY_URL}?token=${encodeURIComponent(token)}&mode=${mode}`;
  const subject = "Verify your email";
  const html = `
    <h2>Hello!</h2>
    <p>Please click this link to verify your email:</p>
    <a href="${verifyUrl}">${verifyUrl}</a>
  `;
  await sendEmail({ to, subject, html });
};

module.exports = { sendEmail, sendVerificationEmail };