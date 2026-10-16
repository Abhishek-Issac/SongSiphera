/**
 * SongSiphera — Pure Node.js Local HTTP Server (Zero External Dependencies)
 * File: server.js
 *
 * Runs locally on Android Termux or Desktop with Node.js 18+.
 * Supports:
 * - HTTP 206 Partial Content (HTTP Range requests for instant scrub/seek)
 * - Cookie header parsing for server-rendered <html data-profile> attributes
 * - Content-Type mapping and safe directory traversal guards
 *
 * Usage: node server.js [port]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || process.argv[2] || '8080', 10);
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ico': 'image/x-icon'
};

function parseCookies(cookieHeader) {
  const list = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

const server = http.createServer((req, res) => {
  // Path Traversal Security Guard
  const safeUrl = decodeURI(req.url.split('?')[0]);
  let filePath = path.normalize(path.join(ROOT_DIR, safeUrl === '/' ? 'index.html' : safeUrl));

  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('403 Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      return fs.stat(filePath, (dirErr, dirStats) => {
        if (dirErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          return res.end('404 Not Found');
        }
        serveFile(req, res, filePath, dirStats);
      });
    }

    serveFile(req, res, filePath, stats);
  });
});

function serveFile(req, res, filePath, stats) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const totalSize = stats.size;
  const range = req.headers.range;

  // Handle HTML with initial Cookie injection for zero FOUC (Part 7.1)
  if (ext === '.html') {
    const cookies = parseCookies(req.headers.cookie);
    const profile = cookies['ap_profile'] || 'default';
    const theme = cookies['ap_theme'] || 'auto';
    const motion = cookies['ap_motion'] || 'full';

    fs.readFile(filePath, 'utf8', (readErr, htmlContent) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        return res.end('500 Internal Server Error');
      }

      // Pre-inject data attributes on root
      let transformed = htmlContent
        .replace('<html lang="en">', `<html lang="en" data-profile="${profile}" data-theme="${theme}" data-motion="${motion}">`)
        .replace('data-mood="default"', `data-mood="${profile}"`);

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(transformed),
        'Cache-Control': 'no-cache'
      });
      res.end(transformed);
    });
    return;
  }

  // HTTP 206 Partial Content for audio streaming & seeking
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

    if (start >= totalSize || end >= totalSize) {
      res.writeHead(416, {
        'Content-Range': `bytes */${totalSize}`
      });
      return res.end();
    }

    const chunksize = end - start + 1;
    const fileStream = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${totalSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': contentType
    });
    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': totalSize,
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': ext === '.js' || ext === '.css' ? 'public, max-age=3600' : 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🎵 SongSiphera Audio Server Running`);
  console.log(`- Local URL:   http://localhost:${PORT}`);
  console.log(`- Network URL: http://0.0.0.0:${PORT}`);
  console.log(`- Storage:     Zero-dependency Node.js HTTP 206 Server`);
  console.log(`======================================================\n`);
});
