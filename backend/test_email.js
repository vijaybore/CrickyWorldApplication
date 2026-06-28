require('dotenv').config();

async function testEmail() {
  const to = 'test@example.com';
  console.log('Testing Brevo');
  try {
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender:   { name: 'Test', email: process.env.MAIL_FROM_EMAIL },
        to:       [{ email: to }],
        subject: 'Test',
        htmlContent: 'Test',
      }),
    });
    const result = await resp.json();
    console.log('Brevo response:', resp.status, result);
  } catch (e) {
    console.error('Brevo fetch error:', e);
  }

  console.log('Testing Resend');
  try {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to,
      subject: 'Test',
      html: 'Test',
    });
    console.log('Resend response:', data, error);
  } catch (e) {
    console.error('Resend error:', e);
  }
}
testEmail();
