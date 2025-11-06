const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendVerificationEmail = async (email, token) => {
  const verifyUrl = `${process.env.VERIFY_URL}?token=${token}`;

  try {
    await resend.emails.send({
      from: "onboarding@resend.dev", // or process.env.EMAIL_FROM
      to: email,
      subject: "Verify your email",
      html: `
        <h2>Welcome!</h2>
        <p>Please click this link <a href="${verifyUrl}">here</a> to verify your email.</p>
      `,
    });

    console.log("✅ Verification email sent to:", email);

  } catch (error) {
    console.error("❌ Error sending email:", error);
  }
};

module.exports = { sendVerificationEmail };
