# Run with:  python3 -m unittest discover tests
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import server  # noqa: E402


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = Path(self.tmp.name)
        server.DB_FILE = base / 'test.db'
        server.BACKUP_DIR = base / 'backups'
        server.init_db()

    def tearDown(self):
        self.tmp.cleanup()

    def test_host_allowed(self):
        for host in ['localhost:8765', '127.0.0.1:8765', '192.168.68.10:8765', '[::1]:8765',
                     'zimaos:8765', 'nas.local', 'box.home.arpa']:
            self.assertTrue(server.host_allowed(host), host)
        for host in ['', 'evil.com', 'evil.com:8765', '192.168.68.10.evil.com']:
            self.assertFalse(server.host_allowed(host), host)

    def test_static_whitelist_never_exposes_data(self):
        served = set(server.STATIC_FILES.values())
        for secret in ['familyfin.db', 'server.py', '.git/config', 'backups']:
            self.assertNotIn(secret, served)
        for path in server.STATIC_FILES.values():
            self.assertTrue((Path(server.__file__).parent / path).exists(), path)

    def test_font_files_are_woff2_and_referenced(self):
        fonts = sorted(server.FONTS_DIR.glob('*'))
        self.assertTrue(fonts)
        css = (Path(server.__file__).parent / 'style.css').read_text(encoding='utf-8')
        for f in fonts:
            self.assertEqual(f.suffix, '.woff2', f.name)
            self.assertEqual(f.read_bytes()[:4], b'wOF2', f.name)
            self.assertIn(f"url('fonts/{f.name}')", css, f.name)

    def test_revision_conflict_rejects_stale_save(self):
        ok, rev, _ = server.db_save({'accounts': [1]}, 0)
        self.assertTrue(ok)
        self.assertEqual(rev, 1)
        ok, rev, current = server.db_save({'accounts': []}, 0)
        self.assertFalse(ok)
        self.assertEqual(rev, 1)
        self.assertEqual(current, {'accounts': [1]})
        self.assertEqual(server.db_load(), ({'accounts': [1]}, 1))

    def test_backups_daily_and_before_import(self):
        server.db_save({'accounts': ['v1']}, 0)
        server.db_save({'accounts': ['v2']}, 1)
        server.db_save({'accounts': ['v3']}, 2, 'import')
        daily = list(server.BACKUP_DIR.glob('auto-*.json'))
        pre = list(server.BACKUP_DIR.glob('before-import-*.json'))
        self.assertEqual(len(daily), 1)
        self.assertEqual(json.loads(daily[0].read_text()), {'accounts': ['v1']})
        self.assertEqual(len(pre), 1)
        self.assertEqual(json.loads(pre[0].read_text()), {'accounts': ['v2']})


if __name__ == '__main__':
    unittest.main()
