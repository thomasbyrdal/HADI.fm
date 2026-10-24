"""Config-flow tests. Skipped when Home Assistant is not installed."""

from __future__ import annotations

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.difm_radio.const import (
    CONF_DEFAULT_MEDIA_PLAYER,
    CONF_FAVOURITES,
    CONF_LISTEN_KEY,
    CONF_SERVICE_FILTER,
    CONF_STREAM_QUALITY,
    DOMAIN,
)
from custom_components.difm_radio.helpers import parse_favourites

from .conftest import LISTEN_URLS


@pytest.fixture(autouse=True)
def _enable_custom_integrations(enable_custom_integrations):
    """Load custom_components in the Home Assistant test harness."""

    return enable_custom_integrations


def _patch_client(monkeypatch, session) -> None:
    from custom_components.difm_radio import config_flow, provider

    def factory(*args, **kwargs):
        return provider.AudioAddictClient(session, request_interval=0)

    monkeypatch.setattr(config_flow, "AudioAddictClient", factory)


async def test_user_flow_invalid_key(hass, monkeypatch, session) -> None:
    session.add("GET", "/di/listen/premium_high/trance", 403, text="Invalid Listen Key")
    _patch_client(monkeypatch, session)
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_LISTEN_KEY: "invalidkey123456"}
    )
    assert result["type"] == "form"
    assert result["errors"]["base"] == "invalid_auth"


async def test_user_flow_success(hass, monkeypatch, session) -> None:
    hass.states.async_set("media_player.living_room", "idle")
    session.add("GET", "/di/listen/premium_high/trance", 200, LISTEN_URLS)
    _patch_client(monkeypatch, session)

    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_LISTEN_KEY: "valid-listen-key-1"}
    )
    assert result["step_id"] == "services"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_SERVICE_FILTER: ["di", "jazzradio"]}
    )
    assert result["step_id"] == "favourites"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_FAVOURITES: ["1", "73"]}
    )
    assert result["step_id"] == "player"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {
            CONF_DEFAULT_MEDIA_PLAYER: "media_player.living_room",
            CONF_STREAM_QUALITY: "premium_high",
        },
    )
    assert result["type"] == "create_entry"
    assert result["data"][CONF_LISTEN_KEY] == "valid-listen-key-1"
    favourites = parse_favourites(result["options"][CONF_FAVOURITES])
    assert [fav.id for fav in favourites] == ["1", "73"]
    assert result["options"][CONF_DEFAULT_MEDIA_PLAYER] == "media_player.living_room"


async def test_options_flow_updates_speaker(hass, monkeypatch, session) -> None:
    hass.states.async_set("media_player.kitchen", "idle")
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={CONF_LISTEN_KEY: "valid-listen-key-1"},
        options={
            CONF_FAVOURITES: [{"id": "1", "network": "di", "key": "trance", "name": "Trance"}],
            CONF_DEFAULT_MEDIA_PLAYER: "media_player.living_room",
            CONF_STREAM_QUALITY: "premium_high",
        },
    )
    entry.add_to_hass(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] == "menu"
    result = await hass.config_entries.options.async_configure(
        result["flow_id"], {"next_step_id": "player"}
    )
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            CONF_DEFAULT_MEDIA_PLAYER: "media_player.kitchen",
            CONF_STREAM_QUALITY: "premium",
        },
    )
    assert result["type"] == "create_entry"
    assert entry.options[CONF_DEFAULT_MEDIA_PLAYER] == "media_player.kitchen"
    assert entry.options[CONF_STREAM_QUALITY] == "premium"
