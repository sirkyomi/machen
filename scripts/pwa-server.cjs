const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', 'src');
const types = {'.css':'text/css', '.html':'text/html', '.js':'text/javascript', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json'};
http.createServer((request, response) => {
  const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const candidate = path.resolve(root, requestPath === '/' ? 'index.html' : `.${requestPath}`);
  if (!candidate.startsWith(root + path.sep) && candidate !== path.join(root, 'index.html')) { response.writeHead(403); return response.end(); }
  fs.readFile(candidate, (error, data) => {
    if (error) { response.writeHead(404); return response.end('Not found'); }
    response.writeHead(200, {'Content-Type': types[path.extname(candidate)] || 'application/octet-stream', 'Cache-Control': 'no-cache'});
    response.end(data);
  });
}).listen(4173, '0.0.0.0', () => console.log('Machen PWA: http://localhost:4173'));
