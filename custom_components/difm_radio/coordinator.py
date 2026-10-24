"""Catalogue coordinator for DI.FM Radio."""

from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import CATALOGUE_UPDATE_INTERVAL, DOMAIN
from .exceptions import CannotConnectError, InvalidListenKeyError, InvalidResponseError
from .helpers import favourite_views, parse_favourites
from .models import Catalogue, Favourite, FavouriteView
from .provider import AudioAddictClient, describe_request_error

_LOGGER = logging.getLogger(__name__)


class DifmRadioCoordinator(DataUpdateCoordinator[Catalogue]):
    """Fetch and cache the multi-service station catalogue."""

    config_entry: ConfigEntry

    def __init__(self, hass, entry: ConfigEntry, client: AudioAddictClient) -> None:
        try:
            super().__init__(
                hass,
                _LOGGER,
                config_entry=entry,
                name=DOMAIN,
                update_interval=CATALOGUE_UPDATE_INTERVAL,
            )
        except TypeError:
            super().__init__(
                hass,
                _LOGGER,
                name=DOMAIN,
                update_interval=CATALOGUE_UPDATE_INTERVAL,
            )
            self.config_entry = entry
        self.client = client

    @property
    def favourites(self) -> list[Favourite]:
        """Return persisted favourites in user order."""

        return parse_favourites(self.config_entry.options.get("favourites"))

    @property
    def favourite_views(self) -> list[FavouriteView]:
        """Return favourites merged with the current catalogue."""

        if not self.data:
            return [
                FavouriteView(favourite=fav, station=None, available=False)
                for fav in self.favourites
            ]
        return favourite_views(self.favourites, self.data)

    async def _async_update_data(self) -> Catalogue:
        try:
            return await self.client.async_get_catalogue()
        except InvalidListenKeyError as err:
            raise ConfigEntryAuthFailed("Listen key rejected") from err
        except (CannotConnectError, InvalidResponseError) as err:
            raise UpdateFailed(describe_request_error(err)) from err
