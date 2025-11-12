const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendVerificationEmail = async (email, token) => {
 const verifyUrl = `${process.env.FRONTEND_VERIFY_URL}?token=${encodeURIComponent(token)}`;


  try {
    await resend.emails.send({
      from: "onboarding@resend.dev", // or process.env.EMAIL_FROM
      to: email,
      subject: "Verify your email",
      html: `
        <h2>Welcome!</h2>
        <p>Please click this link <a href="${verifyUrl}">here</a> to verify your email.</p>
      `,
      click_tracking: false
    });



  } catch (error) {
    res.status(500).json({ message: "Error sending email" });
    console.error("❌ Error sending email:", error);
  }
};

module.exports =  sendVerificationEmail ;
