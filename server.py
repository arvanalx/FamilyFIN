#!/usr/bin/env python3
"""
Family FiN — Local server with SQLite persistence (v0.946 Beta)
Serves the app's static files + provides /api/data for read/write via SQLite.
No external dependencies (stdlib only).

Migration: if data.json is found on startup it is automatically imported
into the SQLite database and then deleted so it is never read again.
"""

import ipaddress
import json
import os
import sqlite3
import sys
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit

PORT       = 8765
BASE_DIR   = Path(__file__).parent.resolve()
DB_FILE    = BASE_DIR / 'familyfin.db'
DATA_FILE  = BASE_DIR / 'data.json'   # legacy — used only for one-time migration
BACKUP_DIR = BASE_DIR / 'backups'
FONTS_DIR  = BASE_DIR / 'fonts'

KEEP_DAILY_BACKUPS    = 30
KEEP_SNAPSHOT_BACKUPS = 10

# Only these files are ever served — never the database, backups or .git
STATIC_FILES = {
    '/':               'index.html',
    '/index.html':     'index.html',
    '/style.css':      'style.css',
    '/app.js':         'app.js',
    '/i18n.js':        'i18n.js',
    '/calc.js':        'calc.js',
    '/charts.js':      'charts.js',
    '/help.js':        'help.js',
    '/report.js':      'report.js',
    '/sw.js':          'sw.js',
    '/manifest.json':  'manifest.json',
    '/icon-192.png':   'icon-192.png',
    '/icon-512.png':   'icon-512.png',
    '/README.md':      'README.md',
    '/README.en.md':   'README.en.md',
}

# Extra host names allowed in the Host header (comma-separated), e.g. "nas.example.com"
EXTRA_HOSTS = {h.strip().lower() for h in os.environ.get('FAMILYFIN_HOSTS', '').split(',') if h.strip()}
LAN_SUFFIXES = ('.local', '.localhost', '.lan', '.home.arpa', '.internal')


# ── Pre-flight check ──────────────────────────────────────────────────────────

def check_db_path():
    """
    Verify that BASE_DIR exists and is writable before trying to create the database.
    Uses an actual write test instead of os.access() which can give false negatives
    on ACL-based or mergerfs/NAS filesystems.
    """
    if not BASE_DIR.exists():
        print(f'\n  ERROR: Directory not found: {BASE_DIR}')
        print('  Make sure the app folder exists and try again.\n')
        raise SystemExit(1)
    test_file = BASE_DIR / '.write_test'
    try:
        test_file.write_text('ok')
        test_file.unlink()
    except OSError as exc:
        print(f'\n  ERROR: Cannot write to {BASE_DIR}')
        print(f'  Details: {exc}')
        print(f'  Fix with:  chmod u+w "{BASE_DIR}"')
        print('  Or run the server as a user who owns that directory.\n')
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
    with _connect() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS state (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)


def _read_state(conn) -> dict:
    rows = conn.execute("SELECT key, value FROM state").fetchall()
    return {row['key']: json.loads(row['value']) for row in rows}


def _read_rev(conn) -> int:
    row = conn.execute("SELECT value FROM meta WHERE key = 'rev'").fetchone()
    return int(row['value']) if row else 0


def _write_state(conn, data: dict, rev: int):
    pairs = [(k, json.dumps(v, ensure_ascii=False)) for k, v in data.items()]
    conn.execute("DELETE FROM state")
    if pairs:
        conn.executemany("INSERT INTO state (key, value) VALUES (?, ?)", pairs)
    conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('rev', ?)", (str(rev),))


def db_load() -> tuple:
    with _connect() as conn:
        return _read_state(conn), _read_rev(conn)


def db_save(data: dict, base_rev, reason: str = '') -> tuple:
    """
    Save the full state only if the client's base revision matches the stored one.
    Returns (ok, rev, current_state). On conflict nothing is written.
    """
    with _connect() as conn:
        current_rev = _read_rev(conn)
        if base_rev is not None and base_rev != current_rev:
            return False, current_rev, _read_state(conn)
        current = _read_state(conn)
        backup_before_save(current, reason)
        new_rev = current_rev + 1
        _write_state(conn, data, new_rev)
        return True, new_rev, None


# ── Backups ───────────────────────────────────────────────────────────────────

def _write_backup(state: dict, name: str):
    BACKUP_DIR.mkdir(exist_ok=True)
    (BACKUP_DIR / name).write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding='utf-8')


def _prune(prefix: str, keep: int):
    files = sorted(BACKUP_DIR.glob(f'{prefix}*.json'))
    for old in files[:-keep]:
        old.unlink(missing_ok=True)


def backup_before_save(current: dict, reason: str):
    """Keep one snapshot per day plus a snapshot before every import/reset."""
    if not current:
        return
    try:
        day = datetime.now().strftime('%Y-%m-%d')
        if not (BACKUP_DIR / f'auto-{day}.json').exists():
            _write_backup(current, f'auto-{day}.json')
            _prune('auto-', KEEP_DAILY_BACKUPS)
        if reason in ('import', 'reset'):
            ts = datetime.now().strftime('%Y-%m-%d_%H%M%S')
            _write_backup(current, f'before-{reason}-{ts}.json')
            _prune(f'before-{reason}-', KEEP_SNAPSHOT_BACKUPS)
    except OSError as exc:
        print(f'  [Backup] WARNING: {exc}')


