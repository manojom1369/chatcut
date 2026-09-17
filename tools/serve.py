"""
serve.py — tiny preview server for the ChatCut deliverables.

Serves the repository read-only (dotfiles and .git are blocked), maps "/" to the preview UI,
and binds 0.0.0.0 so the sandbox live-preview proxy can reach it.

    python3 tools/serve.py --port 8000
"""

from __future__ import annotations

import argparse
import functools
import http.server
import os
import socketserver


class SafeHandler(http.server.SimpleHTTPRequestHandler):
    """SimpleHTTPRequestHandler with dotfile blocking and correct MIME types."""

    def translate_path(self, path: str) -> str:
        p = super().translate_path(path)
        rel = os.path.relpath(p, self.directory)
        parts = rel.split(os.sep)
        if any(part.startswith(".") for part in parts):
            return os.path.join(self.directory, "__forbidden__")
        return p

    def send_head(self):
        if not os.path.exists(self.translate_path(self.path)) and not os.path.isdir(
            self.translate_path(self.path)
        ):
            if self.path in ("/", "/index.html"):
                self.path = "/site/index.html"
            elif not self.path.startswith("/site") and os.path.exists(
                self.translate_path("/site" + self.path)
            ):
                self.path = "/site" + self.path
        return super().send_head()

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self.path = "/site/index.html"
        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter logs
        if "404" in (fmt % args):
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--root", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    args = ap.parse_args()

    handler = functools.partial(SafeHandler, directory=args.root)
    with Server(("0.0.0.0", args.port), handler) as httpd:
        print(f"serving {args.root} on http://0.0.0.0:{args.port}/  (UI at /)", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
