"""Register the Lovelace card as an extra frontend module."""

from __future__ import annotations

import logging
from pathlib import Path

from .const import CARD_FILENAME, DOMAIN, FRONTEND_URL_BASE, INTEGRATION_VERSION

_LOGGER = logging.getLogger(__name__)

_FRONTEND_FLAG = f"{DOMAIN}_frontend"


def card_module_url() -> str:
    """Return the URL Home Assistant should load as a frontend module."""

    return f"{FRONTEND_URL_BASE}/{CARD_FILENAME}?v={INTEGRATION_VERSION}"


def www_path() -> Path:
    """Return the on-disk directory that serves the card."""

    return Path(__file__).parent / "www"


async def async_register_frontend(hass) -> None:
    """Serve the card and auto-load it. Safe to call more than once."""

    if hass.data.get(_FRONTEND_FLAG):
        return
    hass.data[_FRONTEND_FLAG] = True

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
        _LOGGER.debug("Could not register DI.FM Radio static path: %s", err)
        return

    try:
        from homeassistant.components.frontend import add_extra_js_url

        add_extra_js_url(hass, card_module_url())
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning(
            "Could not auto-register the DI.FM Radio card. Add a Lovelace resource "
            "of type module pointing at %s (%s)",
            card_module_url(),
            err,
        )
