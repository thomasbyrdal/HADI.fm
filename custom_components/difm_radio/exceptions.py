"""Errors raised by the verified AudioAddict client."""


class AudioAddictError(Exception):
    """Base error for the AudioAddict HTTP client."""


class InvalidListenKeyError(AudioAddictError):
    """The API rejected the listen key (HTTP 403, 'Invalid Listen Key')."""


class CannotConnectError(AudioAddictError):
    """The API could not be reached or returned a transport/server error."""


class InvalidResponseError(AudioAddictError):
    """The API returned a payload that does not match the verified shape."""


class PlaybackError(Exception):
    """A playback request could not be completed."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


class UnknownStationError(PlaybackError):
    """The station id is not in the current catalogue."""

    def __init__(self, station_id: str) -> None:
        super().__init__("unknown_station", f"Unknown station: {station_id}")


class StationUnavailableError(PlaybackError):
    """The station exists in configuration but is not currently playable."""

    def __init__(self, station_id: str) -> None:
        super().__init__("station_unavailable", f"Station unavailable: {station_id}")


class SpeakerError(PlaybackError):
    """The target speaker is missing or incompatible."""


class StreamAuthError(AudioAddictError):
    """Icecast rejected the listen key for a resolved mount."""
