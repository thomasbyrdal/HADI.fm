"""Websocket API for the DI.FM Radio settings panel."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv

from .const import (
    CONF_DEFAULT_MEDIA_PLAYER,
    CONF_FAVOURITES,
    CONF_LISTEN_KEY,
    CONF_STREAM_QUALITY,
    DEFAULT_STREAM_QUALITY,
    DOMAIN,
    QUALITY_LABELS,
    STREAM_QUALITIES,
)
from .exceptions import CannotConnectError, InvalidListenKeyError, InvalidResponseError
from .helpers import (
    favourite_views,
    merge_favourites,
    parse_favourites,
    validate_media_player_entity,
)
from .provider import describe_request_error

WS_TYPE_GET_CONFIG = f"{DOMAIN}/get_config"
WS_TYPE_SET_CONFIG = f"{DOMAIN}/set_config"


@callback
def async_register_websocket_api(hass: HomeAssistant) -> None:
    """Register websocket commands once."""

    if hass.data.get(f"{DOMAIN}_websocket"):
        return
    hass.data[f"{DOMAIN}_websocket"] = True
    websocket_api.async_register_command(hass, ws_get_config)
    websocket_api.async_register_command(hass, ws_set_config)


def _entry_runtime(hass: HomeAssistant):
    for entry in hass.config_entries.async_entries(DOMAIN):
        runtime = getattr(entry, "runtime_data", None)
        if runtime is not None:
            return entry, runtime
    return None, None


def _station_payload(station) -> dict[str, Any]:
    return {
        "id": station.id,
        "name": station.name,
        "network": station.network,
        "key": station.key,
        "artwork_url": station.artwork_url,
        "available": not station.inferred_inactive,
    }


def _favourite_payload(view) -> dict[str, Any]:
    return {
        "id": view.id,
        "name": view.name,
        "network": view.network,
        "key": view.key,
        "artwork_url": view.artwork_url,
        "available": view.available,
    }


def _media_players(hass: HomeAssistant) -> list[dict[str, str]]:
    players: list[dict[str, str]] = []
    for state in hass.states.async_all(Platform.MEDIA_PLAYER):
        players.append(
            {
                "entity_id": state.entity_id,
                "name": state.name or state.entity_id,
            }
        )
    players.sort(key=lambda item: item["name"].lower())
    return players


@websocket_api.websocket_command({vol.Required("type"): WS_TYPE_GET_CONFIG})
@websocket_api.async_response
async def ws_get_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return settings data for the custom configuration panel."""

    entry, runtime = _entry_runtime(hass)
    if entry is None or runtime is None:
        connection.send_error(msg["id"], "not_configured", "DI.FM Radio is not configured")
        return

    catalogue = runtime.coordinator.data
    favourites = parse_favourites(entry.options.get(CONF_FAVOURITES))
    if catalogue is not None:
        views = favourite_views(favourites, catalogue)
        stations = [
            _station_payload(station)
            for station in sorted(
                catalogue.selectable_stations(),
                key=lambda item: (item.network, item.name.lower()),
            )
        ]
        networks = [
            {"key": network.key, "name": network.name}
            for network in catalogue.networks
            if network.active
        ]
        favourite_payload = [_favourite_payload(view) for view in views]
    else:
        stations = []
        networks = []
        favourite_payload = [
            {
                "id": fav.id,
                "name": fav.name,
                "network": fav.network,
                "key": fav.key,
                "artwork_url": fav.artwork_override,
                "available": False,
            }
            for fav in favourites
        ]

    connection.send_result(
        msg["id"],
        {
            "default_media_player": entry.options.get(CONF_DEFAULT_MEDIA_PLAYER),
            "stream_quality": entry.options.get(CONF_STREAM_QUALITY, DEFAULT_STREAM_QUALITY),
            CONF_LISTEN_KEY: str(entry.data.get(CONF_LISTEN_KEY, "")),
            "qualities": [
                {"value": key, "label": QUALITY_LABELS[key]} for key in STREAM_QUALITIES
            ],
            "media_players": _media_players(hass),
            "networks": networks,
            "stations": stations,
            "favourites": favourite_payload,
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): WS_TYPE_SET_CONFIG,
        vol.Required(CONF_DEFAULT_MEDIA_PLAYER): cv.entity_id,
        vol.Required(CONF_STREAM_QUALITY): vol.In(STREAM_QUALITIES),
        vol.Required(CONF_FAVOURITES): [cv.string],
        vol.Required(CONF_LISTEN_KEY): cv.string,
    }
)
@websocket_api.async_response
async def ws_set_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Persist speaker, quality, favourites, and listen key from the settings panel."""

    try:
        await _async_ws_set_config(hass, connection, msg)
    except Exception as err:  # noqa: BLE001
        connection.send_error(msg["id"], "unknown_error", str(err) or err.__class__.__name__)


async def _async_ws_set_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    entry, runtime = _entry_runtime(hass)
    if entry is None or runtime is None:
        connection.send_error(msg["id"], "not_configured", "DI.FM Radio is not configured")
        return

    entity_id = str(msg[CONF_DEFAULT_MEDIA_PLAYER])
    state = hass.states.get(entity_id)
    speaker_error = validate_media_player_entity(
        exists=state is not None,
        domain=state.domain if state is not None else None,
    )
    if speaker_error:
        connection.send_error(msg["id"], speaker_error, "Invalid speaker")
        return

    catalogue = runtime.coordinator.data
    if catalogue is None:
        connection.send_error(msg["id"], "cannot_connect", "Station catalogue is not available")
        return

    previous = parse_favourites(entry.options.get(CONF_FAVOURITES))
    selected_ids = [str(item) for item in msg[CONF_FAVOURITES]]
    merged = merge_favourites(previous, selected_ids, catalogue.stations)
    if not merged:
        connection.send_error(msg["id"], "no_favourites", "Select at least one favourite")
        return

    listen_key = str(msg.get(CONF_LISTEN_KEY, "")).strip()
    previous_key = str(entry.data.get(CONF_LISTEN_KEY, "")).strip()
    if listen_key and listen_key != previous_key:
        try:
            await runtime.coordinator.client.async_validate_listen_key(listen_key)
        except InvalidListenKeyError:
            connection.send_error(msg["id"], "invalid_auth", "The listen key was rejected")
            return
        except (CannotConnectError, InvalidResponseError) as err:
            connection.send_error(msg["id"], "cannot_connect", describe_request_error(err))
            return

    options = dict(entry.options)
    options[CONF_DEFAULT_MEDIA_PLAYER] = entity_id
    options[CONF_STREAM_QUALITY] = str(msg[CONF_STREAM_QUALITY])
    options[CONF_FAVOURITES] = [fav.as_dict() for fav in merged]

    update_kwargs: dict[str, Any] = {"options": options}
    if listen_key != previous_key:
        data = dict(entry.data)
        data[CONF_LISTEN_KEY] = listen_key
        update_kwargs["data"] = data

    hass.config_entries.async_update_entry(entry, **update_kwargs)

    if listen_key != previous_key:
        runtime.coordinator.client.set_listen_key(listen_key or None)

    if runtime.entity is not None:
        runtime.entity.async_on_options_update()
    if runtime.favourites_entity is not None:
        runtime.favourites_entity.async_on_options_update()

    if runtime.activity is not None:
        runtime.activity.note(
            "settings_saved",
            f"speaker={entity_id} favourites={len(merged)} listen_key_changed="
            f"{listen_key != previous_key}",
        )

    connection.send_result(
        msg["id"],
        {
            "default_media_player": entity_id,
            "stream_quality": options[CONF_STREAM_QUALITY],
            CONF_LISTEN_KEY: listen_key,
            "favourites": [
                _favourite_payload(view) for view in favourite_views(merged, catalogue)
            ],
        },
    )
