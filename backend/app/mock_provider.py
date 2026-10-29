"""Local provider fixture. Only fake keys; deterministic responses, no outbound calls.

Run: .venv/bin/python -m app.mock_provider
"""
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass  # Never log credentials, URLs or provider response bodies.

    def do_POST(self):
        if self.path != "/openai/v1/responses" or self.headers.get("Authorization") != "Bearer fake-openai-test":
            self.send_response(401); self.end_headers(); return
        length = int(self.headers.get("Content-Length", 0))
        if not 0 < length <= 1_000_000:
            self.send_response(413); self.end_headers(); return
        try:
            request = json.loads(self.rfile.read(length))
            prompt = json.loads(request["input"][0]["content"])
            question = prompt["currentQuestion"]
            time.sleep(min(2, max(0, float(os.environ.get("PERSONA_MOCK_DELAY", "0")))))
            values = request["text"]["format"]["schema"]["properties"]["answer"].get("enum")
            answer = values[len(values) // 2] if values else None
            result = {"answer": answer, "text": "[모의 OpenAI 응답] 지역의 접근성과 생활 여건을 고려했습니다." if values is None else "",
                "otherText": "[모의 OpenAI 응답] 기타 의견" if question["type"] == "choice" and question["otherEnabled"] and answer == len(question["options"]) else ""}
            if prompt.get("kind") == "interview":
                prior = prompt["previousResponses"]
                said = next((p["displayAnswer"] for p in prior if p["questionId"] == prompt["referenceQuestionId"]), prior[0]["displayAnswer"])
                result["text"] = f'[모의 OpenAI 인터뷰] {prompt["persona"].get("age", "")}의 저장된 응답은 {said}입니다. 이전 대화 {len(prompt["interviewHistory"])}회를 참고했습니다.'
            body = {"status": "completed", "model": request["model"], "output": [{"type": "message", "content": [
                {"type": "output_text", "text": json.dumps(result, ensure_ascii=False)}]}],
                "usage": {"input_tokens": 100, "output_tokens": 25}}
        except (KeyError, ValueError, TypeError):
            self.send_response(400); self.end_headers(); return
        raw = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

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
    print("Fake-key model server: http://127.0.0.1:8001 (discovery and deterministic Responses fixture)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8001), Handler).serve_forever()
