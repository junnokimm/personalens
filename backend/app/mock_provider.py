"""Local model-list fixture. Only fake keys; no text generation or outbound calls.

Run: .venv/bin/python -m app.mock_provider
"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # Never log credentials, URLs or provider response bodies.

    def do_GET(self):
        parts = urlsplit(self.path)
        body, status = {}, 200
        if parts.path == "/openai/v1/models":
            if self.headers.get("Authorization") != "Bearer fake-openai-test":
                status, body = 401, {"error": "mock credentials rejected"}
            else:
                body = {"data": [{"id": "gpt-demo-small"}, {"id": "gpt-demo-large"}, {"id": "text-embedding-demo"}]}
        elif parts.path == "/anthropic/v1/models":
            if self.headers.get("x-api-key") != "fake-anthropic-test" or self.headers.get("anthropic-version") != "2023-06-01":
                status, body = 401, {"error": "mock credentials rejected"}
            elif parse_qs(parts.query).get("after_id") == ["claude-demo-sonnet"]:
                body = {"data": [{"id": "claude-demo-haiku", "display_name": "Claude Demo Haiku"}], "has_more": False}
            else:
                body = {"data": [{"id": "claude-demo-sonnet", "display_name": "Claude Demo Sonnet"}], "has_more": True, "last_id": "claude-demo-sonnet"}
        elif parts.path == "/dgx/v1/models":
            if self.headers.get("Authorization") not in (None, "Bearer fake-dgx-test"):
                status, body = 401, {"error": "mock credentials rejected"}
            else:
                body = {"data": [{"id": "Qwen/demo-8B"}, {"id": "GLM/demo-9B"}]}
        elif parts.path == "/redirect/v1/models":
            self.send_response(302)
            self.send_header("Location", "/dgx/v1/models")
            self.end_headers()
            return
        else:
            status, body = 404, {"error": "model list unavailable"}
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    print("Fake-key model server: http://127.0.0.1:8001 (model discovery only)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8001), Handler).serve_forever()
