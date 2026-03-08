#!/usr/bin/env python3
"""
Family FiN — Local server with JSON file persistence
Serves static files + provides /api/data for read/write of data.json
No external dependencies (stdlib only).
"""

import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

PORT = 8765
# Always resolve paths relative to this script's directory
BASE_DIR = Path(__file__).parent.resolve()
DATA_FILE = BASE_DIR / 'data.json'


class FamilyFinHandler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        # Serve files from the script's directory
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    # ── CORS headers ─────────────────────────────────────────
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    # ── GET ───────────────────────────────────────────────────
    def do_GET(self):
        if self.path == '/api/data':
            self._get_data()
        else:
            super().do_GET()

    def _get_data(self):
        try:
            if DATA_FILE.exists():
                payload = DATA_FILE.read_text(encoding='utf-8')
            else:
                payload = '{}'
            body = payload.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            self._error(500, str(e))

    # ── POST ──────────────────────────────────────────────────
    def do_POST(self):
        if self.path == '/api/data':
            self._post_data()
        else:
            self._error(404, 'Not found')

    def _post_data(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            # Validate JSON before writing
            json.loads(body)
            DATA_FILE.write_bytes(body)
            resp = b'{"ok":true}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(resp)))
            self._cors()
            self.end_headers()
            self.wfile.write(resp)
        except json.JSONDecodeError:
            self._error(400, 'Invalid JSON')
        except Exception as e:
            self._error(500, str(e))

    # ── helpers ───────────────────────────────────────────────
    def _error(self, code, msg):
        body = json.dumps({'error': msg}).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # Suppress noisy static-file logs; keep API calls visible
        if args and '/api/' in str(args[0]):
            super().log_message(fmt, *args)


class ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True


if __name__ == '__main__':
# Change 'localhost' to '0.0.0.0' to listen on all network interfaces
    server = ReusableHTTPServer(('0.0.0.0', PORT), FamilyFinHandler)
    print(f'  Family FiN  →  http://192.168.68.10:{PORT}')
    print(f'  Data file   →  {DATA_FILE}')
    print('  Press Ctrl+C to stop.\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
