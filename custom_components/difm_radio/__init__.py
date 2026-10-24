"""DI.FM Radio integration for Home Assistant."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from .const import CONF_LISTEN_KEY, DOMAIN

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant

    from .playback import DifmRadioRuntime

    type DifmRadioConfigEntry = ConfigEntry[DifmRadioRuntime]

_LOGGER = logging.getLogger(__name__)

__all__ = [
    "DOMAIN",
    "async_reload_entry",
    "async_setup",
    "async_setup_entry",
    "async_unload_entry",
]


async def async_setup(hass, _config) -> bool:
    """Register the Lovelace card before config entries load."""

    from .frontend import async_register_frontend

    await async_register_frontend(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up DI.FM Radio from a config entry."""

    from homeassistant.const import Platform
    from homeassistant.exceptions import ConfigEntryAuthFailed, ConfigEntryNotReady
    from homeassistant.helpers.aiohttp_client import async_get_clientsession

    from .coordinator import DifmRadioCoordinator
    from .exceptions import CannotConnectError, InvalidListenKeyError, InvalidResponseError
    from .media_player import HomeAssistantSpeakerPort
    from .playback import DifmRadioRuntime, RadioController
    from .provider import AudioAddictClient, describe_request_error
    from .services import async_setup_services

    listen_key = str(entry.data.get(CONF_LISTEN_KEY, "")).strip()
    if not listen_key:
        raise ConfigEntryAuthFailed("Listen key is missing")

    client = AudioAddictClient(async_get_clientsession(hass), listen_key)
    try:
        await client.async_validate_listen_key(listen_key)
    except InvalidListenKeyError as err:
        raise ConfigEntryAuthFailed("Listen key rejected") from err
    except (CannotConnectError, InvalidResponseError) as err:
        raise ConfigEntryNotReady(describe_request_error(err)) from err

    from .frontend import async_register_frontend

    await async_register_frontend(hass)
    coordinator = DifmRadioCoordinator(hass, entry, client)
    await coordinator.async_config_entry_first_refresh()
    controller = RadioController(client, HomeAssistantSpeakerPort(hass))
    entry.runtime_data = DifmRadioRuntime(coordinator=coordinator, controller=controller)
    await hass.config_entries.async_forward_entry_setups(entry, [Platform.MEDIA_PLAYER])
    await async_setup_services(hass)
    entry.async_on_unload(entry.add_update_listener(async_update_listener))
    _LOGGER.debug(
        "DI.FM Radio catalogue loaded with %s stations", len(coordinator.data.stations)
    )
    return True


async def async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Apply options without tearing down an owned playback session."""

    runtime = entry.runtime_data
    listen_key = str(entry.data.get(CONF_LISTEN_KEY, "")).strip()
    runtime.coordinator.client.set_listen_key(listen_key)
    if runtime.entity is not None:
        runtime.entity.async_on_options_update()


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry and stop a session we still own."""

    from homeassistant.const import Platform

    from .services import async_unload_services

    runtime = getattr(entry, "runtime_data", None)
    if runtime is not None:
        await runtime.controller.async_stop()
    unloaded = await hass.config_entries.async_unload_platforms(entry, [Platform.MEDIA_PLAYER])
    remaining = [
        item
        for item in hass.config_entries.async_entries(DOMAIN)
        if item.entry_id != entry.entry_id and getattr(item, "runtime_data", None) is not None
    ]
    if unloaded and not remaining and hass.data.get(f"{DOMAIN}_services"):
        async_unload_services(hass)
    return unloaded


async def async_reload_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Reload the config entry after reauth."""

    await hass.config_entries.async_reload(entry.entry_id)
