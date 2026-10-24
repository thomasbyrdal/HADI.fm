"""Shared fixtures for DI.FM Radio unit tests."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import pytest

from custom_components.difm_radio.const import API_BASE_URL

NETWORKS_PAYLOAD = [
    {
        "id": 1,
        "name": "DI.FM",
        "key": "di",
        "url": "https://www.di.fm",
        "active": True,
        "listen_url": "http://listen.di.fm",
        "service_key": "di-premium",
        "active_channel_count": 101,
    },
    {
        "id": 12,
        "name": "JAZZRADIO.com",
        "key": "jazzradio",
        "url": "https://www.jazzradio.com",
        "active": True,
        "listen_url": "http://listen.jazzradio.com",
        "service_key": "jazzradio-premium",
        "active_channel_count": 45,
    },
]

DI_CHANNELS = [
    {
        "id": 1,
        "key": "trance",
        "name": "Trance",
        "network_id": 1,
        "description_short": "Emotive dance music.",
        "description_long": "Trance is emotive dance music.",
        "images": {
            "square": (
                "//cdn-images.audioaddict.com/4/0/e/f/2/9/"
                "40ef29dd8b6a53f19608325284534e0d.png{?size,height,width,quality,pad}"
            ),
            "compact": "//cdn-images.audioaddict.com/compact.png{?size}",
        },
    },
    {
        "id": 12,
        "key": "ambient",
        "name": "Ambient",
        "network_id": 1,
        "description_short": "Ambient music.",
        "description_long": None,
        "images": {"default": "https://cdn-images.audioaddict.com/ambient.png"},
    },
    {
        "id": 999,
        "key": "chiptunes",
        "name": "XChiptunes",
        "network_id": 1,
        "description_short": "Hidden.",
        "images": {},
    },
]

JAZZ_CHANNELS = [
    {
        "id": 73,
        "key": "smoothjazz",
        "name": "Smooth Jazz",
        "network_id": 12,
        "description_short": "Smooth jazz.",
        "images": {
            "square": "https://cdn-images.audioaddict.com/smooth.png",
        },
    }
]

LISTEN_URLS = [
    "http://prem2.di.fm:80/trance_hi",
    "http://prem1.di.fm:80/trance_hi",
    "http://prem4.di.fm:80/trance_hi",
]


class MockResponse:
    """Minimal aiohttp-style response."""

    def __init__(self, status: int, payload: Any = None, text: str = "") -> None:
        self.status = status
        self._payload = payload
        self._text = text

    async def json(self, content_type: str | None = None) -> Any:
        if self._payload is None:
            raise ValueError("not json")
        return self._payload

    async def text(self) -> str:
        if self._text:
            return self._text
        if self._payload is None:
            return ""
        return json.dumps(self._payload)

    async def __aenter__(self) -> MockResponse:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None


class MockSession:
    """Route HTTP requests to scripted responses."""

    def __init__(self) -> None:
        self.routes: dict[tuple[str, str], Any] = {}
        self.calls: list[tuple[str, str, dict[str, str] | None]] = []

    def add(
        self, method: str, path: str, status: int, payload: Any = None, text: str = ""
    ) -> None:
        self.routes[(method.upper(), path)] = (status, payload, text)

    def request(self, method: str, url: str, **kwargs: Any) -> MockResponse:
        params: Mapping[str, str] | None = kwargs.get("params")
        path = _path_with_params(url, params)
        self.calls.append((method.upper(), path, dict(params) if params else None))
        key = (method.upper(), path)
        # Prefer an exact match, then a path without query.
        route = self.routes.get(key)
        if route is None:
            stripped = urlsplit(url).path.removeprefix("/v1") or "/"
            route = self.routes.get((method.upper(), stripped))
        if route is None:
            # Match by API path without host.
            api_path = url.removeprefix(API_BASE_URL)
            path_only = urlsplit(api_path).path
            route = self.routes.get((method.upper(), path_only))
        if route is None:
            return MockResponse(404, text="not found")
        status, payload, text = route
        return MockResponse(status, payload, text)


def _path_with_params(url: str, params: Mapping[str, str] | None) -> str:
    path = url.removeprefix(API_BASE_URL)
    if not params:
        return path
    parts = urlsplit(path)
    query = parse_qsl(parts.query, keep_blank_values=True)
    query.extend(params.items())
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


@pytest.fixture
def session() -> MockSession:
    """HTTP session with the verified public catalogue routes."""

    mock = MockSession()
    mock.add("GET", "/networks", 200, NETWORKS_PAYLOAD)
    mock.add("GET", "/di/channels", 200, DI_CHANNELS)
    mock.add("GET", "/jazzradio/channels", 200, JAZZ_CHANNELS)
    mock.add("GET", "/di/listen/premium_high/trance", 200, LISTEN_URLS)
    return mock
