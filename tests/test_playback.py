"""Tests for every RadioController playback path."""

from __future__ import annotations

from urllib.parse import urlsplit

import pytest

from custom_components.difm_radio.exceptions import (
    CannotConnectError,
    InvalidListenKeyError,
    PlaybackError,
    SpeakerError,
    StationUnavailableError,
    UnknownStationError,
)
from custom_components.difm_radio.helpers import favourite_views
from custom_components.difm_radio.models import Catalogue, Favourite, Network, Station
from custom_components.difm_radio.playback import (
    STATE_IDLE,
    STATE_PLAYING,
    STATE_STOPPED,
    RadioController,
    SpeakerSnapshot,
    favourite_browse_items,
    playback_attributes,
    speaker_event_affects_session,
)

LISTEN_KEY = "test-listen-key"
SPEAKER = "media_player.living_room"
MIRRORS = [
    f"http://prem2.di.fm:80/trance_hi?{LISTEN_KEY}",
    f"http://prem1.di.fm:80/trance_hi?{LISTEN_KEY}",
    f"http://prem4.di.fm:80/trance_hi?{LISTEN_KEY}",
]


def _station(
    station_id: str = "1",
    network: str = "di",
    key: str = "trance",
    name: str = "Trance",
    *,
    inferred_inactive: bool = False,
    artwork_url: str | None = "https://cdn-images.audioaddict.com/trance.png",
) -> Station:
    return Station(
        id=station_id,
        key=key,
        name=name,
        network=network,
        network_id=1,
        description_short=None,
        description_long=None,
        artwork_url=artwork_url,
        inferred_inactive=inferred_inactive,
    )


def _catalogue(*stations: Station) -> Catalogue:
    items = stations or (_station(),)
    return Catalogue(
        networks=[
            Network(id=1, key="di", name="DI.FM", site_url=None, listen_url=None, active=True)
        ],
        stations={station.id: station for station in items},
    )


class FakeClient:
    def __init__(self, urls: list[str] | None = None) -> None:
        self.listen_key = LISTEN_KEY
        self.urls = list(urls or MIRRORS)
        self.calls: list[tuple[str, str, str]] = []
        self.error: Exception | None = None
        self.refresh_urls: list[str] | None = None

    async def async_resolve_stream_urls(
        self,
        network: str,
        channel_key: str,
        quality: str,
        *,
        listen_key: str | None = None,
    ) -> list[str]:
        self.calls.append((network, channel_key, quality))
        if self.error is not None:
            raise self.error
        if self.refresh_urls is not None and len(self.calls) > 1:
            return list(self.refresh_urls)
        return list(self.urls)


class FakeSpeaker:
    def __init__(self) -> None:
        self.entities: dict[str, SpeakerSnapshot] = {}
        self.play_calls: list[tuple[str, str, str, str | None]] = []
        self.stop_calls: list[str] = []
        self.volume_calls: list[tuple[str, float]] = []
        self.confirm_hosts: set[str] | None = None
        self.fail_play_hosts: set[str] = set()
        self.fail_play_message = "play failed"
        self.sleeps = 0

    def add_player(
        self,
        entity_id: str = SPEAKER,
        *,
        domain: str = "media_player",
        state: str = "idle",
        supports_volume: bool = True,
        supports_play_media: bool = True,
        volume_level: float = 0.4,
    ) -> SpeakerSnapshot:
        snapshot = SpeakerSnapshot(
            exists=True,
            domain=domain,
            state=state,
            volume_level=volume_level,
            supports_volume=supports_volume,
            supports_stop=True,
            supports_play_media=supports_play_media,
        )
        self.entities[entity_id] = snapshot
        return snapshot

    async def async_get(self, entity_id: str) -> SpeakerSnapshot:
        return self.entities.get(entity_id, SpeakerSnapshot(exists=False))

    async def async_play_url(
        self, entity_id: str, url: str, title: str, image: str | None
    ) -> None:
        self.play_calls.append((entity_id, url, title, image))
        host = urlsplit(url).netloc
        if host in self.fail_play_hosts:
            raise RuntimeError(self.fail_play_message)
        snapshot = self.entities[entity_id]
        snapshot.media_content_id = url
        if self.confirm_hosts is None or host in self.confirm_hosts:
            snapshot.state = "playing"
        else:
            snapshot.state = "idle"

    async def async_stop(self, entity_id: str) -> None:
        self.stop_calls.append(entity_id)
        snapshot = self.entities.get(entity_id)
        if snapshot is not None:
            snapshot.state = "idle"
            snapshot.media_content_id = None

    async def async_set_volume(self, entity_id: str, volume: float) -> None:
        self.volume_calls.append((entity_id, volume))
        snapshot = self.entities.get(entity_id)
        if snapshot is not None:
            snapshot.volume_level = volume

    async def async_sleep(self, seconds: float) -> None:
        self.sleeps += 1


