"""Tests for the verified AudioAddict client."""

from __future__ import annotations

import pytest

from custom_components.difm_radio.exceptions import (
    CannotConnectError,
    InvalidListenKeyError,
    InvalidResponseError,
)
from custom_components.difm_radio.provider import AudioAddictClient

from .conftest import LISTEN_URLS, MockSession


@pytest.fixture
def client(session: MockSession) -> AudioAddictClient:
    return AudioAddictClient(session, request_interval=0)


async def test_catalogue_requests_do_not_send_listen_key(
    client: AudioAddictClient, session: MockSession
) -> None:
    await client.async_get_catalogue()
    for _method, path, params in session.calls:
        assert "listen_key" not in path
        assert not params or "listen_key" not in params


async def test_list_networks_and_multi_service_catalogue(
    client: AudioAddictClient, session: MockSession
) -> None:
    catalogue = await client.async_get_catalogue()
    assert [network.key for network in catalogue.networks] == ["di", "jazzradio"]
    assert set(catalogue.stations) == {"1", "12", "999", "73"}
    assert catalogue.stations["1"].name == "Trance"
    assert catalogue.stations["73"].network == "jazzradio"
    assert catalogue.stations["999"].inferred_inactive is True
    assert {network.key for network in catalogue.networks} <= {
        "di",
        "jazzradio",
        "radiotunes",
        "rockradio",
        "classicalradio",
        "zenradio",
    }


async def test_validate_listen_key_requires_query_parameter(
    client: AudioAddictClient, session: MockSession
) -> None:
    session.add("GET", "/di/listen/premium_high/trance", 200, LISTEN_URLS)
    with pytest.raises(InvalidListenKeyError):
        await client.async_validate_listen_key("   ")
    assert not any(
        call[1].startswith("/di/listen/") and not (call[2] or {}).get("listen_key")
        for call in session.calls
    )


async def test_validate_listen_key_rejects_invalid_key(
    client: AudioAddictClient, session: MockSession
) -> None:
    session.add(
        "GET",
        "/di/listen/premium_high/trance",
        403,
        text="Invalid Listen Key",
    )
    with pytest.raises(InvalidListenKeyError):
        await client.async_validate_listen_key("invalidkey123456")
    method, path, params = session.calls[-1]
    assert method == "GET"
    assert path.startswith("/di/listen/premium_high/trance")
    assert params == {"listen_key": "invalidkey123456"}


async def test_validate_listen_key_accepts_url_list(
    client: AudioAddictClient, session: MockSession
) -> None:
    urls = await client.async_validate_listen_key("valid-listen-key-1")
    assert urls == LISTEN_URLS
    assert session.calls[-1][2] == {"listen_key": "valid-listen-key-1"}


async def test_empty_key_does_not_use_public_listen_response(
    client: AudioAddictClient, session: MockSession
) -> None:
    """A request without listen_key returns 200 publicly; the client must not do that."""

    session.add("GET", "/di/listen/premium_high/trance", 200, LISTEN_URLS)
    with pytest.raises(InvalidListenKeyError):
        await client._async_listen_urls(  # noqa: SLF001
            "di", "trance", "premium_high", listen_key=""
        )


async def test_malformed_listen_response(
    client: AudioAddictClient, session: MockSession
) -> None:
    session.add("GET", "/di/listen/premium_high/trance", 200, {"not": "a list"})
    with pytest.raises(InvalidResponseError):
        await client.async_validate_listen_key("valid-listen-key-1")


async def test_timeout_and_server_error(
    client: AudioAddictClient, session: MockSession
) -> None:
    session.add("GET", "/networks", 503, text="unavailable")
    with pytest.raises(CannotConnectError):
        await client.async_list_networks()


async def test_rate_limit_is_a_connect_error(
    client: AudioAddictClient, session: MockSession
) -> None:
    session.add("GET", "/networks", 429, text="slow down")
    with pytest.raises(CannotConnectError, match="rate limited"):
        await client.async_list_networks()


async def test_listen_401_is_invalid_key(
    client: AudioAddictClient, session: MockSession
) -> None:
    session.add("GET", "/di/listen/premium_high/trance", 401, text="unauthorized")
    with pytest.raises(InvalidListenKeyError):
        await client.async_validate_listen_key("valid-listen-key-1")


async def test_empty_catalogue_is_an_error(
    client: AudioAddictClient, session: MockSession
) -> None:
    session.add("GET", "/di/channels", 200, [])
    session.add("GET", "/jazzradio/channels", 200, [])
    with pytest.raises(InvalidResponseError):
        await client.async_get_catalogue()


async def test_resolve_stream_urls_appends_bare_listen_key(
    client: AudioAddictClient, session: MockSession
) -> None:
    session.add(
        "GET",
        "/jazzradio/listen/premium_high/smoothjazz",
        200,
        ["http://prem1.jazzradio.com:80/smoothjazz"],
    )
    urls = await client.async_resolve_stream_urls(
        "jazzradio",
        "smoothjazz",
        "premium_high",
        listen_key="abc123listen",
    )
    assert urls == ["http://prem1.jazzradio.com:80/smoothjazz?abc123listen"]
    assert "listen_key=" not in urls[0]


async def test_resolve_stream_urls_keeps_existing_bare_key(
    client: AudioAddictClient, session: MockSession
) -> None:
    session.add(
        "GET",
        "/di/listen/premium_high/trance",
        200,
        ["http://prem2.di.fm:80/trance_hi?abc123listen"],
    )
    urls = await client.async_resolve_stream_urls(
        "di", "trance", "premium_high", listen_key="abc123listen"
    )
    assert urls == ["http://prem2.di.fm:80/trance_hi?abc123listen"]


async def test_resolve_stream_rejects_unknown_quality(
    client: AudioAddictClient,
) -> None:
    with pytest.raises(InvalidResponseError):
        await client.async_resolve_stream_urls("di", "trance", "public3", listen_key="abc")


async def test_partial_network_failure_still_returns_other_services(
    client: AudioAddictClient, session: MockSession
) -> None:
    session.add("GET", "/jazzradio/channels", 500, text="error")
    catalogue = await client.async_get_catalogue()
    assert "1" in catalogue.stations
    assert "73" not in catalogue.stations
