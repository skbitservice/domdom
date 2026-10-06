const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname);

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const requestedPath = path.join(root, url === '/' ? 'profile.html' : url);
  const resolvedPath = path.resolve(requestedPath);

  // Prevent path traversal: resolved path must be within root
  if (!resolvedPath.startsWith(root + path.sep) && resolvedPath !== root) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(resolvedPath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(resolvedPath)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(8731, () => console.log('serving on 8731'));
