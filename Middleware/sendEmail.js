const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const sendVerificationEmail = async (email, token, mode = "signup") => {
  const verifyUrl = `${process.env.VERIFY_URL}?token=${encodeURIComponent(token)}&mode=${mode}`;

  try {
    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: "Verify your email",
      html: `
        <h2>Hello!</h2>
        <p>Please click this link <a href="${verifyUrl}">here</a> to verify your email.</p>
      `,
      click_tracking: false
    });
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw new Error("Email sending failed");
  }
};

module.exports = sendVerificationEmail;
