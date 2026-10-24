"""Logical DI.FM Radio media player that controls a physical speaker."""

from __future__ import annotations

import asyncio
from typing import Any

from homeassistant.components.media_player import (
    MediaPlayerEntity,
    MediaPlayerEntityFeature,
    MediaPlayerState,
    MediaType,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import ATTR_SUPPORTED_FEATURES
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event

from .const import (
    CONF_DEFAULT_MEDIA_PLAYER,
    CONF_STREAM_QUALITY,
    DEFAULT_STREAM_QUALITY,
    DOMAIN,
)
from .exceptions import PlaybackError
from .playback import (
    STATE_BUFFERING,
    STATE_PLAYING,
    STATE_UNAVAILABLE,
    DifmRadioRuntime,
    RadioController,
    SpeakerSnapshot,
    playback_attributes,
)

_STATE_MAP = {
    STATE_PLAYING: MediaPlayerState.PLAYING,
    STATE_BUFFERING: MediaPlayerState.BUFFERING,
}


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the logical media player."""

    runtime: DifmRadioRuntime = entry.runtime_data
    entity = DifmRadioMediaPlayer(entry, runtime)
    runtime.entity = entity
    async_add_entities([entity])


class HomeAssistantSpeakerPort:
    """SpeakerPort backed by Home Assistant media_player services."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def async_get(self, entity_id: str) -> SpeakerSnapshot:
        state = self._hass.states.get(entity_id)
        if state is None:
            return SpeakerSnapshot(exists=False)
        features = int(state.attributes.get(ATTR_SUPPORTED_FEATURES, 0) or 0)
        return SpeakerSnapshot(
            exists=True,
            domain=state.domain,
            state=state.state,
            volume_level=_optional_float(state.attributes.get("volume_level")),
            is_volume_muted=state.attributes.get("is_volume_muted"),
            supports_volume=bool(features & MediaPlayerEntityFeature.VOLUME_SET),
            supports_stop=True,
            supports_play_media=True,
            media_content_id=state.attributes.get("media_content_id"),
        )

    async def async_play_url(
        self, entity_id: str, url: str, title: str, image: str | None
    ) -> None:
        extra: dict[str, Any] = {"title": title}
        if image:
            extra["thumb"] = image
        await self._hass.services.async_call(
            "media_player",
            "play_media",
            {
                "entity_id": entity_id,
                "media_content_id": url,
                "media_content_type": MediaType.MUSIC,
                "extra": extra,
            },
            blocking=True,
        )

    async def async_stop(self, entity_id: str) -> None:
        await self._hass.services.async_call(
            "media_player",
            "media_stop",
            {"entity_id": entity_id},
            blocking=True,
        )

    async def async_set_volume(self, entity_id: str, volume: float) -> None:
        await self._hass.services.async_call(
            "media_player",
            "volume_set",
            {"entity_id": entity_id, "volume_level": volume},
            blocking=True,
        )

    async def async_sleep(self, seconds: float) -> None:
        await asyncio.sleep(seconds)


class DifmRadioMediaPlayer(MediaPlayerEntity):
    """Logical player that forwards playback to the configured speaker."""

    _attr_has_entity_name = True
    _attr_name = None
    _attr_media_content_type = MediaType.MUSIC
    _attr_should_poll = False
    _attr_translation_key = "radio"

    def __init__(self, entry: ConfigEntry, runtime: DifmRadioRuntime) -> None:
        self._entry = entry
        self._runtime = runtime
        self._unsub_speaker = None
        self._speaker_volume: float | None = None
        self._speaker_supports_volume = False
        self._attr_unique_id = entry.entry_id
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name="DI.FM Radio",
            manufacturer="Digitally Imported",
            model="AudioAddict",
        )

    @property
    def controller(self) -> RadioController:
        return self._runtime.controller

    @property
    def available(self) -> bool:
        return self.controller.state.logical_state != STATE_UNAVAILABLE

    @property
    def state(self) -> MediaPlayerState:
        return _STATE_MAP.get(self.controller.state.logical_state, MediaPlayerState.IDLE)

    @property
    def media_content_id(self) -> str | None:
        station = self.controller.state.station
        return station.id if station else None

    @property
    def media_title(self) -> str | None:
        station = self.controller.state.station
        return station.name if station else None

    @property
    def media_artist(self) -> str | None:
        station = self.controller.state.station
        catalogue = self._runtime.coordinator.data
        if station is None or catalogue is None:
            return None
        return catalogue.network_name(station.network)

    @property
    def media_image_url(self) -> str | None:
        station = self.controller.state.station
        if station is None:
            return None
        for view in self._runtime.coordinator.favourite_views:
            if view.id == station.id and view.artwork_url:
                return view.artwork_url
        return station.artwork_url

    @property
    def volume_level(self) -> float | None:
        return self._speaker_volume

    @property
    def supported_features(self) -> MediaPlayerEntityFeature:
        features = MediaPlayerEntityFeature.PLAY_MEDIA | MediaPlayerEntityFeature.STOP
        if self.controller.state.station:
            features |= MediaPlayerEntityFeature.PLAY
        if self._speaker_supports_volume:
            features |= MediaPlayerEntityFeature.VOLUME_SET
        return features

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return playback_attributes(
            self.controller.state, self._runtime.coordinator.favourite_views
        )

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self.controller.add_listener(self._handle_controller))
        self.async_on_remove(self._runtime.coordinator.async_add_listener(self._handle_controller))
        self.async_on_remove(self._unwatch_speaker)
        self.async_watch_speaker()
        await self._async_refresh_speaker_capabilities()

    @callback
    def _handle_controller(self) -> None:
        self.async_write_ha_state()

    def async_on_options_update(self) -> None:
        """Re-watch the default speaker after options change without reloading."""

        self.async_watch_speaker()
        self.async_write_ha_state()

    def async_watch_speaker(self) -> None:
        """Subscribe to the speaker that currently owns, or the default speaker."""

        self._unwatch_speaker()
        entity_id = self.controller.state.speaker_entity_id or self._default_speaker()
        if not entity_id:
            return
        self._unsub_speaker = async_track_state_change_event(
            self.hass, [entity_id], self._async_speaker_event
        )

    def _unwatch_speaker(self) -> None:
        if self._unsub_speaker is not None:
            self._unsub_speaker()
            self._unsub_speaker = None

    def _default_speaker(self) -> str | None:
        value = self._entry.options.get(CONF_DEFAULT_MEDIA_PLAYER)
        return str(value) if value else None

    def _quality(self) -> str:
        return str(self._entry.options.get(CONF_STREAM_QUALITY, DEFAULT_STREAM_QUALITY))

    async def _async_speaker_event(self, _event: Any) -> None:
        await self.controller.async_sync_from_speaker()
        await self._async_refresh_speaker_capabilities()
        self.async_write_ha_state()

    async def _async_refresh_speaker_capabilities(self) -> None:
        entity_id = self.controller.state.speaker_entity_id or self._default_speaker()
        if not entity_id:
            self._speaker_volume = None
            self._speaker_supports_volume = False
            return
        snapshot = await self.controller.async_speaker_snapshot(entity_id)
        self._speaker_volume = snapshot.volume_level
        self._speaker_supports_volume = snapshot.supports_volume

    async def async_play_media(
        self, media_type: str, media_id: str, **kwargs: Any
    ) -> None:
        await self._async_play(str(media_id))

    async def async_media_play(self) -> None:
        station = self.controller.state.station
        if station is None:
            raise HomeAssistantError("No station is selected")
        await self._async_play(station.id)

    async def async_media_stop(self) -> None:
        await self.controller.async_stop()
        self.async_write_ha_state()

    async def async_set_volume_level(self, volume: float) -> None:
        await self.controller.async_set_volume(volume)
        self._speaker_volume = max(0.0, min(1.0, float(volume)))
        self.async_write_ha_state()

    async def _async_play(self, station_id: str) -> None:
        try:
            await self.controller.async_play_station(
                self._runtime.coordinator.data,
                station_id,
                quality=self._quality(),
                default_speaker=self._default_speaker(),
            )
        except PlaybackError as err:
            raise HomeAssistantError(str(err)) from err
        self.async_watch_speaker()
        await self._async_refresh_speaker_capabilities()
        self.async_write_ha_state()


def _optional_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


__all__ = ["DifmRadioMediaPlayer", "HomeAssistantSpeakerPort"]
