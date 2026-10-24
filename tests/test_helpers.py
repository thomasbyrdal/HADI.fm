"""Tests for favourite persistence, speaker checks, and secret redaction."""

from __future__ import annotations

import pytest

from custom_components.difm_radio.exceptions import InvalidListenKeyError
from custom_components.difm_radio.helpers import (
    apply_artwork_overrides,
    attach_icecast_key,
    build_station_options,
    favourite_views,
    merge_favourites,
    parse_favourites,
    redact_mapping,
    redact_url,
    validate_media_player_entity,
)
from custom_components.difm_radio.models import Catalogue, Favourite, Station
from custom_components.difm_radio.provider import AudioAddictClient

from .conftest import MockSession


def _station(station_id: str, network: str, key: str, name: str, **kwargs) -> Station:
    return Station(
        id=station_id,
        key=key,
        name=name,
        network=network,
        network_id=1,
        description_short=None,
        description_long=None,
        artwork_url=kwargs.get("artwork_url"),
        inferred_inactive=kwargs.get("inferred_inactive", False),
    )


def test_merge_favourites_preserves_order_and_adds_new() -> None:
    previous = [
        Favourite(id="1", network="di", key="trance", name="Trance"),
        Favourite(id="12", network="di", key="ambient", name="Ambient"),
    ]
    stations = {
        "1": _station("1", "di", "trance", "Trance"),
        "12": _station("12", "di", "ambient", "Ambient"),
        "73": _station("73", "jazzradio", "smoothjazz", "Smooth Jazz"),
    }
    merged = merge_favourites(previous, ["12", "73", "1"], stations)
    assert [fav.id for fav in merged] == ["1", "12", "73"]
    assert merged[2].name == "Smooth Jazz"


def test_merge_favourites_keeps_missing_station_when_still_selected() -> None:
    previous = [Favourite(id="gone", network="di", key="old", name="Old Station")]
    merged = merge_favourites(previous, ["gone"], {})
    assert len(merged) == 1
    assert merged[0].name == "Old Station"
    assert merged[0].key == "old"


def test_disappeared_favourite_is_marked_unavailable() -> None:
    previous = [Favourite(id="gone", network="di", key="old", name="Old Station")]
    catalogue = Catalogue(stations={"1": _station("1", "di", "trance", "Trance")})
    views = favourite_views(previous, catalogue)
    assert views[0].available is False
    assert views[0].name == "Old Station"


def test_inferred_inactive_favourite_is_unavailable() -> None:
    favourite = Favourite(id="999", network="di", key="chiptunes", name="XChiptunes")
    catalogue = Catalogue(
        stations={
            "999": _station(
                "999", "di", "chiptunes", "XChiptunes", inferred_inactive=True
            )
        }
    )
    views = favourite_views([favourite], catalogue)
    assert views[0].available is False


def test_parse_and_artwork_override() -> None:
    stored = [
        {"id": "1", "network": "di", "key": "trance", "name": "Trance"},
        {"id": "1", "network": "di", "key": "trance", "name": "duplicate"},
        {"bad": True},
    ]
    favourites = parse_favourites(stored)
    assert len(favourites) == 1
    updated = apply_artwork_overrides(
        favourites, {"1": "https://example.invalid/custom.png"}
    )
    assert updated[0].artwork_override == "https://example.invalid/custom.png"
    cleared = apply_artwork_overrides(updated, {"1": ""})
    assert cleared[0].artwork_override is None


def test_station_options_include_service_and_preserved_unavailable() -> None:
    catalogue = Catalogue(
        networks=[],
        stations={
            "1": _station("1", "di", "trance", "Trance"),
            "999": _station("999", "di", "chiptunes", "XChiptunes", inferred_inactive=True),
        },
    )
    catalogue.networks = []
    extra = [Favourite(id="gone", network="jazzradio", key="old", name="Old Jazz")]
    empty_filter = build_station_options(catalogue, [], extra)
    assert "1" in [item["value"] for item in empty_filter]
    options = build_station_options(catalogue, ["di"], extra)
    values = [item["value"] for item in options]
    labels = [item["label"] for item in options]
    assert "1" in values
    assert "999" not in values
    assert "gone" in values
    assert any("Trance" in label and "di" in label for label in labels)
    assert any("unavailable" in label for label in labels)


def test_redact_listen_key_from_data_and_urls() -> None:
    payload = {
        "listen_key": "super-secret-key",
        "stream": "http://prem1.di.fm:80/trance_hi?listen_key=super-secret-key",
        "favourites": [{"id": "1", "url": "https://listen.di.fm/x.pls?listen_key=abc"}],
    }
    redacted = redact_mapping(payload)
    assert redacted["listen_key"] == "REDACTED"
    assert "super-secret-key" not in redacted["stream"]
    assert "listen_key=REDACTED" in redacted["stream"]
    assert "abc" not in str(redacted["favourites"])
    assert redact_url("http://x/y") == "http://x/y"
    bare = "http://prem2.di.fm:80/trance_hi?super-secret-key"
    assert redact_url(bare) == "http://prem2.di.fm:80/trance_hi?REDACTED"
    assert "super-secret-key" not in redact_mapping({"stream": bare})["stream"]
    leaked = redact_mapping({"note": "key is super-secret-key"}, secret="super-secret-key")
    assert leaked["note"] == "key is REDACTED"


def test_attach_icecast_key_uses_bare_query() -> None:
    url = "http://prem2.di.fm:80/trance_hi"
    key = "abc123listen"
    assert attach_icecast_key(url, key) == f"{url}?{key}"
    assert attach_icecast_key(f"{url}?listen_key={key}", key) == f"{url}?{key}"
    assert attach_icecast_key(f"{url}?{key}", key) == f"{url}?{key}"
    assert attach_icecast_key(url, "") == url


def test_speaker_validation() -> None:
    assert validate_media_player_entity(False, None) == "speaker_missing"
    assert validate_media_player_entity(True, "light") == "speaker_incompatible"
    assert validate_media_player_entity(True, "media_player") is None


async def test_client_exceptions_do_not_include_listen_key() -> None:
    session = MockSession()
    session.add("GET", "/di/listen/premium_high/trance", 403, text="Invalid Listen Key")
    client = AudioAddictClient(session, request_interval=0)
    with pytest.raises(InvalidListenKeyError) as err:
        await client.async_validate_listen_key("super-secret-key")
    assert "super-secret-key" not in str(err.value)
