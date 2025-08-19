import nodemailer from "nodemailer";

export const sendResetEmail = async (to: string, token: string) => {
  // Check if email credentials are configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("⚠️  Gmail credentials not configured. Using Ethereal email for development.");
    console.warn("📧 To enable real email functionality, add EMAIL_USER and EMAIL_PASS to your .env file");
    
    try {
      // Use Ethereal email for development (fake SMTP)
      const testAccount = await nodemailer.createTestAccount();
      
      const transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });

      const resetUrl = `http://localhost:3000/auth/reset-password?token=${token}`;

      const mailOptions = {
        from: `"Nathan Backend" <${testAccount.user}>`,
        to,
        subject: "Password Reset Request",
        html: `
          <h2>Password Reset Request</h2>
          <p>You requested a password reset for your account.</p>
          <p><strong>Reset Token:</strong> ${token}</p>
          <p><a href="${resetUrl}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Click here to reset password</a></p>
          <p>Or copy this URL: ${resetUrl}</p>
          <p>This token will expire in 1 hour.</p>
        `,
      };

      const info = await transporter.sendMail(mailOptions);
      
      console.log(`✅ Development email sent to ${to}`);
      console.log(`🔗 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      console.log(`🔑 Reset token: ${token}`);
      console.log(`🔗 Reset URL: ${resetUrl}`);
      
      return;
    } catch (error) {
      console.error("❌ Error with Ethereal email:", error);
      // Fallback to just logging the token
      console.log(`🔑 Password reset token for ${to}: ${token}`);
      console.log(`🔗 Reset URL: http://localhost:3000/auth/reset-password?token=${token}`);
      return;
    }
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const resetUrl = `http://localhost:3000/auth/reset-password?token=${token}`;
    // const resetUrl = `https://jamie-nine.vercel.app/reset-password?token=${token}`;

    const mailOptions = {
      from: "Hot Market Design DTF <no-reply@dtfstickers.com>",
      to,
      subject: "Password Reset Request",
      html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Click here to reset</a> your password.</p>`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Production email sent to ${to}`);
  } catch (error) {
    console.error("❌ Error sending email:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to send email: ${errorMessage}`);
  }
};