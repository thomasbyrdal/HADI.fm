"""Constants for the DI.FM Radio integration."""

from datetime import timedelta
from typing import Final

DOMAIN: Final = "difm_radio"

CONF_LISTEN_KEY: Final = "listen_key"
CONF_FAVOURITES: Final = "favourites"
CONF_DEFAULT_MEDIA_PLAYER: Final = "default_media_player"
CONF_STREAM_QUALITY: Final = "stream_quality"
CONF_ARTWORK_OVERRIDE: Final = "artwork_override"
CONF_SERVICE_FILTER: Final = "service_filter"

# Verified listen-host quality keys that also appear in official Premium copy.
# premium_low exists on the API but is not listed on di.fm/premium; do not expose it.
# public3 is the free/limited catalogue and is not used for subscriber playback.
QUALITY_PREMIUM_HIGH: Final = "premium_high"
QUALITY_PREMIUM: Final = "premium"
QUALITY_PREMIUM_MEDIUM: Final = "premium_medium"

STREAM_QUALITIES: Final = (
    QUALITY_PREMIUM_HIGH,
    QUALITY_PREMIUM,
    QUALITY_PREMIUM_MEDIUM,
)

DEFAULT_STREAM_QUALITY: Final = QUALITY_PREMIUM_HIGH

QUALITY_LABELS: Final = {
    QUALITY_PREMIUM_HIGH: "MP3 320 kbps (recommended)",
    QUALITY_PREMIUM: "AAC 128 kbps",
    QUALITY_PREMIUM_MEDIUM: "AAC-HE 64 kbps",
}

API_BASE_URL: Final = "https://api.audioaddict.com/v1"
API_TIMEOUT_SECONDS: Final = 30
API_MIN_INTERVAL_SECONDS: Final = 0.5

# Verified validation target. Catalogue endpoints do not check a listen key.
VALIDATION_NETWORK: Final = "di"
VALIDATION_CHANNEL_KEY: Final = "trance"
VALIDATION_QUALITY: Final = QUALITY_PREMIUM_HIGH

CATALOGUE_UPDATE_INTERVAL: Final = timedelta(hours=6)

ATTR_STATION_ID: Final = "station_id"
ATTR_NETWORK: Final = "network"
ATTR_CHANNEL_KEY: Final = "channel_key"
ATTR_AVAILABLE: Final = "available"
ATTR_MEDIA_PLAYER: Final = "media_player"
ATTR_FAVOURITE: Final = "favourite"

SERVICE_PLAY_STATION: Final = "play_station"
SERVICE_STOP: Final = "stop"
SERVICE_REFRESH_STATIONS: Final = "refresh_stations"
SERVICE_SET_FAVOURITE: Final = "set_favourite"

PLAYBACK_CONFIRM_TIMEOUT: Final = 8.0
PLAYBACK_POLL_INTERVAL: Final = 0.25

FRONTEND_URL_BASE: Final = "/difm_radio"
CARD_FILENAME: Final = "difm-radio-card.js"
INTEGRATION_VERSION: Final = "0.1.6"

TO_REDACT: Final = {CONF_LISTEN_KEY, "listen_key"}
