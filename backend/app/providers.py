"""Read-only model discovery. No inference endpoint is called in this MVP."""
import http.client
import json
import re
import ssl
from urllib.parse import urlencode, urlsplit

from cryptography.fernet import Fernet, InvalidToken

from .config import settings
from .errors import ApiError

PROVIDERS = {"openai": "https://api.openai.com/v1", "anthropic": "https://api.anthropic.com/v1"}
MODEL_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$")


def cipher():
    try:
        return Fernet(settings.encryption_key.encode())
    except (ValueError, TypeError):
        raise ApiError(503, "KEY_STORE_UNAVAILABLE", "서버 암호화 키 설정을 확인하세요.") from None


def encrypt_key(key):
    return cipher().encrypt(key.encode()).decode() if key else None


def decrypt_key(value):
    try:
        return cipher().decrypt(value.encode()).decode() if value else ""
    except (InvalidToken, UnicodeError):
        raise ApiError(503, "KEY_STORE_UNAVAILABLE", "저장된 키를 읽을 수 없습니다. 서버 암호화 설정을 확인하세요.") from None


def normalize_url(value):
    try:
        parts = urlsplit(value.strip().rstrip("/"))
    except ValueError:
        raise ApiError(422, "INVALID_ENDPOINT", "서버 주소가 올바르지 않습니다.") from None
    if (parts.scheme not in ("https", "http") or not parts.hostname or parts.username or parts.password
            or parts.query or parts.fragment or any(c.isspace() for c in value) or "%" in value or "\\" in value):
        raise ApiError(422, "INVALID_ENDPOINT", "인증 정보·쿼리 없이 모델 서버의 기본 주소를 입력하세요.")
    try:
        port = parts.port
    except ValueError:
        raise ApiError(422, "INVALID_ENDPOINT", "서버 포트가 올바르지 않습니다.") from None
    if any(part in (".", "..") for part in parts.path.split("/")):
        raise ApiError(422, "INVALID_ENDPOINT", "서버 경로가 올바르지 않습니다.")
    host = parts.hostname.lower()
    host = f"[{host}]" if ":" in host else host
    if port and port != (443 if parts.scheme == "https" else 80):
        host += f":{port}"
    return f"{parts.scheme}://{host}{parts.path.rstrip('/')}"


def endpoint(provider, supplied=""):
    if provider in PROVIDERS:
        expected = PROVIDERS[provider]
        if settings.mock_provider_base_url:
            mock = normalize_url(settings.mock_provider_base_url)
            if urlsplit(mock).hostname not in ("localhost", "127.0.0.1", "::1"):
                raise ApiError(503, "INVALID_MOCK_CONFIG", "모의 서버는 로컬 주소만 사용할 수 있습니다.")
            expected = mock + "/" + provider + "/v1"
        if supplied and normalize_url(supplied) != expected:
            raise ApiError(422, "INVALID_ENDPOINT", "공급자 API 주소는 서버에서 관리합니다.")
        return expected
    target = normalize_url(supplied)
    allowed = [normalize_url(url) for url in settings.dgx_allowed_base_urls]
    if target not in allowed:
        raise ApiError(422, "ENDPOINT_NOT_ALLOWED", "관리자가 허용한 DGX 서버 주소를 입력하세요.")
    return target


def fetch_json(base_url, query, headers):
    parts = urlsplit(base_url)
    # No redirects, environment proxies, or user-controlled pagination URLs.
    cls = http.client.HTTPSConnection if parts.scheme == "https" else http.client.HTTPConnection
    kwargs = {"timeout": 5}
    if parts.scheme == "https":
        kwargs["context"] = ssl.create_default_context()
    client = cls(parts.hostname, parts.port, **kwargs)
    try:
        client.request("GET", parts.path.rstrip("/") + "/models" + ("?" + urlencode(query) if query else ""), headers=headers)
        response = client.getresponse()
        if response.status in (401, 403):
            raise ApiError(422, "PROVIDER_AUTH_FAILED", "API 키 또는 모델 목록 조회 권한을 확인하세요.")
        if response.status in (404, 405):
            raise ApiError(422, "MODEL_LIST_UNSUPPORTED", "모델 목록 API를 지원하지 않습니다. DGX 연결은 모델 ID를 직접 등록할 수 있습니다.")
        if response.status == 429:
            raise ApiError(422, "PROVIDER_RATE_LIMIT", "공급자의 요청 한도에 도달했습니다. 잠시 후 다시 확인하세요.")
        if response.status != 200:
            raise ApiError(422, "PROVIDER_UNAVAILABLE", "모델 서버 응답을 확인할 수 없습니다. 주소와 서버 상태를 확인하세요.")
        raw = response.read(2_000_001)
        if len(raw) > 2_000_000:
            raise ValueError("Response too large")
        return json.loads(raw)
    except ApiError:
        raise
    except (OSError, http.client.HTTPException, ValueError, UnicodeError):
        # Provider bodies/exception strings may contain credentials. Never return or log them.
        raise ApiError(422, "PROVIDER_UNAVAILABLE", "모델 서버에 연결하지 못했거나 응답 형식이 올바르지 않습니다.") from None
    finally:
        client.close()


def discover(provider, base_url, key):
    base_url = endpoint(provider, base_url)  # Recheck allowlist on every outbound request.
    if settings.mock_provider_base_url and provider in PROVIDERS and not key.startswith("fake-"):
        raise ApiError(422, "FAKE_KEY_REQUIRED", "모의 서버 모드에서는 fake-로 시작하는 가짜 키만 사용할 수 있습니다.")
    headers = {"Accept": "application/json"}
    if provider == "anthropic":
        headers.update({"x-api-key": key, "anthropic-version": "2023-06-01"})
    elif key:
        headers["Authorization"] = "Bearer " + key
    query, models = ({"limit": 100} if provider == "anthropic" else {}), {}
    for _ in range(2):
        body = fetch_json(base_url, query, headers)
        if not isinstance(body, dict) or not isinstance(body.get("data"), list):
            raise ApiError(422, "INVALID_MODEL_LIST", "모델 목록 형식이 올바르지 않습니다.")
        for item in body["data"]:
            model_id = item.get("id") if isinstance(item, dict) else None
            if not isinstance(model_id, str) or not MODEL_ID.fullmatch(model_id):
                continue
            # Discovery is not an inference capability test. Specialized OpenAI outputs are excluded.
            if provider == "openai" and (not model_id.startswith(("gpt-", "chatgpt-", "o1", "o3", "o4", "ft:"))
                    or any(s in model_id for s in ("image", "audio", "realtime", "transcribe", "tts", "codex"))):
                continue
            models[model_id] = {"id": model_id, "name": str(item.get("display_name") or model_id)[:200], "source": "api"}
            if len(models) > 2000:
                raise ApiError(422, "MODEL_LIST_LIMIT", "모델 목록이 너무 큽니다.")
        if provider != "anthropic" or not body.get("has_more"):
            return list(models.values())
        last = body.get("last_id")
        if not isinstance(last, str) or not MODEL_ID.fullmatch(last) or query.get("after_id") == last:
            break
        query["after_id"] = last
    raise ApiError(422, "MODEL_LIST_LIMIT", "모델 목록 조회 범위를 초과했습니다.")