def _controller(
    client: FakeClient | None = None,
    speaker: FakeSpeaker | None = None,
    *,
    confirm_timeout: float = 0,
) -> tuple[RadioController, FakeClient, FakeSpeaker]:
    fake_client = client or FakeClient()
    fake_speaker = speaker or FakeSpeaker()
    if SPEAKER not in fake_speaker.entities:
        fake_speaker.add_player()
    controller = RadioController(
        fake_client,
        fake_speaker,
        confirm_timeout=confirm_timeout,
        poll_interval=0.1,
    )
    return controller, fake_client, fake_speaker


async def test_play_station_sends_bare_key_url_and_confirms() -> None:
    controller, client, speaker = _controller()
    state = await controller.async_play_station(
        _catalogue(), "1", quality="premium_high", default_speaker=SPEAKER
    )
    assert state.logical_state == STATE_PLAYING
    assert state.owned is True
    assert state.confirmed is True
    assert state.station is not None
    assert state.station.id == "1"
    assert client.calls == [("di", "trance", "premium_high")]
    entity_id, url, title, image = speaker.play_calls[0]
    assert entity_id == SPEAKER
    assert url == MIRRORS[0]
    assert "listen_key=" not in url
    assert urlsplit(url).query == LISTEN_KEY
    assert title == "Trance"
    assert image and image.startswith("https://cdn-images.audioaddict.com/")


async def test_station_switch_stops_owned_session_first() -> None:
    catalogue = _catalogue(_station(), _station("12", key="ambient", name="Ambient"))
    client = FakeClient()
    client.urls = [f"http://prem2.di.fm:80/ambient?{LISTEN_KEY}"]
    controller, _client, speaker = _controller(client)
    await controller.async_play_station(
        catalogue, "1", quality="premium_high", default_speaker=SPEAKER
    )
    client.urls = [f"http://prem1.di.fm:80/ambient?{LISTEN_KEY}"]
    await controller.async_play_station(
        catalogue, "12", quality="premium_high", default_speaker=SPEAKER
    )
    assert speaker.stop_calls == [SPEAKER]
    assert controller.state.station is not None
    assert controller.state.station.id == "12"
    assert controller.state.logical_state == STATE_PLAYING


async def test_stop_only_when_owned() -> None:
    controller, _client, speaker = _controller()
    await controller.async_stop()
    assert speaker.stop_calls == []
    await controller.async_play_station(
        _catalogue(), "1", quality="premium_high", default_speaker=SPEAKER
    )
    await controller.async_stop()
    assert speaker.stop_calls == [SPEAKER]
    assert controller.state.owned is False
    assert controller.state.logical_state == STATE_STOPPED
    speaker.stop_calls.clear()
    await controller.async_stop()
    assert speaker.stop_calls == []


async def test_volume_forwards_only_when_supported() -> None:
    speaker = FakeSpeaker()
    speaker.add_player(supports_volume=True)
    controller, _client, _speaker = _controller(speaker=speaker)
    await controller.async_play_station(
        _catalogue(), "1", quality="premium_high", default_speaker=SPEAKER
    )
    await controller.async_set_volume(0.8)
    assert speaker.volume_calls == [(SPEAKER, 0.8)]

    speaker.entities[SPEAKER].supports_volume = False
    speaker.volume_calls.clear()
    await controller.async_set_volume(0.2)
    assert speaker.volume_calls == []


async def test_mirror_failover_then_url_refresh() -> None:
    client = FakeClient(urls=[MIRRORS[0]])
    client.refresh_urls = [MIRRORS[1]]
    speaker = FakeSpeaker()
    speaker.add_player()
    speaker.confirm_hosts = {"prem1.di.fm:80"}
    controller, _client, _speaker = _controller(client, speaker)
    state = await controller.async_play_station(
        _catalogue(), "1", quality="premium_high", default_speaker=SPEAKER
    )
    assert state.logical_state == STATE_PLAYING
    assert len(client.calls) == 2
    assert [urlsplit(call[1]).netloc for call in speaker.play_calls] == [
        "prem2.di.fm:80",
        "prem1.di.fm:80",
    ]
    assert speaker.stop_calls == [SPEAKER]


