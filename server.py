#!/usr/bin/env python3
"""
SongSiphera — Pure Python 3 Standard Library HTTP Server with Range Support
File: server.py

Runs locally on Android Termux or Desktop with Python 3 (zero dependencies).
Handles byte-range streaming (HTTP 206) for smooth audio seeking.

Usage: python3 server.py [port]
"""

import os
import sys
import re
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080

class RangeHTTPRequestHandler(SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler with HTTP 206 Partial Content Range support."""

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        super().end_headers()

    def send_head(self):
        if 'Range' not in self.headers:
            return super().send_head()

        path = self.translate_path(self.path)
        if not os.path.exists(path) or os.path.isdir(path):
            return super().send_head()

        try:
            total_size = os.path.getsize(path)
            range_header = self.headers['Range'].strip()
            match = re.match(r'^bytes=(\d+)-(\d*)$', range_header)
            if not match:
                return super().send_head()

            start = int(match.group(1))
            end_val = match.group(2)
            end = int(end_val) if end_val else total_size - 1

            if start >= total_size or end >= total_size or start > end:
                self.send_error(416, "Requested Range Not Satisfiable")
                return None

            ctype = self.guess_type(path)
            self.send_response(206)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Range", f"bytes {start}-{end}/{total_size}")
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Cache-Control", "no-cache")
            SimpleHTTPRequestHandler.end_headers(self)

            f = open(path, 'rb')
            f.seek(start)
            return f
        except Exception:
            return super().send_head()

def run():
    server_address = ('0.0.0.0', PORT)
    httpd = HTTPServer(server_address, RangeHTTPRequestHandler)
    print("\n" + "=" * 54)
    print("🎵 SongSiphera Audio Server (Python Fallback)")
    print(f"- Local URL:   http://localhost:{PORT}")
    print(f"- Network URL: http://0.0.0.0:{PORT}")
    print("- Mode:        Standard Library HTTP Range Streaming (206)")
    print("=" * 54 + "\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")

if __name__ == '__main__':
    run()
