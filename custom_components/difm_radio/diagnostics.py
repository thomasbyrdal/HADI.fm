"""Diagnostics for DI.FM Radio. Listen keys and stream credentials are redacted."""

from __future__ import annotations

from typing import Any

from .const import CONF_LISTEN_KEY, DOMAIN, INTEGRATION_VERSION
from .frontend import card_module_url
from .helpers import redact_mapping, redact_text


def build_diagnostics_payload(
    *,
    entry_data: dict[str, Any],
    entry_options: dict[str, Any],
    catalogue: Any = None,
    favourite_views: list[Any] | None = None,
    controller: Any = None,
    last_update_success: bool | None = None,
    last_exception: Exception | None = None,
    frontend_registered: bool | None = None,
) -> dict[str, Any]:
    """Build a diagnostics document that never includes the listen key."""

    secret = str(entry_data.get(CONF_LISTEN_KEY, "")).strip() or None
    playback = None
    if controller is not None:
        state = controller.state
        playback = {
            "state": state.logical_state,
            "owned": state.owned,
            "station_id": state.station.id if state.station else None,
            "speaker_entity_id": state.speaker_entity_id,
            "last_error": state.last_error_code,
        }
        if getattr(state, "stream_url", None):
            # Presence only. The URL itself is a secret.
            playback["has_stream_url"] = True
    return {
        "integration": {
            "domain": DOMAIN,
            "version": INTEGRATION_VERSION,
            "card_url": card_module_url(),
            "frontend_registered": frontend_registered,
        },
        "data": redact_mapping(dict(entry_data), secret),
        "options": redact_mapping(dict(entry_options), secret),
        "coordinator": {
            "last_update_success": last_update_success,
            "last_exception": redact_text(str(last_exception), secret) if last_exception else None,
        },
        "catalogue": {
            "network_count": len(catalogue.networks) if catalogue else 0,
            "station_count": len(catalogue.stations) if catalogue else 0,
            "networks": [
                {"key": network.key, "name": network.name, "active": network.active}
                for network in (catalogue.networks if catalogue else [])
            ],
        },
        "favourites": [
            {
                "id": view.id,
                "network": view.network,
                "key": view.key,
                "name": view.name,
                "available": view.available,
                "has_artwork": view.artwork_url is not None,
                "has_artwork_override": view.favourite.artwork_override is not None,
            }
            for view in (favourite_views or [])
        ],
        "playback": playback,
    }


async def async_get_config_entry_diagnostics(hass, entry) -> dict[str, Any]:
    """Return diagnostics that never include the listen key."""

    runtime = getattr(entry, "runtime_data", None)
    coordinator = getattr(runtime, "coordinator", runtime)
    controller = getattr(runtime, "controller", None)
    catalogue = coordinator.data if coordinator and getattr(coordinator, "data", None) else None
    favourite_views = coordinator.favourite_views if coordinator else []
    return build_diagnostics_payload(
        entry_data=dict(entry.data),
        entry_options=dict(entry.options),
        catalogue=catalogue,
        favourite_views=favourite_views,
        controller=controller,
        last_update_success=getattr(coordinator, "last_update_success", None),
        last_exception=getattr(coordinator, "last_exception", None),
        frontend_registered=bool(hass.data.get(f"{DOMAIN}_frontend")) if hass else None,
    )
