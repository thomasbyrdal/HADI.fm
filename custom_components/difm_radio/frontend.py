"""Register the Lovelace card as a frontend module.

HACS dashboard plugins live in ``/config/www/community/``. This card is part
of the integration, so it is served from ``custom_components/difm_radio/www``
at ``/difm_radio/difm-radio-card.js``.
"""

from __future__ import annotations

import contextlib
import logging
from pathlib import Path
from typing import Any

from .const import CARD_FILENAME, DOMAIN, FRONTEND_URL_BASE, INTEGRATION_VERSION

_LOGGER = logging.getLogger(__name__)

_PATH_FLAG = f"{DOMAIN}_frontend_path"
_MODULE_FLAG = f"{DOMAIN}_frontend_module"
_MAX_RESOURCE_WAITS = 12


def card_resource_path() -> str:
    """Return the unversioned URL path of the card."""

    return f"{FRONTEND_URL_BASE}/{CARD_FILENAME}"


def card_module_url() -> str:
    """Return the URL Home Assistant should load as a frontend module."""

    return f"{card_resource_path()}?v={INTEGRATION_VERSION}"


def resource_url_path(url: str) -> str:
    """Strip a cache-busting query string from a resource URL."""

    return str(url).split("?", 1)[0]


def is_our_card_resource(url: str) -> bool:
    """Return True if *url* points at this integration's card."""

    return resource_url_path(url) == card_resource_path()


def www_path() -> Path:
    """Return the on-disk directory that serves the card."""

    return Path(__file__).parent / "www"


async def async_register_frontend(hass) -> None:
    """Serve the card and register it with Lovelace. Safe to call more than once."""

    await _async_register_static_path(hass)
    await _async_register_card_module(hass)


async def _async_register_static_path(hass) -> None:
    if hass.data.get(_PATH_FLAG):
        return
    path = www_path()
    if not path.is_dir():
        _LOGGER.warning("DI.FM Radio card directory is missing: %s", path)
        return
    try:
        from homeassistant.components.http import StaticPathConfig

        await hass.http.async_register_static_paths(
            [StaticPathConfig(FRONTEND_URL_BASE, str(path), False)]
        )
    except RuntimeError:
        _LOGGER.debug("DI.FM Radio frontend path already registered")
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("Could not register DI.FM Radio static path: %s", err)
        return
    hass.data[_PATH_FLAG] = True


async def _async_register_card_module(hass, attempt: int = 0) -> None:
    if hass.data.get(_MODULE_FLAG):
        return
    lovelace = hass.data.get("lovelace")
    mode = getattr(lovelace, "mode", None) if lovelace is not None else None
    if lovelace is None or mode != "storage":
        _register_extra_js_url(hass)
        return
    resources = getattr(lovelace, "resources", None)
    if resources is None:
        _register_extra_js_url(hass)
        return
    if not getattr(resources, "loaded", False):
        await _async_load_resources(resources)
    if not getattr(resources, "loaded", False):
        if attempt >= _MAX_RESOURCE_WAITS:
            _LOGGER.warning(
                "Lovelace resources were not ready. Add a Dashboard resource of "
                "type module pointing at %s",
                card_module_url(),
            )
            _register_extra_js_url(hass)
            return
        from homeassistant.helpers.event import async_call_later

        async_call_later(
            hass,
            5,
            lambda _now: hass.async_create_task(_async_register_card_module(hass, attempt + 1)),
        )
        return
    try:
        await _async_upsert_resource(resources)
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("Could not add the DI.FM Radio Lovelace resource: %s", err)
        _register_extra_js_url(hass)
        return
    hass.data[_MODULE_FLAG] = True
    _LOGGER.info("Registered Lovelace card %s", card_module_url())


async def _async_load_resources(resources: Any) -> None:
    """Load stored Lovelace resources before creating items."""

    if hasattr(resources, "async_get_info"):
        with contextlib.suppress(Exception):
            await resources.async_get_info()
            return
    if hasattr(resources, "async_load"):
        with contextlib.suppress(Exception):
            await resources.async_load()


async def _async_upsert_resource(resources: Any) -> None:
    url = card_module_url()
    items = list(resources.async_items())
    for item in items:
        if not isinstance(item, dict) or not is_our_card_resource(str(item.get("url", ""))):
            continue
        if item.get("url") != url:
            await resources.async_update_item(
                item["id"],
                {"res_type": "module", "url": url},
            )
        return
    await resources.async_create_item({"res_type": "module", "url": url})


def _register_extra_js_url(hass) -> None:
    try:
        from homeassistant.components.frontend import add_extra_js_url

        add_extra_js_url(hass, card_module_url())
        hass.data[_MODULE_FLAG] = True
        _LOGGER.info("Registered DI.FM Radio extra JS module %s", card_module_url())
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning(
            "Could not auto-register the DI.FM Radio card. Add a Lovelace resource "
            "of type module pointing at %s (%s)",
            card_module_url(),
            err,
        )
