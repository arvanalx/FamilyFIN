#!/usr/bin/env python3
"""
Family FiN — Local server with SQLite persistence (v0.925 Beta)
Serves static files + provides /api/data for read/write via SQLite.
No external dependencies (stdlib only).

Migration: if data.json is found on startup it is automatically imported
into the SQLite database and then deleted so it is never read again.
"""

import json
import os
import sqlite3
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

PORT      = 8765
BASE_DIR  = Path(__file__).parent.resolve()
DB_FILE   = BASE_DIR / 'familyfin.db'
DATA_FILE = BASE_DIR / 'data.json'   # legacy — used only for one-time migration


# ── Pre-flight check ──────────────────────────────────────────────────────────

def check_db_path():
    """
    Verify that BASE_DIR is writable before trying to create the database.
    Prints a helpful message and exits if it is not.
    """
    if not BASE_DIR.exists():
        print(f'\n  ERROR: Directory not found: {BASE_DIR}')
        print('  Make sure the app folder exists and try again.\n')
        raise SystemExit(1)
    if not os.access(BASE_DIR, os.W_OK):
        print(f'\n  ERROR: No write permission for directory: {BASE_DIR}')
        print('  Fix with:  chmod u+w "' + str(BASE_DIR) + '"')
        print('  Or run the server as a user who owns that directory.\n')
        raise SystemExit(1)
    # Quick test: try creating a temp file to catch filesystem-level issues
    test_file = BASE_DIR / '.write_test'
    try:
        test_file.write_text('ok')
        test_file.unlink()
    except OSError as exc:
        print(f'\n  ERROR: Cannot write to {BASE_DIR}')
        print(f'  Details: {exc}')
        print('  The filesystem may be read-only or have restrictions (e.g. NAS mount).\n')
        raise SystemExit(1)


# ── SQLite helpers ────────────────────────────────────────────────────────────

def _connect() -> sqlite3.Connection:
    """
    Open SQLite connection.
    On filesystems that don't support POSIX file locking (e.g. mergerfs, NFS,
    some NAS/ZimaOS mounts), the default connect() raises OperationalError.
    In that case we retry with URI mode + nolock=1, which is safe for a
    single-user local application.
    """
    try:
        conn = sqlite3.connect(str(DB_FILE))
    except sqlite3.OperationalError:
        try:
            uri  = f'file:{DB_FILE}?nolock=1'
            conn = sqlite3.connect(uri, uri=True)
            # Use WAL journal so reads don't block writes on nolock filesystems
            conn.execute('PRAGMA journal_mode=MEMORY')
        except sqlite3.OperationalError as exc:
            print(f'\n  ERROR: Cannot open SQLite database at {DB_FILE}')
            print(f'  Details: {exc}')
            print(f'  Filesystem may not support file locking (NFS/mergerfs/SMB).')
            print(f'  Workaround: move the app folder to a local ext4/NTFS filesystem.\n')
            raise
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create the state table if it doesn't exist yet."""
    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS state (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)


def db_load() -> dict:
    """Read the full application state from SQLite and return as a dict."""
    with _connect() as conn:
        rows = conn.execute("SELECT key, value FROM state").fetchall()
    result = {}
    for row in rows:
        result[row['key']] = json.loads(row['value'])
    return result


def db_save(data: dict):
    """
    Persist the full application state to SQLite atomically.
    All existing rows are replaced in a single transaction.
    """
    pairs = [(k, json.dumps(v, ensure_ascii=False)) for k, v in data.items()]
    with _connect() as conn:
        conn.execute("DELETE FROM state")
        if pairs:
            conn.executemany("INSERT INTO state (key, value) VALUES (?, ?)", pairs)


# ── One-time JSON → SQLite migration ─────────────────────────────────────────

def migrate_from_json():
    """
    If data.json exists, import its contents into SQLite and delete the file.
    This runs once — after migration data.json no longer exists so this
    function becomes a no-op on every subsequent startup.
    """
    if not DATA_FILE.exists():
        return
    print(f'  [Migration] Found {DATA_FILE.name} — importing into {DB_FILE.name} …')
    try:
        raw  = DATA_FILE.read_text(encoding='utf-8')
        data = json.loads(raw)
        db_save(data)
        DATA_FILE.unlink()
        print(f'  [Migration] Done. {DATA_FILE.name} has been removed.')
    except Exception as exc:
        print(f'  [Migration] ERROR: {exc}')
        print(f'  [Migration] Keeping {DATA_FILE.name} — please check manually.')


# ── HTTP handler ──────────────────────────────────────────────────────────────

class FamilyFinHandler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    # CORS ────────────────────────────────────────────────────────────────────
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    # GET ─────────────────────────────────────────────────────────────────────
    def do_GET(self):
        if self.path == '/api/data':
            self._get_data()
        else:
            super().do_GET()

    def _get_data(self):
        try:
            state   = db_load()
            payload = json.dumps(state, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type',   'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(payload)))
            self._cors()
            self.end_headers()
            self.wfile.write(payload)
        except Exception as exc:
            self._error(500, str(exc))

    # POST ────────────────────────────────────────────────────────────────────
    def do_POST(self):
        if self.path == '/api/data':
            self._post_data()
        else:
            self._error(404, 'Not found')

    def _post_data(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = self.rfile.read(length)
            data   = json.loads(body)          # raises if invalid JSON
            db_save(data)
            resp = b'{"ok":true}'
            self.send_response(200)
            self.send_header('Content-Type',   'application/json')
            self.send_header('Content-Length', str(len(resp)))
            self._cors()
            self.end_headers()
            self.wfile.write(resp)
        except json.JSONDecodeError:
            self._error(400, 'Invalid JSON')
        except Exception as exc:
            self._error(500, str(exc))

    # Helpers ─────────────────────────────────────────────────────────────────
    def _error(self, code: int, msg: str):
        body = json.dumps({'error': msg}).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def log_message(self, fmt, *args):
        # Show only API calls; suppress noisy static-file logs
        if args and '/api/' in str(args[0]):
            super().log_message(fmt, *args)


class ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    check_db_path()
    init_db()
    migrate_from_json()

    server = ReusableHTTPServer(('0.0.0.0', PORT), FamilyFinHandler)
    print(f'  Family FiN  →  http://localhost:{PORT}')
    print(f'  Database    →  {DB_FILE}')
    print('  Press Ctrl+C to stop.\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
