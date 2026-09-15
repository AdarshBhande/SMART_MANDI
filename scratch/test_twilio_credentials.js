const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../functions/.runtimeconfig.json'), 'utf8'));

console.log('Testing Twilio Configuration:');
console.log('- SID:', config.twilio.sid);
console.log('- From:', config.twilio.from);
console.log('- Token length:', config.twilio.token ? config.twilio.token.length : 0);

async function testTwilio() {
  const twilioSid = config.twilio.sid;
  const twilioToken = config.twilio.token;
  const twilioFrom = config.twilio.from;

  const basicAuth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
  
  try {
    const twilioResp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}.json`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${basicAuth}`
        }
      }
    );

    const data = await twilioResp.json();
    if (twilioResp.ok) {
      console.log('✅ Twilio Credentials Validated Successfully!');
      console.log('   Account Name:', data.friendly_name);
      console.log('   Account Status:', data.status);
      console.log('   Account Type:', data.type);
    } else {
      console.warn('⚠️ Twilio returned API response:', data);
    }
  } catch (err) {
    console.error('❌ Network error testing Twilio:', err.message);
  }
}

testTwilio();
