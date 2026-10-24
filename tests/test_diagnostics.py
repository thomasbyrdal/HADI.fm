"""Diagnostics must never include the listen key or Icecast credentials."""

from __future__ import annotations

from custom_components.difm_radio.const import CONF_LISTEN_KEY, INTEGRATION_VERSION
from custom_components.difm_radio.diagnostics import build_diagnostics_payload
from custom_components.difm_radio.helpers import favourite_views
from custom_components.difm_radio.models import Catalogue, Favourite, Station
from custom_components.difm_radio.playback import PlaybackState


class _Controller:
    def __init__(self) -> None:
        self.state = PlaybackState(
            station=Station(
                id="1",
                key="trance",
                name="Trance",
                network="di",
                network_id=1,
                description_short=None,
                description_long=None,
                artwork_url="https://cdn-images.audioaddict.com/trance.png",
            ),
            speaker_entity_id="media_player.living_room",
            stream_url="http://prem2.di.fm:80/trance_hi?super-secret-key",
            owned=True,
            last_error_code="playback_failed",
            logical_state="playing",
        )


def test_diagnostics_redact_secrets_and_omit_stream_url() -> None:
    catalogue = Catalogue(
        stations={
            "1": Station(
                id="1",
                key="trance",
                name="Trance",
                network="di",
                network_id=1,
                description_short=None,
                description_long=None,
                artwork_url=None,
            )
        }
    )
    views = favourite_views(
        [Favourite(id="1", network="di", key="trance", name="Trance")], catalogue
    )
    payload = build_diagnostics_payload(
        entry_data={CONF_LISTEN_KEY: "super-secret-key"},
        entry_options={"default_media_player": "media_player.living_room"},
        catalogue=catalogue,
        favourite_views=views,
        controller=_Controller(),
        last_update_success=True,
        last_exception=RuntimeError("failed http://x?super-secret-key"),
        frontend_registered=True,
    )
    dumped = str(payload)
    assert "super-secret-key" not in dumped
    assert "trance_hi" not in dumped
    assert payload["data"][CONF_LISTEN_KEY] == "REDACTED"
    assert payload["integration"]["version"] == INTEGRATION_VERSION
    assert payload["playback"]["has_stream_url"] is True
    assert "stream_url" not in payload["playback"]
    assert payload["coordinator"]["last_exception"]
    assert "super-secret-key" not in payload["coordinator"]["last_exception"]
