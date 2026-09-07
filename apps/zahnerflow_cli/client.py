"""Small standard-library JSON transport shared by CLI commands."""

import json
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


class CommandError(Exception):
    def __init__(self, code: str, message: str, *, status: int = 0, details=None, exit_code: int = 1):
        super().__init__(message)
        self.payload = {"code": code, "message": message, "status": status}
        if details is not None:
            self.payload["details"] = details
        self.exit_code = exit_code


class RuntimeClient:
    def __init__(self, base_url: str, timeout: float = 10):
        parts = urlsplit(base_url)
        if parts.scheme not in {"http", "https"} or not parts.hostname or parts.query or parts.fragment or parts.username or parts.password or parts.path not in {"", "/"}:
            raise CommandError("INVALID_URL", "Runtime URL must be an http(s) origin, for example http://127.0.0.1:3001", exit_code=2)
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def request(self, method: str, path: str, body=None):
        if not path.startswith(("/api/", "/api?")) and path not in {"/api", "/health", "/openapi.json"}:
            raise CommandError("INVALID_PATH", "Request path must target /api, /health or /openapi.json", exit_code=2)
        data = None if body is None else json.dumps(body, ensure_ascii=False, allow_nan=False).encode("utf-8")
        request = Request(self.base_url + path, data=data, method=method,
            headers={"Content-Type": "application/json", "Accept": "application/json"})
        try:
            with urlopen(request, timeout=self.timeout) as response:
                text = response.read().decode("utf-8")
                result = json.loads(text) if text.strip() else None
        except HTTPError as error:
            try:
                detail = json.loads(error.read().decode("utf-8")).get("detail")
            except (ValueError, AttributeError):
                detail = None
            message = detail.get("message", str(error.reason)) if isinstance(detail, dict) else detail if isinstance(detail, str) else str(error.reason)
            code = detail.get("code", f"HTTP_{error.code}") if isinstance(detail, dict) else f"HTTP_{error.code}"
            raise CommandError(code, message, status=error.code, details=detail) from error
        except (URLError, TimeoutError, OSError) as error:
            raise CommandError("CONNECTION_ERROR", f"Cannot reach {self.base_url}: {error}", exit_code=4) from error
        except (ValueError, UnicodeError) as error:
            raise CommandError("INVALID_RESPONSE", "Runtime returned invalid JSON", exit_code=4) from error
        if isinstance(result, dict) and result.get("success") is False:
            raise CommandError("COMMAND_REJECTED", str(result.get("message") or result.get("error") or "Command rejected"), details=result)
        return result
