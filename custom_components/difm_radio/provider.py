"""Verified AudioAddict HTTP client.

Only the endpoints documented in docs/api-research.md are used. A successful
catalogue fetch does not prove that a listen key is valid.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import aiohttp

from .const import (
    API_BASE_URL,
    API_MIN_INTERVAL_SECONDS,
    API_TIMEOUT_SECONDS,
    STREAM_QUALITIES,
    VALIDATION_CHANNEL_KEY,
    VALIDATION_NETWORK,
    VALIDATION_QUALITY,
)
from .exceptions import CannotConnectError, InvalidListenKeyError, InvalidResponseError
from .helpers import attach_icecast_key, redact_text
from .models import Catalogue, Network, Station

_LOGGER = logging.getLogger(__name__)

_INVALID_KEY_TEXT = "invalid listen key"


class AudioAddictClient:
    """Async client for the verified public catalogue and listen-key checks."""

    def __init__(
        self,
        session: aiohttp.ClientSession,
        listen_key: str | None = None,
        *,
        request_interval: float = API_MIN_INTERVAL_SECONDS,
    ) -> None:
        self._session = session
        self._listen_key = listen_key.strip() if listen_key else None
        self._request_interval = request_interval
        self._lock = asyncio.Lock()
        self._last_request_started = 0.0

    @property
    def listen_key(self) -> str | None:
        """Return the configured listen key, if any."""

        return self._listen_key

    def set_listen_key(self, listen_key: str | None) -> None:
        """Update the listen key used for authenticated listen requests."""

        self._listen_key = listen_key.strip() if listen_key else None

    async def async_list_networks(self) -> list[Network]:
        """Return active networks from ``GET /v1/networks``."""

        payload = await self._request_json("GET", "/networks")
        if not isinstance(payload, list):
            raise InvalidResponseError("networks response is not a list")
        networks = [
            network
            for item in payload
            if isinstance(item, dict) and (network := Network.from_api(item)) is not None
        ]
        if not networks:
            raise InvalidResponseError("networks response contained no usable networks")
        return [network for network in networks if network.active] or networks

    async def async_list_channels(self, network_key: str) -> list[Station]:
        """Return channels from ``GET /v1/{network}/channels``."""

        if not network_key or "/" in network_key or ".." in network_key:
            raise InvalidResponseError("invalid network key")
        payload = await self._request_json("GET", f"/{network_key}/channels")
        if not isinstance(payload, list):
            raise InvalidResponseError("channels response is not a list")
        stations = [
            station
            for item in payload
            if isinstance(item, dict)
            and (station := Station.from_api(item, network_key)) is not None
        ]
        return stations

    async def async_get_catalogue(self) -> Catalogue:
        """Fetch every active network and its channel list."""

        networks = await self.async_list_networks()
        stations: dict[str, Station] = {}
        errors: list[str] = []
        for network in networks:
            try:
                for station in await self.async_list_channels(network.key):
                    stations[station.id] = station
            except AudioAddictClientError as err:
                errors.append(network.key)
                _LOGGER.warning("Failed to load stations for %s: %s", network.key, err)
        if not stations:
            if errors:
                raise CannotConnectError("failed to load stations for all networks")
            raise InvalidResponseError("station catalogue is empty")
        return Catalogue(networks=networks, stations=stations)

    async def async_validate_listen_key(self, listen_key: str) -> list[str]:
        """Validate a listen key against the verified listen endpoint.

        ``GET /v1/di/listen/premium_high/trance?listen_key=`` is the only
        documented validation path. The catalogue endpoints must not be used
        for this: they succeed without credentials.

        A missing ``listen_key`` query parameter returns public mirror URLs and
        is treated as a client error, not success.
        """

        key = (listen_key or "").strip()
        if not key:
            raise InvalidListenKeyError("listen key is empty")
        return await self._async_listen_urls(
            VALIDATION_NETWORK,
            VALIDATION_CHANNEL_KEY,
            VALIDATION_QUALITY,
            listen_key=key,
        )

    async def async_resolve_stream_urls(
        self,
        network: str,
        channel_key: str,
        quality: str,
        *,
        listen_key: str | None = None,
    ) -> list[str]:
        """Resolve Icecast mirror URLs for a station.

        Verified with a real key on 2026-10-24: ``/listen`` returns Icecast
        mounts that already use the bare ``?{key}`` query. Icecast accepts
        that form and rejects ``?listen_key=``. ``attach_icecast_key`` is
        idempotent when the key is already present.
        """

        key = (listen_key if listen_key is not None else self._listen_key) or ""
        key = key.strip()
        if not key:
            raise InvalidListenKeyError("listen key is empty")
        if quality not in STREAM_QUALITIES:
            raise InvalidResponseError(f"unsupported stream quality: {quality}")
        urls = await self._async_listen_urls(network, channel_key, quality, listen_key=key)
        return [attach_icecast_key(url, key) for url in urls]

    async def _async_listen_urls(
        self,
        network: str,
        channel_key: str,
        quality: str,
        *,
        listen_key: str,
    ) -> list[str]:
        if not network or not channel_key or "/" in network or "/" in channel_key:
            raise InvalidResponseError("invalid listen path")
        payload = await self._request_json(
            "GET",
            f"/{network}/listen/{quality}/{channel_key}",
            params={"listen_key": listen_key},
            require_listen_key=True,
        )
        if not isinstance(payload, list) or not payload:
            raise InvalidResponseError("listen response is not a URL list")
        urls = [url for url in payload if isinstance(url, str) and url.startswith("http")]
        if not urls:
            raise InvalidResponseError("listen response contained no HTTP URLs")
        return urls

    async def _request_json(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        require_listen_key: bool = False,
    ) -> Any:
        if require_listen_key and (not params or not params.get("listen_key")):
            raise InvalidListenKeyError("listen_key query parameter is required")

        url = f"{API_BASE_URL}{path}"
        timeout = aiohttp.ClientTimeout(total=API_TIMEOUT_SECONDS)
        safe_params = {
            key: value for key, value in (params or {}).items() if key != "listen_key"
        }
        _LOGGER.debug("Request %s %s params=%s", method, url, safe_params)

        last_error: Exception | None = None
        attempts = 2 if not require_listen_key else 1
        async with self._lock:
            for attempt in range(attempts):
                await self._throttle()
                try:
                    async with self._session.request(
                        method,
                        url,
                        params=params,
                        timeout=timeout,
                        allow_redirects=False,
                    ) as response:
                        retryable = response.status in {429, 500, 502, 503, 504}
                        if retryable and attempt + 1 < attempts:
                            await asyncio.sleep(min(2**attempt, 4))
                            reason = (
                                "rate limited"
                                if response.status == 429
                                else f"server error ({response.status})"
                            )
                            last_error = CannotConnectError(reason)
                            continue
                        return await self._parse_response(
                            response, require_listen_key=require_listen_key
                        )
                except TimeoutError as err:
                    last_error = CannotConnectError("request timed out")
                    last_error.__cause__ = err
                    if attempt + 1 >= attempts:
                        raise last_error from err
                    await asyncio.sleep(min(2**attempt, 4))
                except aiohttp.ClientError as err:
                    last_error = CannotConnectError("network error")
                    last_error.__cause__ = err
                    if attempt + 1 >= attempts:
                        raise last_error from err
                    await asyncio.sleep(min(2**attempt, 4))
        raise last_error or CannotConnectError("network error")

    async def _parse_response(
        self, response: aiohttp.ClientResponse, *, require_listen_key: bool = False
    ) -> Any:
        status = response.status
        if status == 403:
            text = (await response.text()).strip()
            if _INVALID_KEY_TEXT in text.lower():
                raise InvalidListenKeyError("Invalid Listen Key")
            raise CannotConnectError("access denied")
        if status == 401:
            if require_listen_key:
                raise InvalidListenKeyError("Invalid Listen Key")
            raise CannotConnectError("unauthorized")
        if status == 429:
            raise CannotConnectError("rate limited")
        if status == 404:
            raise CannotConnectError("API endpoint not found")
        if status >= 500:
            raise CannotConnectError(f"server error ({status})")
        if status != 200:
            raise CannotConnectError(f"unexpected HTTP status {status}")
        try:
            return await response.json(content_type=None)
        except aiohttp.ContentTypeError as err:
            raise InvalidResponseError("response is not JSON") from err
        except ValueError as err:
            raise InvalidResponseError("malformed JSON") from err

    async def _throttle(self) -> None:
        now = time.monotonic()
        wait = self._request_interval - (now - self._last_request_started)
        if wait > 0:
            await asyncio.sleep(wait)
        self._last_request_started = time.monotonic()


# Alias used when catching client errors without importing every subclass.
AudioAddictClientError = (
    InvalidListenKeyError,
    CannotConnectError,
    InvalidResponseError,
)


def describe_request_error(err: Exception, secret: str | None = None) -> str:
    """Return a log-safe description of a request failure."""

    return redact_text(str(err), secret)
