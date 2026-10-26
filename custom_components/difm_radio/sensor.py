"""Cold-path favourites sensor for DI.FM Radio.

Favourite artwork lists are large. Keeping them on this sensor means the
logical media player can update session/volume state without rewriting the
full favourite payload on every speaker tick.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import ATTR_FAVOURITES, DOMAIN
from .coordinator import DifmRadioCoordinator
from .playback import DifmRadioRuntime, favourite_attribute_rows


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the favourites sensor."""

    runtime: DifmRadioRuntime = entry.runtime_data
    entity = DifmFavouritesSensor(entry, runtime)
    runtime.favourites_entity = entity
    async_add_entities([entity])


class DifmFavouritesSensor(CoordinatorEntity[DifmRadioCoordinator], SensorEntity):
    """Expose favourite stations for the Lovelace card."""

    _attr_has_entity_name = True
    _attr_name = "Favourites"
    _attr_translation_key = "favourites"
    _attr_icon = "mdi:heart"
    _unrecorded_attributes = frozenset({ATTR_FAVOURITES})

    def __init__(self, entry: ConfigEntry, runtime: DifmRadioRuntime) -> None:
        super().__init__(runtime.coordinator)
        self._entry = entry
        self._runtime = runtime
        self._attr_unique_id = f"{entry.entry_id}_favourites"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name="DI.FM Radio",
            manufacturer="Digitally Imported",
            model="AudioAddict",
        )

    @property
    def native_value(self) -> int:
        return len(self.coordinator.favourites)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        radio_id = None
        if self._runtime.entity is not None and getattr(
            self._runtime.entity, "entity_id", None
        ):
            radio_id = self._runtime.entity.entity_id
        return {
            "integration": DOMAIN,
            "radio_entity_id": radio_id,
            ATTR_FAVOURITES: favourite_attribute_rows(self.coordinator.favourite_views),
        }

    @callback
    def async_on_options_update(self) -> None:
        """Refresh after favourites options change without a catalogue fetch."""

        self.async_write_ha_state()
