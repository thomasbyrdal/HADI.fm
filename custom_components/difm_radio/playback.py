"""HA-free playback controller for DI.FM Radio.

Resolves verified Icecast URLs and drives a SpeakerPort. Home Assistant is not
imported so unit tests can cover every playback path without a running instance.

Icecast is never probed from this process: a HEAD/GET would consume the single
stream allowed by the Terms of Use. The physical speaker is the only client.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.parse import urlsplit

from .const import (
    ATTR_AVAILABLE,
    ATTR_CHANNEL_KEY,
    ATTR_FAVOURITES,
    ATTR_NETWORK,
    ATTR_STATION_ID,
    PLAYBACK_CONFIRM_TIMEOUT,
    PLAYBACK_POLL_INTERVAL,
    STREAM_QUALITIES,
)
from .exceptions import (
    CannotConnectError,
    InvalidListenKeyError,
    InvalidResponseError,
    PlaybackError,
    SpeakerError,
    StationUnavailableError,
    UnknownStationError,
)
from .helpers import (
    match_station_from_stream,
    redact_url,
    stream_looks_ours,
    validate_media_player_entity,
)
from .models import Catalogue, FavouriteView, Station

STATE_IDLE = "idle"
STATE_PLAYING = "playing"
STATE_STOPPED = "stopped"
STATE_UNAVAILABLE = "unavailable"
STATE_BUFFERING = "buffering"

CONFIRM_STATES = frozenset({STATE_PLAYING, STATE_BUFFERING})
LOST_STATES = frozenset({"idle", "off", "standby", "paused"})
UNAVAILABLE_STATES = frozenset({STATE_UNAVAILABLE, "unknown"})
SPEAKER_SESSION_ATTRS = frozenset(
    {"media_content_id", "volume_level", "supported_features"}
)

_LOGGER = logging.getLogger(__name__)

_UNSUPPORTED_HINTS = ("unsupported", "format", "codec", "not supported", "media type")

_SPEAKER_MESSAGES = {
    "speaker_missing": "That speaker is not available in Home Assistant.",
    "speaker_incompatible": "The selected entity is not a media player.",
    "no_speaker": "No default speaker is configured.",
}


@dataclass(slots=True)
class SpeakerSnapshot:
    """Observed state of a physical Home Assistant media player."""

    exists: bool
    domain: str | None = None
    state: str | None = None
    volume_level: float | None = None
    is_volume_muted: bool | None = None
    supports_volume: bool = False
    supports_stop: bool = True
    supports_play_media: bool = True
    media_content_id: str | None = None


class SpeakerPort(Protocol):
    """Minimal speaker adapter used by the controller."""

    async def async_get(self, entity_id: str) -> SpeakerSnapshot: ...

    async def async_play_url(
        self, entity_id: str, url: str, title: str, image: str | None
    ) -> None: ...

    async def async_stop(self, entity_id: str) -> None: ...

    async def async_set_volume(self, entity_id: str, volume: float) -> None: ...

    async def async_sleep(self, seconds: float) -> None: ...


class StreamResolver(Protocol):
    """Subset of AudioAddictClient used for playback."""

    listen_key: str | None

    async def async_resolve_stream_urls(
        self,
        network: str,
        channel_key: str,
        quality: str,
        *,
        listen_key: str | None = None,
    ) -> list[str]: ...


@dataclass(slots=True)
class PlaybackState:
    """Logical radio session. ``stream_url`` must never be copied to HA state."""

    station: Station | None = None
    speaker_entity_id: str | None = None
    stream_url: str | None = None
    owned: bool = False
    confirmed: bool = False
    last_error: str | None = None
    last_error_code: str | None = None
    logical_state: str = STATE_IDLE


@dataclass(slots=True)
class DifmRadioRuntime:
    """Config-entry runtime: catalogue plus the playback controller."""

    coordinator: Any
    controller: RadioController
    entity: Any = None


def playback_attributes(
    state: PlaybackState, favourite_views: list[FavouriteView]
) -> dict[str, Any]:
    """HA-safe attributes. Stream URLs and listen keys are never included."""

    station = state.station
    return {
        ATTR_STATION_ID: station.id if station else None,
        ATTR_NETWORK: station.network if station else None,
        ATTR_CHANNEL_KEY: station.key if station else None,
        ATTR_AVAILABLE: bool(station) and not station.inferred_inactive,
        "integration": "difm_radio",
        "last_error": state.last_error_code,
        "speaker_entity_id": state.speaker_entity_id,
        "owned": state.owned,
        ATTR_FAVOURITES: [
            {
                "id": view.id,
                "name": view.name,
                "network": view.network,
                "key": view.key,
                "available": view.available,
                "artwork_url": view.artwork_url,
                "playing": bool(station and station.id == view.id and state.owned),
            }
            for view in favourite_views
        ],
    }


def rounded_volume(value: Any) -> float | None:
    """Round a speaker volume so position-tick float noise is ignored."""

    if value is None:
        return None
    try:
        return round(float(value), 3)
    except (TypeError, ValueError):
        return None


def speaker_event_affects_session(
    old_state: str | None,
    new_state: str | None,
    old_attributes: Mapping[str, Any] | None,
    new_attributes: Mapping[str, Any] | None,
) -> bool:
    """Return whether a speaker state-changed event can affect our session.

    Track-title and media_position updates are ignored. A speaker that
    disappears or becomes unavailable/unknown is treated as a blip: keep the
    current session until a real state (playing, idle, off, ...) returns.
    """

    if new_state is None or new_state in UNAVAILABLE_STATES:
        return False
    if old_state != new_state:
        return True
    old_attrs = old_attributes or {}
    new_attrs = new_attributes or {}
    for key in SPEAKER_SESSION_ATTRS:
        if key == "volume_level":
            if rounded_volume(old_attrs.get(key)) != rounded_volume(new_attrs.get(key)):
                return True
            continue
        if old_attrs.get(key) != new_attrs.get(key):
            return True
    return False


def favourite_browse_items(favourite_views: list[FavouriteView]) -> list[dict[str, Any]]:
    """Station rows for Home Assistant browse_media. No stream URLs."""

    return [
        {
            "title": view.name,
            "media_content_id": view.id,
            "can_play": view.available,
            "thumbnail": view.artwork_url,
        }
        for view in favourite_views
    ]


class RadioController:
    """Own at most one speaker session and keep logical state accurate."""

    def __init__(
        self,
        client: StreamResolver,
        speakers: SpeakerPort,
        *,
        confirm_timeout: float = PLAYBACK_CONFIRM_TIMEOUT,
        poll_interval: float = PLAYBACK_POLL_INTERVAL,
    ) -> None:
        self._client = client
        self._speakers = speakers
        self._confirm_timeout = confirm_timeout
        self._poll_interval = poll_interval
        self.state = PlaybackState()
        self._listeners: list[Callable[[], None]] = []

    def add_listener(self, callback: Callable[[], None]) -> Callable[[], None]:
        """Register a no-arg callback. Returns an unsubscribe function."""

        self._listeners.append(callback)

        def _remove() -> None:
            if callback in self._listeners:
                self._listeners.remove(callback)

        return _remove

    def _notify(self) -> None:
        for callback in list(self._listeners):
            callback()

    def _safe(self, err: Exception) -> str:
        text = str(err)
        key = self._client.listen_key
        if key:
            text = text.replace(key, "REDACTED")
        if "://" in text or "listen_key=" in text:
            return redact_url(text)
        return text

    def _set_error(self, code: str, message: str) -> None:
        self.state.last_error = message
        self.state.last_error_code = code

    async def async_play_station(
        self,
        catalogue: Catalogue | None,
        station_id: str,
        *,
        quality: str,
        default_speaker: str | None,
        speaker_entity_id: str | None = None,
    ) -> PlaybackState:
        """Resolve a station and play it on the chosen speaker."""

        if catalogue is None:
            raise PlaybackError("cannot_connect", "Station catalogue is not available")
        station = catalogue.stations.get(str(station_id).strip())
        if station is None:
            raise UnknownStationError(station_id)
        if station.inferred_inactive:
            raise StationUnavailableError(station_id)
        if quality not in STREAM_QUALITIES:
            raise PlaybackError("invalid_quality", "Choose one of the listed stream qualities.")

        speaker_id = (speaker_entity_id or default_speaker or "").strip()
        if not speaker_id:
            raise SpeakerError("no_speaker", _SPEAKER_MESSAGES["no_speaker"])

        snapshot = await self._speakers.async_get(speaker_id)
        speaker_error = validate_media_player_entity(snapshot.exists, snapshot.domain)
        if speaker_error:
            raise SpeakerError(speaker_error, _SPEAKER_MESSAGES[speaker_error])
        if not snapshot.supports_play_media:
            raise SpeakerError("speaker_incompatible", _SPEAKER_MESSAGES["speaker_incompatible"])

        if self.state.owned:
            await self._async_stop_owned()

        urls = await self._async_resolve(station, quality)
        last_error = PlaybackError("playback_failed", "Speaker could not start the stream")
        attempts = list(urls)
        refreshed = False
        index = 0
        while index < len(attempts):
            result = await self._try_play(speaker_id, station, attempts[index])
            if result == "ok":
                return self.state
            if result == "unsupported":
                last_error = PlaybackError(
                    "unsupported_format", "The speaker rejected the stream format."
                )
            else:
                last_error = PlaybackError("playback_failed", "Speaker could not start the stream")
            index += 1
            if index >= len(attempts) and not refreshed:
                refreshed = True
                try:
                    attempts = await self._async_resolve(station, quality)
                except PlaybackError:
                    break
                index = 0

        await self._async_stop_owned()
        self._set_error(last_error.code, str(last_error))
        self.state.logical_state = STATE_IDLE
        self._notify()
        raise last_error

    async def async_stop(self) -> PlaybackState:
        """Stop the physical speaker only when this integration owns the session."""

        if not self.state.owned:
            return self.state
        await self._async_stop_owned()
        self.state.logical_state = STATE_STOPPED
        self._notify()
        return self.state

    async def async_set_volume(self, volume: float) -> None:
        """Forward volume to the current speaker when it supports VOLUME_SET."""

        speaker_id = self.state.speaker_entity_id
        if not speaker_id:
            return
        snapshot = await self._speakers.async_get(speaker_id)
        if not snapshot.exists or not snapshot.supports_volume:
            return
        await self._speakers.async_set_volume(speaker_id, max(0.0, min(1.0, float(volume))))

    def _session_key(self) -> tuple[Any, ...]:
        station = self.state.station
        return (
            self.state.logical_state,
            self.state.owned,
            self.state.confirmed,
            self.state.speaker_entity_id,
            station.id if station else None,
            self.state.last_error_code,
        )

    async def async_sync_from_speaker(self) -> PlaybackState:
        """Mirror the physical speaker without taking or releasing a session blindly.

        A speaker that is missing or ``unavailable``/``unknown`` is a blip: keep
        the current session so the logical player stays available and playback
        can resume when the speaker returns. Notify listeners only when
        ownership or logical state actually changes.
        """

        speaker_id = self.state.speaker_entity_id
        if not speaker_id:
            return self.state
        snapshot = await self._speakers.async_get(speaker_id)
        if not snapshot.exists or snapshot.state in UNAVAILABLE_STATES:
            return self.state
        if not self.state.owned:
            return self.state
        before = self._session_key()
        if snapshot.media_content_id and not self.owns_media(snapshot.media_content_id):
            self._release_session(STATE_IDLE)
        elif snapshot.state in CONFIRM_STATES:
            self.state.confirmed = True
            self.state.logical_state = (
                STATE_PLAYING if snapshot.state == STATE_PLAYING else STATE_BUFFERING
            )
        elif snapshot.state in LOST_STATES:
            self._release_session(STATE_IDLE)
        if self._session_key() != before:
            self._notify()
        return self.state

    async def async_adopt_playing_speaker(
        self,
        catalogue: Catalogue | None,
        speaker_entity_ids: list[str],
        *,
        listen_key: str | None,
        hint_station_id: str | None = None,
    ) -> PlaybackState:
        """Re-attach a session if a speaker is still playing our stream.

        Used after a Home Assistant restart. The physical speaker keeps the
        Icecast connection; this process only restores logical state.
        """

        if self.state.owned or catalogue is None:
            return self.state
        seen: set[str] = set()
        for raw_id in speaker_entity_ids:
            speaker_id = str(raw_id or "").strip()
            if not speaker_id or speaker_id in seen:
                continue
            seen.add(speaker_id)
            snapshot = await self._speakers.async_get(speaker_id)
            if not snapshot.exists or snapshot.state not in CONFIRM_STATES:
                continue
            url = snapshot.media_content_id
            if not url or not stream_looks_ours(url, listen_key):
                continue
            station = match_station_from_stream(
                catalogue, url, hint_station_id=hint_station_id
            )
            if station is None:
                continue
            self.state.station = station
            self.state.speaker_entity_id = speaker_id
            self.state.stream_url = url
            self.state.owned = True
            self.state.confirmed = True
            self.state.logical_state = (
                STATE_PLAYING if snapshot.state == STATE_PLAYING else STATE_BUFFERING
            )
            self.state.last_error = None
            self.state.last_error_code = None
            self._notify()
            return self.state
        return self.state

    async def async_speaker_snapshot(self, entity_id: str) -> SpeakerSnapshot:
        """Return the current speaker snapshot."""

        return await self._speakers.async_get(entity_id)

    def owns_media(self, media_content_id: str | None) -> bool:
        """Return whether a speaker media_content_id is the stream we started."""

        if not self.state.owned or not media_content_id or not self.state.stream_url:
            return False
        if media_content_id == self.state.stream_url:
            return True
        ours = urlsplit(self.state.stream_url)
        theirs = urlsplit(media_content_id)
        return bool(ours.netloc and ours.netloc == theirs.netloc and ours.path == theirs.path)

    async def _async_resolve(self, station: Station, quality: str) -> list[str]:
        try:
            urls = await self._client.async_resolve_stream_urls(
                station.network, station.key, quality
            )
        except InvalidListenKeyError as err:
            self._set_error("invalid_auth", "Listen key rejected")
            raise PlaybackError("invalid_auth", "Listen key rejected") from err
        except (CannotConnectError, InvalidResponseError) as err:
            self._set_error("cannot_connect", "Could not resolve a stream URL")
            raise PlaybackError("cannot_connect", "Could not resolve a stream URL") from err
        if not urls:
            raise PlaybackError("cannot_connect", "Could not resolve a stream URL")
        return urls

    async def _try_play(self, speaker_id: str, station: Station, url: str) -> str:
        try:
            await self._speakers.async_play_url(
                speaker_id, url, station.name, station.artwork_url
            )
        except Exception as err:
            _LOGGER.warning("Speaker %s rejected play_media: %s", speaker_id, self._safe(err))
            return "unsupported" if _is_unsupported(err) else "failed"

        self.state.station = station
        self.state.speaker_entity_id = speaker_id
        self.state.stream_url = url
        self.state.owned = True
        self.state.confirmed = False
        self.state.logical_state = STATE_BUFFERING
        self.state.last_error = None
        self.state.last_error_code = None
        self._notify()

        if await self._async_confirm(speaker_id):
            self.state.confirmed = True
            self.state.logical_state = STATE_PLAYING
            self._notify()
            return "ok"

        await self._async_stop_owned(keep_context=True)
        return "failed"

    async def _async_confirm(self, speaker_id: str) -> bool:
        elapsed = 0.0
        while True:
            snapshot = await self._speakers.async_get(speaker_id)
            if snapshot.state in CONFIRM_STATES:
                return True
            if elapsed >= self._confirm_timeout:
                return False
            wait = min(self._poll_interval, self._confirm_timeout - elapsed)
            if wait <= 0:
                return False
            await self._speakers.async_sleep(wait)
            elapsed += wait

    async def _async_stop_owned(self, *, keep_context: bool = False) -> None:
        speaker_id = self.state.speaker_entity_id
        if self.state.owned and speaker_id:
            snapshot = await self._speakers.async_get(speaker_id)
            if snapshot.exists:
                try:
                    await self._speakers.async_stop(speaker_id)
                except Exception as err:
                    _LOGGER.debug("Stop failed on %s: %s", speaker_id, self._safe(err))
        self._release_session(STATE_IDLE if not keep_context else self.state.logical_state)
        if not keep_context:
            self.state.station = None
            self.state.speaker_entity_id = None

    def _release_session(self, logical_state: str) -> None:
        self.state.owned = False
        self.state.confirmed = False
        self.state.stream_url = None
        self.state.logical_state = logical_state


def _is_unsupported(err: Exception) -> bool:
    text = str(err).lower()
    return any(hint in text for hint in _UNSUPPORTED_HINTS)
