#!/usr/bin/env python3
"""Local static server for tools + proxy /tilecalc/ → live API."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
API = 'https://api.earentir.dev'
PORT = 8766


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
        if path.startswith('/tilecalc/') or path.startswith('/dmt/v1/'):
            self.proxy_api()
            return
        file_path = Path(ROOT, path.lstrip('/'))
        if path.startswith('/tools/') and path not in ('/tools/', '/tools') and not file_path.is_file():
            self.path = '/tools/index.html'
        return super().do_GET()

    def proxy_api(self):
        url = API + self.path
        try:
            req = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'tools-local-proxy'})
            with urlopen(req, timeout=30) as resp:
                body = resp.read()
                self.send_response(resp.status)
                self.send_header('Content-Type', resp.headers.get('Content-Type', 'application/json'))
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except HTTPError as e:
            body = e.read()
            self.send_response(e.code)
            self.send_header('Content-Type', e.headers.get('Content-Type', 'text/plain'))
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            msg = str(e).encode()
            self.send_response(502)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)


if __name__ == '__main__':
    print(f'listening on http://127.0.0.1:{PORT}/tools/ (tilecalc → {API})', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
