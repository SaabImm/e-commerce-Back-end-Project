import { Resend } from 'resend';
import jwt from 'jsonwebtoken';

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendVerificationEmail = async (userEmail, userId) => {
  try {
    // Generate a verification token
    const token = jwt.sign(
      { id: userId },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    // Create your verification URL
    const verificationLink = `${process.env.VITE_API_URL}/verify/${token}`;

    // Send the email via Resend API
    await resend.emails.send({
      from: 'Your App <onboarding@resend.dev>', // you can later verify your own domain
      to: userEmail,
      subject: 'Verify your email address',
      html: `
        <h2>Email Verification</h2>
        <p>Click below to verify your account:</p>
        <a href="${verificationLink}">Verify Email</a>
      `,
    });

    console.log('✅ Verification email sent via Resend');
  } catch (error) {
    console.error('❌ Error sending email:', error);
  }
};
