const fs = require('fs');
const path = require('path');

const configFile = path.join(__dirname, '../functions/.runtimeconfig.json');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

const twilioSid   = config.twilio.sid;
const twilioToken = config.twilio.token;
const twilioFrom  = config.twilio.from;
const recipient   = '9969569409';

console.log('Sending Test SMS via Twilio API...');
console.log('SID:', twilioSid);
console.log('From:', twilioFrom);
console.log('To:', recipient);

async function sendSms() {
  const basicAuth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
  const body = new URLSearchParams({
    To:   `+91${recipient}`,
    From: twilioFrom,
    Body: `Smart Mandi Test SMS! Your token MANDI-20260908-TEST is confirmed.`
  });

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type':  'application/x-www-form-urlencoded'
      },
      body: body
    });

    const data = await res.json();
    console.log('Twilio API Response HTTP Status:', res.status);
    console.log('Twilio API Response Data:', JSON.stringify(data, null, 2));

    if (data.sid) {
      console.log('🎉 SUCCESS! Message SID:', data.sid);
    } else {
      console.error('❌ FAILED! Error Code:', data.code, '-', data.message);
    }
  } catch (err) {
    console.error('Network Error:', err);
  }
}

sendSms();
