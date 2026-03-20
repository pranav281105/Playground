import json
import logging
import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("fintech.api")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable[[Request], Response]) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)

        payload = {
            "event": "http_request",
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
            "client": request.client.host if request.client else None,
        }
        logger.info(json.dumps(payload))
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, limit_per_minute: int):
        super().__init__(app)
        self.limit_per_minute = limit_per_minute
        self.request_windows: dict[str, deque[float]] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next: Callable[[Request], Response]) -> Response:
        client_key = request.client.host if request.client else "unknown"
        now = time.time()
        window = self.request_windows[client_key]

        while window and now - window[0] > 60:
            window.popleft()

        if len(window) >= self.limit_per_minute:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please retry in a minute."},
            )

        window.append(now)
        return await call_next(request)
