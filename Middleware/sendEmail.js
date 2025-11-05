import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendVerificationEmail = async (email, token) => {
  const verifyUrl = `https://back-end-signup-and-login.onrender.com/verify?token=${token}`;

  try {
    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: email,
      subject: "Verify your email",
      html: `
        <h2>Welcome!</h2>
        <p>Click <a href="${verifyUrl}">here</a> to verify your email.</p>
      `,
    });
    console.log("✅ Verification email sent to:", email);
  } catch (error) {
    console.error("❌ Error sending email:", error);
    throw error;
  }
  
};
