"""Integration services for DI.FM Radio."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv

from .const import (
    ATTR_FAVOURITE,
    ATTR_MEDIA_PLAYER,
    ATTR_STATION_ID,
    CONF_DEFAULT_MEDIA_PLAYER,
    CONF_FAVOURITES,
    CONF_STREAM_QUALITY,
    DEFAULT_STREAM_QUALITY,
    DOMAIN,
    SERVICE_PLAY_STATION,
    SERVICE_REFRESH_STATIONS,
    SERVICE_SET_FAVOURITE,
    SERVICE_STOP,
)
from .exceptions import PlaybackError, UnknownStationError
from .helpers import parse_favourites
from .models import Favourite
from .playback import DifmRadioRuntime

PLAY_STATION_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_STATION_ID): cv.string,
        vol.Optional(ATTR_MEDIA_PLAYER): cv.entity_id,
    }
)
SET_FAVOURITE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_STATION_ID): cv.string,
        vol.Required(ATTR_FAVOURITE): cv.boolean,
    }
)


def _runtime(hass: HomeAssistant) -> tuple[Any, DifmRadioRuntime]:
    for entry in hass.config_entries.async_entries(DOMAIN):
        runtime = getattr(entry, "runtime_data", None)
        if runtime is not None:
            return entry, runtime
    raise HomeAssistantError("DI.FM Radio is not configured")


async def async_setup_services(hass: HomeAssistant) -> None:
    """Register domain services once."""

    if hass.data.get(f"{DOMAIN}_services"):
        return
    hass.data[f"{DOMAIN}_services"] = True

    async def handle_play_station(call: ServiceCall) -> None:
        entry, runtime = _runtime(hass)
        try:
            await runtime.controller.async_play_station(
                runtime.coordinator.data,
                str(call.data[ATTR_STATION_ID]),
                quality=str(entry.options.get(CONF_STREAM_QUALITY, DEFAULT_STREAM_QUALITY)),
                default_speaker=entry.options.get(CONF_DEFAULT_MEDIA_PLAYER),
                speaker_entity_id=call.data.get(ATTR_MEDIA_PLAYER),
            )
        except PlaybackError as err:
            raise HomeAssistantError(str(err)) from err
        if runtime.entity is not None:
            runtime.entity.async_watch_speaker()
            runtime.entity.async_write_ha_state()

    async def handle_stop(call: ServiceCall) -> None:
        _entry, runtime = _runtime(hass)
        await runtime.controller.async_stop()
        if runtime.entity is not None:
            runtime.entity.async_write_ha_state()

    async def handle_refresh_stations(call: ServiceCall) -> None:
        _entry, runtime = _runtime(hass)
        await runtime.coordinator.async_request_refresh()

    async def handle_set_favourite(call: ServiceCall) -> None:
        entry, runtime = _runtime(hass)
        station_id = str(call.data[ATTR_STATION_ID]).strip()
        wanted = bool(call.data[ATTR_FAVOURITE])
        current = parse_favourites(entry.options.get(CONF_FAVOURITES))
        existing = {fav.id: fav for fav in current}
        if wanted:
            if station_id in existing:
                return
            catalogue = runtime.coordinator.data
            station = catalogue.stations.get(station_id) if catalogue else None
            if station is None:
                raise HomeAssistantError(str(UnknownStationError(station_id)))
            current.append(Favourite.from_station(station))
        else:
            current = [fav for fav in current if fav.id != station_id]
        options = dict(entry.options)
        options[CONF_FAVOURITES] = [fav.as_dict() for fav in current]
        hass.config_entries.async_update_entry(entry, options=options)
        if runtime.entity is not None:
            runtime.entity.async_write_ha_state()

    hass.services.async_register(
        DOMAIN, SERVICE_PLAY_STATION, handle_play_station, schema=PLAY_STATION_SCHEMA
    )
    hass.services.async_register(DOMAIN, SERVICE_STOP, handle_stop)
    hass.services.async_register(DOMAIN, SERVICE_REFRESH_STATIONS, handle_refresh_stations)
    hass.services.async_register(
        DOMAIN, SERVICE_SET_FAVOURITE, handle_set_favourite, schema=SET_FAVOURITE_SCHEMA
    )


@callback
def async_unload_services(hass: HomeAssistant) -> None:
    """Remove domain services."""

    hass.data.pop(f"{DOMAIN}_services", None)
    for service in (
        SERVICE_PLAY_STATION,
        SERVICE_STOP,
        SERVICE_REFRESH_STATIONS,
        SERVICE_SET_FAVOURITE,
    ):
        hass.services.async_remove(DOMAIN, service)