# ── One-time JSON → SQLite migration ─────────────────────────────────────────

def migrate_from_json():
    if not DATA_FILE.exists():
        return
    print(f'  [Migration] Found {DATA_FILE.name} — importing into {DB_FILE.name} …')
    try:
        data = json.loads(DATA_FILE.read_text(encoding='utf-8'))
        db_save(data, None)
        DATA_FILE.unlink()
        print(f'  [Migration] Done. {DATA_FILE.name} has been removed.')
    except Exception as exc:
        print(f'  [Migration] ERROR: {exc}')
        print(f'  [Migration] Keeping {DATA_FILE.name} — please check manually.')


# ── Request validation ───────────────────────────────────────────────────────

def host_allowed(host_header: str) -> bool:
    """Blocks DNS-rebinding: only IPs, LAN-style names, or configured hosts."""
    if not host_header:
        return False
    host = urlsplit('//' + host_header).hostname or ''
    host = host.lower()
    if host == 'localhost' or host in EXTRA_HOSTS:
        return True
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        pass
    return '.' not in host or host.endswith(LAN_SUFFIXES)


# ── HTTP handler ──────────────────────────────────────────────────────────────

class FamilyFinHandler(SimpleHTTPRequestHandler):

    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.woff2': 'font/woff2'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BASE_DIR), **kwargs)

    def _api_request_ok(self) -> bool:
        """API calls must come from the app itself (same origin, custom header)."""
        if self.headers.get('X-FamilyFin') != '1':
            return False
        origin = self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host', ''):
            return False
        return True

    def _route(self):
        if not host_allowed(self.headers.get('Host', '')):
            self._error(403, 'Host not allowed')
            return None
        path = urlsplit(self.path).path
        if path == '/api/data':
            if not self._api_request_ok():
                self._error(403, 'Forbidden')
                return None
            return 'api'
        if path in STATIC_FILES:
            self.path = '/' + STATIC_FILES[path]
            return 'static'
        if path.startswith('/fonts/') and path.endswith('.woff2'):
            name = path[len('/fonts/'):]
            if '/' not in name and (FONTS_DIR / name).is_file():
                self.path = '/fonts/' + name
                return 'static'
        self._error(404, 'Not found')
        return None

    # GET / HEAD ───────────────────────────────────────────────────────────────
    def do_GET(self):
        route = self._route()
        if route == 'api':
            self._get_data()
        elif route == 'static':
            super().do_GET()

    def do_HEAD(self):
        if self._route() == 'static':
            super().do_HEAD()

    def _get_data(self):
        try:
            state, rev = db_load()
            self._json(200, {'state': state, 'rev': rev})
        except Exception as exc:
            self._error(500, str(exc))

    # POST ────────────────────────────────────────────────────────────────────
    def do_POST(self):
        if self._route() != 'api':
            return
        if not self.headers.get('Content-Type', '').startswith('application/json'):
            self._error(415, 'Content-Type must be application/json')
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            body   = json.loads(self.rfile.read(length))
            state  = body.get('state') if isinstance(body, dict) else None
            rev    = body.get('rev') if isinstance(body, dict) else None
            if not isinstance(state, dict) or not isinstance(rev, int):
                self._error(400, 'Expected {"rev": int, "state": {...}}')
                return
            reason = self.headers.get('X-FamilyFin-Reason', '')
            ok, new_rev, current = db_save(state, rev, reason)
            if ok:
                self._json(200, {'ok': True, 'rev': new_rev})
            else:
                self._json(409, {'error': 'conflict', 'rev': new_rev, 'state': current})
        except json.JSONDecodeError:
            self._error(400, 'Invalid JSON')
        except Exception as exc:
            self._error(500, str(exc))

    # Helpers ─────────────────────────────────────────────────────────────────
    def _json(self, code: int, obj: dict):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type',   'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _error(self, code: int, msg: str):
        self._json(code, {'error': msg})

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def log_message(self, fmt, *args):
        # Show only API calls and rejected requests; suppress noisy static-file logs
        if len(args) > 1 and ('/api/' in str(args[0]) or str(args[1])[:1] == '4'):
            super().log_message(fmt, *args)


class ReusableHTTPServer(HTTPServer):
    allow_reuse_address = True


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    sys.stdout.reconfigure(line_buffering=True)  # show startup lines in journalctl under systemd
    check_db_path()
    init_db()
    migrate_from_json()

    server = ReusableHTTPServer(('0.0.0.0', PORT), FamilyFinHandler)
    print(f'  Family FiN  →  http://localhost:{PORT}')
    print(f'  Database    →  {DB_FILE}')
    print(f'  Backups     →  {BACKUP_DIR}')
    print('  Press Ctrl+C to stop.\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
