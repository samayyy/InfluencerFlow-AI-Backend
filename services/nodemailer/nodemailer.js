const nodemailer = require('nodemailer')

class MailService {
  constructor () {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false, // true for port 465
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    })
  }

  async sendBrandCollabEmail ({
    to,
    name,
    brandName,
    platform
  }) {
    const mailOptions = {
      from: `"${brandName}" <${process.env.SMTP_USER}>`,
      to,
      subject: `🤝 Collaboration Opportunity with ${brandName}`,
      html: `
        <p>Hi ${name},</p>

        <p>
          I hope you're doing well. I'm reaching out on behalf of <strong>${brandName}</strong> as we’ve been following your content and are truly impressed by your creativity and engagement with your audience.
        </p>

        <p>
          We're planning a new campaign and believe your profile aligns perfectly with our brand’s goals. We’d love to explore a paid collaboration with you, tailored to your style and audience on <strong>${platform}</strong>.
        </p>
        
        <p>
          The proposal includes promotional content that resonates with your audience. We'd be happy to discuss specifics such as deliverables, timelines, and compensation in more detail.
        </p>

        <p>
          To move things forward efficiently, we’d appreciate it if you could share your preferred contact number. This will help us coordinate more seamlessly and answer any questions you might have.
        </p>

        <p>
          Looking forward to your response and hopefully working together soon.
        </p>

        <p>Warm regards,<br/>
        The <strong>${brandName}</strong> Team</p>
      `
    }

    try {
      const info = await this.transporter.sendMail(mailOptions)
      console.log(`✅ Mail sent to ${to}: ${info.messageId}`)
      return info
    } catch (err) {
      console.error(`❌ Failed to send email to ${to}`, err)
      throw err
    }
  }
}

module.exports = new MailService()
