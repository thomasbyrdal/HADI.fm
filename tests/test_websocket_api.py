"""Websocket API tests for the settings panel."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

pytest.importorskip("homeassistant")
pytest.importorskip("pytest_homeassistant_custom_component")

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.difm_radio.const import (
    CONF_DEFAULT_MEDIA_PLAYER,
    CONF_FAVOURITES,
    CONF_LISTEN_KEY,
    CONF_STREAM_QUALITY,
    DOMAIN,
)
from custom_components.difm_radio.helpers import parse_favourites
from custom_components.difm_radio.models import Catalogue, Network, Station
from custom_components.difm_radio.websocket_api import (
    WS_TYPE_GET_CONFIG,
    WS_TYPE_SET_CONFIG,
    async_register_websocket_api,
    ws_get_config,
    ws_set_config,
)


@pytest.fixture(autouse=True)
def _enable_custom_integrations(enable_custom_integrations):
    return enable_custom_integrations


def _catalogue() -> Catalogue:
    return Catalogue(
        networks=[
            Network(
                id=1, key="di", name="DI.FM", site_url=None, listen_url=None, active=True
            )
        ],
        stations={
            "1": Station(
                id="1",
                key="trance",
                name="Trance",
                network="di",
                network_id=1,
                description_short=None,
                description_long=None,
                artwork_url="https://cdn.example/trance.jpg",
            ),
            "2": Station(
                id="2",
                key="house",
                name="House",
                network="di",
                network_id=1,
                description_short=None,
                description_long=None,
                artwork_url="https://cdn.example/house.jpg",
            ),
        },
    )


class _FakeConnection:
    def __init__(self) -> None:
        self.messages: list[dict] = []

    def send_result(self, msg_id, result=None):
        self.messages.append(
            {"id": msg_id, "type": "result", "success": True, "result": result}
        )

    def send_error(self, msg_id, code, message):
        self.messages.append(
            {
                "id": msg_id,
                "type": "result",
                "success": False,
                "error": {"code": code, "message": message},
            }
        )


async def test_ws_get_and_set_config(hass) -> None:
    hass.states.async_set("media_player.kitchen", "idle", {"friendly_name": "Kitchen"})
    entry = MockConfigEntry(
        domain=DOMAIN,
        data={CONF_LISTEN_KEY: "valid-listen-key-1"},
        options={
            CONF_FAVOURITES: [
                {
                    "id": "1",
                    "network": "di",
                    "key": "trance",
                    "name": "Trance",
                }
            ],
            CONF_DEFAULT_MEDIA_PLAYER: "media_player.kitchen",
            CONF_STREAM_QUALITY: "premium_high",
        },
    )
    entry.add_to_hass(hass)
    entry.runtime_data = SimpleNamespace(
        coordinator=SimpleNamespace(data=_catalogue()),
        entity=None,
        favourites_entity=None,
        activity=None,
    )
    async_register_websocket_api(hass)

    connection = _FakeConnection()
    await ws_get_config(hass, connection, {"id": 1, "type": WS_TYPE_GET_CONFIG})
    assert connection.messages[-1]["success"] is True
    payload = connection.messages[-1]["result"]
    assert payload["default_media_player"] == "media_player.kitchen"
    assert payload["favourites"][0]["id"] == "1"
    assert payload["stations"][0]["artwork_url"].startswith("https://")
    assert any(item["entity_id"] == "media_player.kitchen" for item in payload["media_players"])

    await ws_set_config(
        hass,
        connection,
        {
            "id": 2,
            "type": WS_TYPE_SET_CONFIG,
            CONF_DEFAULT_MEDIA_PLAYER: "media_player.kitchen",
            CONF_STREAM_QUALITY: "premium",
            CONF_FAVOURITES: ["1", "2"],
        },
    )
    assert connection.messages[-1]["success"] is True
    assert entry.options[CONF_STREAM_QUALITY] == "premium"
    assert [fav.id for fav in parse_favourites(entry.options[CONF_FAVOURITES])] == ["1", "2"]
