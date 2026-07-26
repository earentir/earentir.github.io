#!/usr/bin/env python3
"""Local static server for tools + proxy API paths → earapi."""
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
API = os.environ.get('EARAPI_URL', 'https://api.earentir.dev').rstrip('/')
PORT = 8766

API_PREFIXES = (
    '/tilecalc/',
    '/dmt/v1/',
    '/imdb/v1/',
    '/watchlist/v1/',
    '/compare/v1/',
    '/jellyfin/v1/',
    '/jobs/v1/',
    '/watchlistsync/v1/',
)


def is_api_path(path: str) -> bool:
    return any(path.startswith(prefix) for prefix in API_PREFIXES)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        path = self.path.split('?', 1)[0]
        if path.endswith(('.js', '.css', '.html', '.woff2')):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if is_api_path(path):
            if '/events' in path:
                self.proxy_stream()
            else:
                self.proxy_api('GET')
            return
        file_path = Path(ROOT, path.lstrip('/'))
        if path.startswith('/tools/') and path not in ('/tools/', '/tools') and not file_path.is_file():
            self.path = '/tools/index.html'
        return super().do_GET()

    def do_POST(self):
        path = self.path.split('?', 1)[0]
        if is_api_path(path):
            self.proxy_api('POST')
            return
        self.send_error(404)

    def do_OPTIONS(self):
        path = self.path.split('?', 1)[0]
        if is_api_path(path):
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Accept')
            self.send_header('Access-Control-Max-Age', '86400')
            self.end_headers()
            return
        self.send_error(404)

    def _read_body(self):
        length = int(self.headers.get('Content-Length') or 0)
        return self.rfile.read(length) if length > 0 else None

    def proxy_api(self, method='GET'):
        url = API + self.path
        body = self._read_body() if method == 'POST' else None
        headers = {
            'Accept': self.headers.get('Accept', 'application/json'),
            'User-Agent': 'tools-local-proxy',
        }
        content_type = self.headers.get('Content-Type')
        if content_type:
            headers['Content-Type'] = content_type
        try:
            req = Request(url, data=body, headers=headers, method=method)
            with urlopen(req, timeout=600) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', resp.headers.get('Content-Type', 'application/json'))
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.send_header('Content-Type', e.headers.get('Content-Type', 'text/plain'))
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            msg = str(e).encode()
            self.send_response(502)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)

    def proxy_stream(self):
        url = API + self.path
        try:
            req = Request(url, headers={
                'Accept': 'text/event-stream',
                'User-Agent': 'tools-local-proxy',
            })
            with urlopen(req, timeout=600) as resp:
                self.send_response(resp.status)
                self.send_header('Content-Type', resp.headers.get('Content-Type', 'text/event-stream'))
                self.send_header('Cache-Control', 'no-cache')
                self.send_header('X-Accel-Buffering', 'no')
                self.end_headers()
                while True:
                    chunk = resp.read(1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
        except HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.send_header('Content-Type', e.headers.get('Content-Type', 'text/plain'))
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            msg = str(e).encode()
            self.send_response(502)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)


if __name__ == '__main__':
    print(f'listening on http://127.0.0.1:{PORT}/tools/ (API → {API})', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
