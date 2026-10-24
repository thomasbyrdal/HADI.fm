"""Config and options flows for DI.FM Radio."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import selector
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    CONF_ARTWORK_OVERRIDE,
    CONF_DEFAULT_MEDIA_PLAYER,
    CONF_FAVOURITES,
    CONF_LISTEN_KEY,
    CONF_SERVICE_FILTER,
    CONF_STREAM_QUALITY,
    DEFAULT_STREAM_QUALITY,
    DOMAIN,
    QUALITY_LABELS,
    STREAM_QUALITIES,
)
from .exceptions import CannotConnectError, InvalidListenKeyError, InvalidResponseError
from .helpers import (
    apply_artwork_overrides,
    build_station_options,
    merge_favourites,
    parse_favourites,
    validate_media_player_entity,
)
from .models import Catalogue, Favourite
from .provider import AudioAddictClient

STEP_USER = "user"
STEP_SERVICES = "services"
STEP_FAVOURITES = "favourites"
STEP_PLAYER = "player"
STEP_ARTWORK = "artwork"


def _quality_options() -> list[selector.SelectOptionDict]:
    return [
        selector.SelectOptionDict(value=key, label=QUALITY_LABELS[key])
        for key in STREAM_QUALITIES
    ]


def _service_options(catalogue: Catalogue) -> list[selector.SelectOptionDict]:
    return [
        selector.SelectOptionDict(value=network.key, label=network.name)
        for network in catalogue.networks
    ]


def _station_select_options(
    catalogue: Catalogue,
    service_keys: list[str] | None,
    extra: list[Favourite] | None = None,
) -> list[selector.SelectOptionDict]:
    return [
        selector.SelectOptionDict(value=item["value"], label=item["label"])
        for item in build_station_options(catalogue, service_keys, extra)
    ]


def _validate_speaker(hass: HomeAssistant, entity_id: str) -> str | None:
    state = hass.states.get(entity_id)
    return validate_media_player_entity(
        exists=state is not None,
        domain=state.domain if state is not None else None,
    )


class DifmRadioConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle the initial setup flow."""

    VERSION = 1
    MINOR_VERSION = 1

    def __init__(self) -> None:
        self._listen_key: str | None = None
        self._catalogue = Catalogue()
        self._service_keys: list[str] = []
        self._favourites: list[Favourite] = []

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> DifmRadioOptionsFlow:
        """Return the options flow."""

        return DifmRadioOptionsFlow()

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Collect and validate the listen key."""

        errors: dict[str, str] = {}
        if user_input is not None:
            listen_key = str(user_input.get(CONF_LISTEN_KEY, "")).strip()
            client = AudioAddictClient(async_get_clientsession(self.hass))
            try:
                await client.async_validate_listen_key(listen_key)
                client.set_listen_key(listen_key)
                self._catalogue = await client.async_get_catalogue()
            except InvalidListenKeyError:
                errors["base"] = "invalid_auth"
            except CannotConnectError:
                errors["base"] = "cannot_connect"
            except InvalidResponseError:
                errors["base"] = "invalid_response"
            else:
                self._listen_key = listen_key
                return await self.async_step_services()

        return self.async_show_form(
            step_id=STEP_USER,
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_LISTEN_KEY): selector.TextSelector(
                        selector.TextSelectorConfig(
                            type=selector.TextSelectorType.PASSWORD,
                            autocomplete="off",
                        )
                    )
                }
            ),
            errors=errors,
        )

    async def async_step_reauth(self, entry_data: dict[str, Any]) -> ConfigFlowResult:
        """Start reauthentication when the listen key is rejected."""

        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Ask for a replacement listen key."""

        errors: dict[str, str] = {}
        if user_input is not None:
            listen_key = str(user_input.get(CONF_LISTEN_KEY, "")).strip()
            client = AudioAddictClient(async_get_clientsession(self.hass))
            try:
                await client.async_validate_listen_key(listen_key)
            except InvalidListenKeyError:
                errors["base"] = "invalid_auth"
            except CannotConnectError:
                errors["base"] = "cannot_connect"
            except InvalidResponseError:
                errors["base"] = "invalid_response"
            else:
                return self.async_update_reload_and_abort(
                    self._get_reauth_entry(),
                    data_updates={CONF_LISTEN_KEY: listen_key},
                )

        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_LISTEN_KEY): selector.TextSelector(
                        selector.TextSelectorConfig(type=selector.TextSelectorType.PASSWORD)
                    )
                }
            ),
            errors=errors,
        )

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Replace the stored listen key."""

        errors: dict[str, str] = {}
        if user_input is not None:
            listen_key = str(user_input.get(CONF_LISTEN_KEY, "")).strip()
            client = AudioAddictClient(async_get_clientsession(self.hass))
            try:
                await client.async_validate_listen_key(listen_key)
            except InvalidListenKeyError:
                errors["base"] = "invalid_auth"
            except CannotConnectError:
                errors["base"] = "cannot_connect"
            except InvalidResponseError:
                errors["base"] = "invalid_response"
            else:
                return self.async_update_reload_and_abort(
                    self._get_reconfigure_entry(),
                    data_updates={CONF_LISTEN_KEY: listen_key},
                )

        return self.async_show_form(
            step_id="reconfigure",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_LISTEN_KEY): selector.TextSelector(
                        selector.TextSelectorConfig(type=selector.TextSelectorType.PASSWORD)
                    )
                }
            ),
            errors=errors,
        )

    async def async_step_services(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Filter the favourite picker by radio service."""

        if not self._catalogue.networks:
            return self.async_abort(reason="no_stations")

        errors: dict[str, str] = {}
        if user_input is not None:
            selected = [str(key) for key in user_input.get(CONF_SERVICE_FILTER, [])]
            valid = {network.key for network in self._catalogue.networks}
            self._service_keys = [key for key in selected if key in valid]
            if not self._service_keys:
                errors["base"] = "no_services"
            else:
                return await self.async_step_favourites()

        defaults = [network.key for network in self._catalogue.networks]
        return self.async_show_form(
            step_id=STEP_SERVICES,
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_SERVICE_FILTER, default=defaults): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=_service_options(self._catalogue),
                            multiple=True,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
            errors=errors,
        )

    async def async_step_favourites(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Select favourite stations across the chosen services."""

        options = _station_select_options(self._catalogue, self._service_keys)
        if not options:
            return self.async_abort(reason="no_stations")

        errors: dict[str, str] = {}
        if user_input is not None:
            selected_ids = [str(item) for item in user_input.get(CONF_FAVOURITES, [])]
            self._favourites = merge_favourites([], selected_ids, self._catalogue.stations)
            if not self._favourites:
                errors["base"] = "no_favourites"
            else:
                return await self.async_step_player()

        return self.async_show_form(
            step_id=STEP_FAVOURITES,
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_FAVOURITES, default=[]): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=options,
                            multiple=True,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
            errors=errors,
        )

    async def async_step_player(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Choose the default speaker and stream quality."""

        errors: dict[str, str] = {}
        if user_input is not None:
            entity_id = str(user_input[CONF_DEFAULT_MEDIA_PLAYER])
            quality = str(user_input.get(CONF_STREAM_QUALITY, DEFAULT_STREAM_QUALITY))
            speaker_error = _validate_speaker(self.hass, entity_id)
            if speaker_error:
                errors["base"] = speaker_error
            elif quality not in STREAM_QUALITIES:
                errors["base"] = "invalid_quality"
            elif not self._listen_key:
                errors["base"] = "invalid_auth"
            else:
                return self.async_create_entry(
                    title="DI.FM Radio",
                    data={CONF_LISTEN_KEY: self._listen_key},
                    options={
                        CONF_FAVOURITES: [fav.as_dict() for fav in self._favourites],
                        CONF_DEFAULT_MEDIA_PLAYER: entity_id,
                        CONF_STREAM_QUALITY: quality,
                    },
                )

        return self.async_show_form(
            step_id=STEP_PLAYER,
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_DEFAULT_MEDIA_PLAYER): selector.EntitySelector(
                        selector.EntitySelectorConfig(domain=Platform.MEDIA_PLAYER)
                    ),
                    vol.Required(
                        CONF_STREAM_QUALITY, default=DEFAULT_STREAM_QUALITY
                    ): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=_quality_options(),
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    ),
                }
            ),
            errors=errors,
        )