async def test_unsupported_format_is_reported() -> None:
    speaker = FakeSpeaker()
    speaker.add_player()
    speaker.fail_play_hosts = {"prem2.di.fm:80", "prem1.di.fm:80", "prem4.di.fm:80"}
    speaker.fail_play_message = "Unsupported format: audio/mpeg"
    controller, _client, _speaker = _controller(speaker=speaker)
    with pytest.raises(PlaybackError, match="rejected the stream format") as err:
        await controller.async_play_station(
            _catalogue(), "1", quality="premium_high", default_speaker=SPEAKER
        )
    assert err.value.code == "unsupported_format"
    assert controller.state.owned is False


async def test_confirmation_timeout_fails_after_mirrors() -> None:
    speaker = FakeSpeaker()
    speaker.add_player()
    speaker.confirm_hosts = set()
    controller, client, _speaker = _controller(speaker=speaker, confirm_timeout=0)
    with pytest.raises(PlaybackError) as err:
        await controller.async_play_station(
            _catalogue(), "1", quality="premium_high", default_speaker=SPEAKER
        )
    assert err.value.code == "playback_failed"
    assert len(client.calls) == 2
    assert controller.state.logical_state == STATE_IDLE


async def test_unknown_and_inactive_stations() -> None:
    controller, _client, _speaker = _controller()
    catalogue = _catalogue(_station("999", inferred_inactive=True, name="XChiptunes"))
    with pytest.raises(UnknownStationError):
        await controller.async_play_station(
            catalogue, "missing", quality="premium_high", default_speaker=SPEAKER
        )
    with pytest.raises(StationUnavailableError):
        await controller.async_play_station(
            catalogue, "999", quality="premium_high", default_speaker=SPEAKER
        )


async def test_missing_and_incompatible_speaker() -> None:
    controller, _client, _speaker = _controller()
    with pytest.raises(SpeakerError) as missing:
        await controller.async_play_station(
            _catalogue(), "1", quality="premium_high", default_speaker="media_player.gone"
        )
    assert missing.value.code == "speaker_missing"

    speaker = FakeSpeaker()
    speaker.add_player(domain="light")
    controller, _client, _speaker = _controller(speaker=speaker)
    with pytest.raises(SpeakerError) as incompatible:
        await controller.async_play_station(
            _catalogue(), "1", quality="premium_high", default_speaker=SPEAKER
        )
    assert incompatible.value.code == "speaker_incompatible"

    controller, _client, _speaker = _controller()
    with pytest.raises(SpeakerError) as none:
        await controller.async_play_station(
            _catalogue(), "1", quality="premium_high", default_speaker=None
        )
    assert none.value.code == "no_speaker"


async def test_invalid_auth_and_cannot_connect() -> None:
    client = FakeClient()
    client.error = InvalidListenKeyError("Invalid Listen Key")
    controller, _client, _speaker = _controller(client)
    with pytest.raises(PlaybackError) as auth:
        await controller.async_play_station(
            _catalogue(), "1", quality="premium_high", default_speaker=SPEAKER
        )
    assert auth.value.code == "invalid_auth"
    assert LISTEN_KEY not in str(auth.value)

    client.error = CannotConnectError("timeout")
    with pytest.raises(PlaybackError) as connect:
        await controller.async_play_station(
            _catalogue(), "1", quality="premium_high", default_speaker=SPEAKER
        )
    assert connect.value.code == "cannot_connect"


async def test_sync_loses_ownership_when_speaker_goes_idle() -> None:
    controller, _client, speaker = _controller()
    await controller.async_play_station(
        _catalogue(), "1", quality="premium_high", default_speaker=SPEAKER
    )
    speaker.entities[SPEAKER].state = "idle"
    await controller.async_sync_from_speaker()
    assert controller.state.owned is False
    assert controller.state.logical_state == STATE_IDLE
    speaker.stop_calls.clear()
    await controller.async_stop()
    assert speaker.stop_calls == []


