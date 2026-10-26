"""Catalogue coordinator for DI.FM Radio."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.config_entries import ConfigEntry
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

    def __init__(
        self,
        hass,
        entry: ConfigEntry,
        client: AudioAddictClient,
        *,
        activity: Any | None = None,
    ) -> None:
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
        self._activity = activity

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
        # Catalogue endpoints are public. Never raise ConfigEntryAuthFailed here:
        # a transient 401/403 must not unload the integration and blank the card.
        if self._activity is not None:
            self._activity.note("catalogue_refresh_start", level=logging.DEBUG)
        try:
            catalogue = await self.client.async_get_catalogue()
        except (InvalidListenKeyError, CannotConnectError, InvalidResponseError) as err:
            detail = describe_request_error(err)
            if self._activity is not None:
                self._activity.warn_with_context("Catalogue refresh failed: %s", detail)
            raise UpdateFailed(detail) from err
        if self._activity is not None:
            self._activity.note(
                "catalogue_refresh_ok",
                f"{len(catalogue.stations)} stations",
                level=logging.DEBUG,
            )
        return catalogue
