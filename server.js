const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = process.env.PORT || 3000;
const EO_API_KEY = process.env.EO_API_KEY;
const EO_LIST_ID = process.env.EO_LIST_ID;

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

function serveStatic(req, res) {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);

  if (!ext) filePath += '.html';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Try index.html for SPA fallback
      fs.readFile(path.join(__dirname, 'public', 'index.html'), (err2, fallback) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(fallback);
        }
      });
      return;
    }
    const mime = MIME[path.extname(filePath)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

function handleSubscribe(req, res) {
  // Check env vars are set
  if (!EO_API_KEY || !EO_LIST_ID) {
    res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Server misconfigured: missing EmailOctopus credentials' }));
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }

    if (!parsed.email) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Email required' }));
      return;
    }

    const postData = JSON.stringify({
      api_key: EO_API_KEY,
      email_address: parsed.email,
      fields: parsed.name ? { FirstName: parsed.name } : {},
      tags: parsed.tags || [],
      status: 'SUBSCRIBED',
    });

    const apiPath = `/api/1.6/lists/${EO_LIST_ID}/contacts`;
    console.log(`[subscribe] POST emailoctopus.com${apiPath} for ${parsed.email}`);

    const options = {
      hostname: 'emailoctopus.com',
      path: apiPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const eoReq = https.request(options, (eoRes) => {
      let eoBody = '';
      eoRes.on('data', chunk => { eoBody += chunk; });
      eoRes.on('end', () => {
        console.log(`[subscribe] EmailOctopus responded ${eoRes.statusCode}: ${eoBody}`);
        const headers = {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        };
        if (eoBody) {
          res.writeHead(eoRes.statusCode, headers);
          res.end(eoBody);
        } else {
          res.writeHead(eoRes.statusCode, headers);
          res.end(JSON.stringify({ ok: true }));
        }
      });
    });

    eoReq.on('error', (e) => {
      console.error(`[subscribe] Error: ${e.message}`);
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Failed to reach EmailOctopus: ' + e.message }));
    });

    eoReq.write(postData);
    eoReq.end();
  });
}

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      eo_key_set: !!EO_API_KEY,
      eo_list_set: !!EO_LIST_ID,
    }));
  } else if (req.method === 'POST' && req.url === '/api/subscribe') {
    handleSubscribe(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, () => {
  console.log(`Shiloh Watch running on port ${PORT}`);
});
