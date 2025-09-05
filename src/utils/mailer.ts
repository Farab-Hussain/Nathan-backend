import nodemailer from "nodemailer";

export const sendResetEmail = async (to: string, code: string) => {
  // Check if email credentials are configured
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn(
      "⚠️  Gmail credentials not configured. Using Ethereal email for development."
    );
    console.warn(
      "📧 To enable real email functionality, add EMAIL_USER and EMAIL_PASS to your .env file"
    );

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

      const mailOptions = {
        from: `"Nathan Backend" <${testAccount.user}>`,
        to,
        subject: "Password Reset Code",
        html: `
          <h2>Password Reset Code</h2>
          <p>You requested a password reset for your account.</p>
          <p><strong>Your 6-digit reset code is:</strong></p>
          <div style="background: #f8f9fa; border: 2px solid #007bff; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${code}</h1>
          </div>
          <p><strong>Important:</strong></p>
          <ul>
            <li>This code will expire in 10 minutes</li>
            <li>Do not share this code with anyone</li>
            <li>If you didn't request this, please ignore this email</li>
          </ul>
          <p>Enter this code in the password reset form to continue.</p>
        `,
      };

      const info = await transporter.sendMail(mailOptions);

      console.log(`✅ Development email sent to ${to}`);
      console.log(`🔗 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      console.log(`🔑 Reset code: ${code}`);

      return;
    } catch (error) {
      console.error("❌ Error with Ethereal email:", error);
      // Fallback to just logging the code
      console.log(`🔑 Password reset code for ${to}: ${code}`);
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

    const mailOptions = {
      from: "Nathan Backend <no-reply@nathan.com>",
      to,
      subject: "Password Reset Code",
      html: `
        <h2>Password Reset Code</h2>
        <p>You requested a password reset for your account.</p>
        <p><strong>Your 6-digit reset code is:</strong></p>
        <div style="background: #f8f9fa; border: 2px solid #007bff; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${code}</h1>
        </div>
        <p><strong>Important:</strong></p>
        <ul>
          <li>This code will expire in 10 minutes</li>
          <li>Do not share this code with anyone</li>
          <li>If you didn't request this, please ignore this email</li>
        </ul>
        <p>Enter this code in the password reset form to continue.</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Production email sent to ${to}`);
  } catch (error) {
    console.error("❌ Error sending email via Gmail:", error);
    // Fallback to Ethereal in case of SMTP auth issues, do not throw to keep UX smooth in dev/test
    try {
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
      const mailOptions = {
        from: `Nathan Backend <${testAccount.user}>`,
        to,
        subject: "Password Reset Code",
        html: `
          <h2>Password Reset Code</h2>
          <p>You requested a password reset for your account.</p>
          <p><strong>Your 6-digit reset code is:</strong></p>
          <div style="background: #f8f9fa; border: 2px solid #007bff; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${code}</h1>
          </div>
          <p><strong>Important:</strong></p>
          <ul>
            <li>This code will expire in 10 minutes</li>
            <li>Do not share this code with anyone</li>
            <li>If you didn't request this, please ignore this email</li>
          </ul>
          <p>Enter this code in the password reset form to continue.</p>
        `,
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Fallback (Ethereal) email sent to ${to}`);
      console.log(`🔗 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      console.log(`🔑 Reset code: ${code}`);
      return;
    } catch (fallbackErr) {
      console.error("❌ Ethereal fallback failed:", fallbackErr);
      console.log(`🔑 Password reset code for ${to}: ${code}`);
      // Do not throw - we still want the flow to continue and user to see success
      return;
    }
  }
};
