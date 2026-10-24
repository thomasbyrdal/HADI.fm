"""Tests for config-entry shaped favourite and speaker persistence."""

from __future__ import annotations

from custom_components.difm_radio.const import (
    CONF_DEFAULT_MEDIA_PLAYER,
    CONF_FAVOURITES,
    CONF_LISTEN_KEY,
    CONF_STREAM_QUALITY,
    DEFAULT_STREAM_QUALITY,
)
from custom_components.difm_radio.helpers import merge_favourites, parse_favourites, redact_mapping
from custom_components.difm_radio.models import Favourite, Station


def test_entry_data_keeps_listen_key_out_of_options() -> None:
    data = {CONF_LISTEN_KEY: "secret-listen-key"}
    options = {
        CONF_FAVOURITES: [
            Favourite(id="1", network="di", key="trance", name="Trance").as_dict()
        ],
        CONF_DEFAULT_MEDIA_PLAYER: "media_player.living_room",
        CONF_STREAM_QUALITY: DEFAULT_STREAM_QUALITY,
    }
    assert CONF_LISTEN_KEY not in options
    assert "secret-listen-key" not in str(options)
    assert redact_mapping(data)[CONF_LISTEN_KEY] == "REDACTED"


def test_options_round_trip_preserves_favourite_order() -> None:
    options = {
        CONF_FAVOURITES: [
            {"id": "73", "network": "jazzradio", "key": "smoothjazz", "name": "Smooth Jazz"},
            {"id": "1", "network": "di", "key": "trance", "name": "Trance"},
        ]
    }
    favourites = parse_favourites(options[CONF_FAVOURITES])
    assert [fav.id for fav in favourites] == ["73", "1"]
    stations = {
        "1": Station(
            id="1",
            key="trance",
            name="Trance",
            network="di",
            network_id=1,
            description_short=None,
            description_long=None,
            artwork_url=None,
        ),
        "73": Station(
            id="73",
            key="smoothjazz",
            name="Smooth Jazz",
            network="jazzradio",
            network_id=12,
            description_short=None,
            description_long=None,
            artwork_url=None,
        ),
        "12": Station(
            id="12",
            key="ambient",
            name="Ambient",
            network="di",
            network_id=1,
            description_short=None,
            description_long=None,
            artwork_url=None,
        ),
    }
    updated = merge_favourites(favourites, ["73", "1", "12"], stations)
    assert [fav.id for fav in updated] == ["73", "1", "12"]
    serialized = [fav.as_dict() for fav in updated]
    assert parse_favourites(serialized)[0].network == "jazzradio"
