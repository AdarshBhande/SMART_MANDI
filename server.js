/**
 * server.js — Smart Mandi Token System (SIH 2026)
 * Zero-dependency local development HTTP server.
 * Run with: node server.js
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf'
};

const handler = (req, res) => {
  const urlPath = req.url.split('?')[0];

  // API Proxy for Gemini AI (Secure server-side API Key handling)
  const cleanPath = urlPath.replace(/\/$/, '');
  if ((cleanPath === '/api/gemini') && req.method === 'POST') {
    let body = '';
    let bodySize = 0;
    const MAX_BODY_SIZE = 65536; // 64KB max

    req.on('data', chunk => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_SIZE) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, reason: 'PAYLOAD_TOO_LARGE' }));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });

    req.on('end', async () => {
      if (res.writableEnded) return;

      try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, reason: 'NO_SERVER_API_KEY' }));
          return;
        }

        if (!body || body.trim().length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, reason: 'EMPTY_BODY' }));
          return;
        }

        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, reason: 'INVALID_JSON' }));
          return;
        }

        if (!payload.prompt || typeof payload.prompt !== 'string' || payload.prompt.trim().length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, reason: 'MISSING_PROMPT' }));
          return;
        }

        if (payload.prompt.length > 5000) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, reason: 'PROMPT_TOO_LONG' }));
          return;
        }

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

        const reqBody = {
          contents: [
            {
              role: 'user',
              parts: [
                { text: `${payload.systemPrompt || ''}\n\nUser Question: ${payload.prompt}` }
              ]
            }
          ]
        };

        const https = require('https');
        const proxyReq = https.request(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 10000 // 10s timeout
        }, (proxyRes) => {
          let resData = '';
          proxyRes.on('data', c => { resData += c.toString(); });
          proxyRes.on('end', () => {
            try {
              const parsed = JSON.parse(resData);
              if (parsed.error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, reason: parsed.error.message || 'GEMINI_API_ERROR' }));
                return;
              }
              const answerText = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "Unable to retrieve AI response.";
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true, answer: answerText }));
            } catch {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, reason: 'PARSE_ERROR' }));
            }
          });
        });

        proxyReq.on('timeout', () => {
          proxyReq.destroy();
          res.writeHead(540, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, reason: 'TIMEOUT' }));
        });

        proxyReq.on('error', (err) => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, reason: 'GATEWAY_ERROR' }));
        });

        proxyReq.write(JSON.stringify(reqBody));
        proxyReq.end();

      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, reason: 'BAD_REQUEST' }));
      }
    });
    return;
  }

  // API Proxy for Local SMS Dispatch via Twilio
  if ((cleanPath === '/api/send-sms') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { mobile, message } = payload;
        if (!mobile || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, reason: 'MISSING_FIELDS' }));
          return;
        }

        let config = {};
        const configPath = path.join(__dirname, 'functions', '.runtimeconfig.json');
        if (fs.existsSync(configPath)) {
          config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }

        const twilioSid   = (config.twilio && config.twilio.sid) || process.env.TWILIO_SID;
        const twilioToken = (config.twilio && config.twilio.token) || process.env.TWILIO_TOKEN;
        const twilioFrom  = (config.twilio && config.twilio.from) || process.env.TWILIO_FROM;

        if (!twilioSid || !twilioToken || !twilioFrom) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, reason: 'TWILIO_NOT_CONFIGURED' }));
          return;
        }

        const basicAuth = Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64');
        const cleanMobile = String(mobile).replace(/\D/g, '').slice(-10);
        const twilioBody = new URLSearchParams({
          To:   `+91${cleanMobile}`,
          From: twilioFrom,
          Body: message
        });

        const https = require('https');
        const proxyReq = https.request(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type':  'application/x-www-form-urlencoded'
          }
        }, (proxyRes) => {
          let resData = '';
          proxyRes.on('data', c => { resData += c.toString(); });
          proxyRes.on('end', () => {
            try {
              const parsed = JSON.parse(resData);
              if (parsed.sid) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, provider: 'twilio', messageId: parsed.sid }));
              } else {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: parsed.message, code: parsed.code }));
              }
            } catch {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: false, reason: 'PARSE_ERROR' }));
            }
          });
        });

        proxyReq.write(twilioBody.toString());
        proxyReq.end();
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, reason: err.message }));
      }
    });
    return;
  }

  let safePath = path.normalize(urlPath).replace(/^(\.\.[\/\\])+/, '');
  
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  let filePath = path.join(PUBLIC_DIR, safePath);

  if (!path.extname(filePath) && fs.existsSync(filePath + '.html')) {
    filePath = filePath + '.html';
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const fallback = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(fallback, (fErr, content) => {
        if (fErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    fs.createReadStream(filePath).pipe(res);
  });
};

if (require.main === module) {
  const server = http.createServer(handler);
  server.listen(PORT, () => {
    console.log('============================================================');
    console.log('  🌾 Smart Mandi Token & Queue Management System (SIH 2026) ');
    console.log('============================================================');
    console.log(`  🚀 Local Server running at: http://localhost:${PORT}`);
    console.log('');
    console.log('  Direct Access Pages:');
    console.log(`  👉 1. Farmer Registration: http://localhost:${PORT}/`);
    console.log(`  👉 2. Live Token Tracker:  http://localhost:${PORT}/tracker.html`);
    console.log(`  👉 3. Mandi Admin Portal:  http://localhost:${PORT}/admin.html`);
    console.log('============================================================');
    console.log('  Press Ctrl+C to stop the server.');
  });
}

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