async def test_sync_ignores_unavailable_blip_and_releases_foreign_media() -> None:
    controller, _client, speaker = _controller()
    notes: list[int] = []
    controller.add_listener(lambda: notes.append(1))
    await controller.async_play_station(
        _catalogue(), "1", quality="premium_high", default_speaker=SPEAKER
    )
    notes.clear()
    speaker.entities[SPEAKER].state = "unavailable"
    await controller.async_sync_from_speaker()
    assert controller.state.owned is True
    assert controller.state.logical_state == STATE_PLAYING
    assert notes == []

    speaker.entities[SPEAKER].state = "playing"
    await controller.async_sync_from_speaker()
    assert controller.state.owned is True
    assert controller.state.logical_state == STATE_PLAYING
    assert notes == []

    speaker.entities[SPEAKER].media_content_id = "http://other.example/track"
    await controller.async_sync_from_speaker()
    assert controller.state.owned is False
    assert controller.state.logical_state == STATE_IDLE
    assert notes == [1]


async def test_sync_does_not_notify_when_still_playing() -> None:
    controller, _client, speaker = _controller()
    notes: list[int] = []
    controller.add_listener(lambda: notes.append(1))
    await controller.async_play_station(
        _catalogue(), "1", quality="premium_high", default_speaker=SPEAKER
    )
    notes.clear()
    speaker.entities[SPEAKER].state = "playing"
    await controller.async_sync_from_speaker()
    assert controller.state.logical_state == STATE_PLAYING
    assert notes == []


async def test_sync_releases_when_speaker_returns_idle_after_blip() -> None:
    controller, _client, speaker = _controller()
    await controller.async_play_station(
        _catalogue(), "1", quality="premium_high", default_speaker=SPEAKER
    )
    speaker.entities[SPEAKER].state = "unknown"
    await controller.async_sync_from_speaker()
    assert controller.state.owned is True
    assert controller.state.logical_state == STATE_PLAYING
    speaker.entities[SPEAKER].state = "idle"
    await controller.async_sync_from_speaker()
    assert controller.state.owned is False
    assert controller.state.logical_state == STATE_IDLE


def test_speaker_event_ignores_metadata_and_blips() -> None:
    playing_attrs = {
        "media_content_id": MIRRORS[0],
        "volume_level": 0.4,
        "supported_features": 1,
        "media_title": "Track A",
        "media_position": 12,
        "media_position_updated_at": "2026-10-25T18:00:00+00:00",
    }
    title_tick = {
        **playing_attrs,
        "media_title": "Track B",
        "media_position": 13,
        "media_position_updated_at": "2026-10-25T18:00:01+00:00",
    }
    assert (
        speaker_event_affects_session("playing", "playing", playing_attrs, title_tick)
        is False
    )
    assert speaker_event_affects_session("playing", "unavailable", playing_attrs, {}) is False
    assert speaker_event_affects_session("playing", "unknown", playing_attrs, {}) is False
    assert speaker_event_affects_session("playing", None, playing_attrs, None) is False
    assert speaker_event_affects_session("unavailable", "playing", {}, playing_attrs) is True
    assert speaker_event_affects_session("playing", "idle", playing_attrs, playing_attrs) is True
    noisy_volume = {**playing_attrs, "volume_level": 0.4004}
    assert (
        speaker_event_affects_session("playing", "playing", playing_attrs, noisy_volume)
        is False
    )
    real_volume = {**playing_attrs, "volume_level": 0.55}
    assert (
        speaker_event_affects_session("playing", "playing", playing_attrs, real_volume)
        is True
    )
    foreign = {**playing_attrs, "media_content_id": "http://other.example/track"}
    assert speaker_event_affects_session("playing", "playing", playing_attrs, foreign) is True


async def test_speaker_override_and_invalid_quality() -> None:
    speaker = FakeSpeaker()
    speaker.add_player()
    speaker.add_player("media_player.kitchen")
    controller, _client, _speaker = _controller(speaker=speaker)
    await controller.async_play_station(
        _catalogue(),
        "1",
        quality="premium_high",
        default_speaker=SPEAKER,
        speaker_entity_id="media_player.kitchen",
    )
    assert speaker.play_calls[0][0] == "media_player.kitchen"
    with pytest.raises(PlaybackError) as err:
        await controller.async_play_station(
            _catalogue(), "1", quality="public3", default_speaker=SPEAKER
        )
    assert err.value.code == "invalid_quality"
    with pytest.raises(PlaybackError) as missing:
        await controller.async_play_station(
            None, "1", quality="premium_high", default_speaker=SPEAKER
        )
    assert missing.value.code == "cannot_connect"