class DifmRadioOptionsFlow(OptionsFlow):
    """Change favourites, speaker, quality, and artwork overrides."""

    def __init__(self) -> None:
        self._catalogue: Catalogue | None = None
        self._service_keys: list[str] = []

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Show the options menu."""

        return self.async_show_menu(
            step_id="init",
            menu_options=["player", "favourites_filter", "artwork"],
        )

    async def async_step_player(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Update default speaker and stream quality."""

        errors: dict[str, str] = {}
        current = self.config_entry.options
        if user_input is not None:
            entity_id = str(user_input[CONF_DEFAULT_MEDIA_PLAYER])
            quality = str(user_input.get(CONF_STREAM_QUALITY, DEFAULT_STREAM_QUALITY))
            speaker_error = _validate_speaker(self.hass, entity_id)
            if speaker_error:
                errors["base"] = speaker_error
            elif quality not in STREAM_QUALITIES:
                errors["base"] = "invalid_quality"
            else:
                return self._save_options(
                    {
                        CONF_DEFAULT_MEDIA_PLAYER: entity_id,
                        CONF_STREAM_QUALITY: quality,
                    }
                )

        schema = vol.Schema(
            {
                vol.Required(CONF_DEFAULT_MEDIA_PLAYER): selector.EntitySelector(
                    selector.EntitySelectorConfig(domain=Platform.MEDIA_PLAYER)
                ),
                vol.Required(CONF_STREAM_QUALITY): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=_quality_options(),
                        mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                ),
            }
        )
        return self.async_show_form(
            step_id=STEP_PLAYER,
            data_schema=self.add_suggested_values_to_schema(schema, current),
            errors=errors,
        )

    async def async_step_favourites_filter(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Filter favourite selection by service."""

        catalogue = await self._async_catalogue()
        if user_input is not None:
            selected = [str(key) for key in user_input.get(CONF_SERVICE_FILTER, [])]
            valid = {network.key for network in catalogue.networks}
            self._service_keys = [key for key in selected if key in valid]
            if not self._service_keys:
                return self.async_show_form(
                    step_id="favourites_filter",
                    data_schema=self._service_schema(catalogue),
                    errors={"base": "no_services"},
                )
            return await self.async_step_favourites()

        return self.async_show_form(
            step_id="favourites_filter",
            data_schema=self._service_schema(catalogue),
        )

    async def async_step_favourites(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Add or remove favourites while preserving existing order."""

        catalogue = await self._async_catalogue()
        previous = parse_favourites(self.config_entry.options.get(CONF_FAVOURITES))
        options = _station_select_options(catalogue, self._service_keys, previous)
        if not options:
            return self.async_abort(reason="no_stations")

        errors: dict[str, str] = {}
        if user_input is not None:
            selected_ids = [str(item) for item in user_input.get(CONF_FAVOURITES, [])]
            merged = merge_favourites(previous, selected_ids, catalogue.stations)
            if not merged:
                errors["base"] = "no_favourites"
            else:
                return self._save_options(
                    {CONF_FAVOURITES: [fav.as_dict() for fav in merged]}
                )

        default_ids = [fav.id for fav in previous]
        return self.async_show_form(
            step_id=STEP_FAVOURITES,
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_FAVOURITES, default=default_ids): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=options,
                            multiple=True,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
            errors=errors,
        )

    async def async_step_artwork(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Set or clear a custom artwork URL for one favourite."""

        favourites = parse_favourites(self.config_entry.options.get(CONF_FAVOURITES))
        if not favourites:
            return self.async_abort(reason="no_favourites")

        errors: dict[str, str] = {}
        if user_input is not None:
            station_id = str(user_input.get("station_id", ""))
            raw_url = str(user_input.get(CONF_ARTWORK_OVERRIDE, "")).strip()
            if station_id not in {fav.id for fav in favourites}:
                errors["base"] = "unknown_station"
            else:
                updated = apply_artwork_overrides(
                    favourites, {station_id: raw_url or None}
                )
                return self._save_options(
                    {CONF_FAVOURITES: [fav.as_dict() for fav in updated]}
                )

        station_options = [
            selector.SelectOptionDict(value=fav.id, label=f"{fav.name} ({fav.network})")
            for fav in favourites
        ]
        return self.async_show_form(
            step_id=STEP_ARTWORK,
            data_schema=vol.Schema(
                {
                    vol.Required("station_id"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=station_options,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    ),
                    vol.Optional(CONF_ARTWORK_OVERRIDE, default=""): selector.TextSelector(
                        selector.TextSelectorConfig(type=selector.TextSelectorType.URL)
                    ),
                }
            ),
            errors=errors,
        )

    def _service_schema(self, catalogue: Catalogue) -> vol.Schema:
        defaults = [network.key for network in catalogue.networks]
        return vol.Schema(
            {
                vol.Required(CONF_SERVICE_FILTER, default=defaults): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=_service_options(catalogue),
                        multiple=True,
                        mode=selector.SelectSelectorMode.DROPDOWN,
                    )
                )
            }
        )

    def _save_options(self, updates: dict[str, Any]) -> ConfigFlowResult:
        options = dict(self.config_entry.options)
        options.update(updates)
        return self.async_create_entry(data=options)

    async def _async_catalogue(self) -> Catalogue:
        if self._catalogue is not None:
            return self._catalogue
        runtime = getattr(self.config_entry, "runtime_data", None)
        if runtime is not None:
            coordinator = getattr(runtime, "coordinator", runtime)
            data = getattr(coordinator, "data", None)
            if data is not None:
                self._catalogue = data
                return self._catalogue
        listen_key = str(self.config_entry.data.get(CONF_LISTEN_KEY, "")).strip()
        client = AudioAddictClient(async_get_clientsession(self.hass), listen_key)
        self._catalogue = await client.async_get_catalogue()
        return self._catalogue
