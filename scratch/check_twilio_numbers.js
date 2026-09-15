const fs = require('fs');
const path = require('path');

const configFile = path.join(__dirname, '../functions/.runtimeconfig.json');
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));

const twilioSid   = config.twilio.sid;
const twilioToken = config.twilio.token;
const basicAuth   = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');

async function getTwilioNumbers() {
  console.log('Fetching Twilio Purchased Phone Numbers for Account:', twilioSid);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers.json`, {
      headers: { 'Authorization': `Basic ${basicAuth}` }
    });
    const data = await res.json();
    console.log('HTTP Status:', res.status);
    console.log('Phone Numbers Count:', data.incoming_phone_numbers ? data.incoming_phone_numbers.length : 0);
    if (data.incoming_phone_numbers) {
      data.incoming_phone_numbers.forEach(num => {
        console.log(`- Number: ${num.phone_number} | Capabilities: SMS=${num.capabilities.sms}`);
      });
    } else {
      console.log('Response:', data);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

getTwilioNumbers();