async def test_adopt_playing_speaker_after_restart() -> None:
    speaker = FakeSpeaker()
    speaker.add_player(state="playing")
    speaker.entities[SPEAKER].media_content_id = MIRRORS[0]
    controller, _client, _speaker = _controller(speaker=speaker)
    notes: list[int] = []
    controller.add_listener(lambda: notes.append(1))
    state = await controller.async_adopt_playing_speaker(
        _catalogue(),
        [SPEAKER],
        listen_key=LISTEN_KEY,
        hint_station_id="1",
    )
    assert state.owned is True
    assert state.confirmed is True
    assert state.logical_state == STATE_PLAYING
    assert state.station is not None
    assert state.station.id == "1"
    assert state.speaker_entity_id == SPEAKER
    assert state.stream_url == MIRRORS[0]
    assert notes == [1]
    notes.clear()
    again = await controller.async_adopt_playing_speaker(
        _catalogue(), [SPEAKER], listen_key=LISTEN_KEY
    )
    assert again.owned is True
    assert notes == []


async def test_adopt_matches_stripped_query_and_skips_foreign() -> None:
    speaker = FakeSpeaker()
    speaker.add_player(state="playing")
    speaker.entities[SPEAKER].media_content_id = "http://prem2.di.fm:80/trance_hi"
    controller, _client, _speaker = _controller(speaker=speaker)
    state = await controller.async_adopt_playing_speaker(
        _catalogue(), [SPEAKER], listen_key=LISTEN_KEY
    )
    assert state.logical_state == STATE_PLAYING
    assert state.owned is True

    speaker.entities[SPEAKER].media_content_id = "http://other.example/track"
    controller, _client, _speaker = _controller(speaker=speaker)
    skipped = await controller.async_adopt_playing_speaker(
        _catalogue(), [SPEAKER], listen_key=LISTEN_KEY, hint_station_id="1"
    )
    assert skipped.owned is False
    assert skipped.logical_state == STATE_IDLE


async def test_adopt_ignores_idle_and_missing_catalogue() -> None:
    controller, _client, speaker = _controller()
    speaker.entities[SPEAKER].state = "idle"
    speaker.entities[SPEAKER].media_content_id = MIRRORS[0]
    idle = await controller.async_adopt_playing_speaker(
        _catalogue(), [SPEAKER], listen_key=LISTEN_KEY
    )
    assert idle.owned is False
    missing = await controller.async_adopt_playing_speaker(
        None, [SPEAKER], listen_key=LISTEN_KEY
    )
    assert missing.owned is False


async def test_owns_media_matches_host_when_query_stripped() -> None:
    controller, _client, _speaker = _controller()
    await controller.async_play_station(
        _catalogue(), "1", quality="premium_high", default_speaker=SPEAKER
    )
    assert controller.owns_media(MIRRORS[0]) is True
    assert controller.owns_media("http://prem2.di.fm:80/trance_hi") is True
    assert controller.owns_media("http://prem1.di.fm:80/trance_hi") is False


async def test_attributes_never_include_stream_url_or_listen_key() -> None:
    controller, _client, _speaker = _controller()
    await controller.async_play_station(
        _catalogue(), "1", quality="premium_high", default_speaker=SPEAKER
    )
    views = favourite_views(
        [Favourite(id="1", network="di", key="trance", name="Trance")], _catalogue()
    )
    attrs = playback_attributes(controller.state, views)
    dumped = str(attrs)
    assert LISTEN_KEY not in dumped
    assert controller.state.stream_url not in dumped
    assert "prem2.di.fm" not in dumped
    assert attrs["station_id"] == "1"
    assert attrs["owned"] is True
    assert attrs["favourites"][0]["playing"] is True
    assert attrs["favourites"][0]["artwork_url"]
    assert not attrs["favourites"][0]["artwork_url"].startswith("http://prem")
    browse = favourite_browse_items(views)
    assert browse == [
        {
            "title": "Trance",
            "media_content_id": "1",
            "can_play": True,
            "thumbnail": views[0].artwork_url,
        }
    ]
    assert LISTEN_KEY not in str(browse)
