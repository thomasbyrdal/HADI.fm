"""Parsed objects for the verified AudioAddict catalogue."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


def is_inferred_inactive(name: str) -> bool:
    """Return whether a channel name matches the inferred hidden-station pattern.

    On 2026-10-24 the DI.FM ``/channels`` list was 18 longer than
    ``active_channel_count``. Those extra names started with ``X`` followed by a
    capital letter. This is inferred, not documented by Digitally Imported.
    """

    return bool(name) and len(name) >= 2 and name[0] == "X" and name[1].isupper()


def normalize_artwork_url(raw: str | None) -> str | None:
    """Turn a verified CDN template into a fetchable HTTPS URL."""

    if not raw or not isinstance(raw, str):
        return None
    url = raw.split("{", 1)[0].strip()
    if not url:
        return None
    if url.startswith("//"):
        url = f"https:{url}"
    if url.startswith("http://"):
        url = f"https://{url[len('http://'):]}"
    if not url.startswith("https://"):
        return None
    return url


def artwork_from_images(images: Any) -> str | None:
    """Pick official artwork using the verified preference order."""

    if not isinstance(images, dict):
        return None
    for key in ("square", "compact", "default"):
        url = normalize_artwork_url(images.get(key))
        if url:
            return url
    return None


@dataclass(frozen=True, slots=True)
class Network:
    """One AudioAddict network from ``GET /v1/networks``."""

    id: int
    key: str
    name: str
    site_url: str | None
    listen_url: str | None
    active: bool
    active_channel_count: int | None = None

    @classmethod
    def from_api(cls, payload: dict[str, Any]) -> Network | None:
        """Parse one networks-list item. Skip malformed entries."""

        try:
            network_id = int(payload["id"])
            key = str(payload["key"]).strip()
            name = str(payload["name"]).strip()
        except (KeyError, TypeError, ValueError):
            return None
        if not key or not name:
            return None
        count = payload.get("active_channel_count")
        try:
            active_count = int(count) if count is not None else None
        except (TypeError, ValueError):
            active_count = None
        return cls(
            id=network_id,
            key=key,
            name=name,
            site_url=_optional_str(payload.get("url")),
            listen_url=_optional_str(payload.get("listen_url")),
            active=bool(payload.get("active", True)),
            active_channel_count=active_count,
        )


@dataclass(frozen=True, slots=True)
class Station:
    """One channel from ``GET /v1/{network}/channels``."""

    id: str
    key: str
    name: str
    network: str
    network_id: int | None
    description_short: str | None
    description_long: str | None
    artwork_url: str | None
    inferred_inactive: bool = False

    @classmethod
    def from_api(cls, payload: dict[str, Any], network_key: str) -> Station | None:
        """Parse one channel object. Skip entries missing stable identifiers."""

        try:
            station_id = str(int(payload["id"]))
            key = str(payload["key"]).strip()
            name = str(payload["name"]).strip()
        except (KeyError, TypeError, ValueError):
            return None
        if not key or not name:
            return None
        network_id = payload.get("network_id")
        try:
            parsed_network_id = int(network_id) if network_id is not None else None
        except (TypeError, ValueError):
            parsed_network_id = None
        return cls(
            id=station_id,
            key=key,
            name=name,
            network=network_key,
            network_id=parsed_network_id,
            description_short=_optional_str(payload.get("description_short")),
            description_long=_optional_str(payload.get("description_long")),
            artwork_url=artwork_from_images(payload.get("images")),
            inferred_inactive=is_inferred_inactive(name),
        )

    @property
    def item_id(self) -> str:
        """Network-scoped slug used to resolve a stream."""

        return f"{self.network}:{self.key}"


@dataclass(slots=True)
class Favourite:
    """Persisted favourite. Identified by the globally unique numeric station id."""

    id: str
    network: str
    key: str
    name: str
    artwork_override: str | None = None

    def as_dict(self) -> dict[str, Any]:
        """Serialize for config-entry options."""

        data: dict[str, Any] = {
            "id": self.id,
            "network": self.network,
            "key": self.key,
            "name": self.name,
        }
        if self.artwork_override:
            data["artwork_override"] = self.artwork_override
        return data

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> Favourite | None:
        """Parse a stored favourite. Skip entries without a stable id."""

        station_id = str(payload.get("id") or "").strip()
        network = str(payload.get("network") or "").strip()
        key = str(payload.get("key") or "").strip()
        name = str(payload.get("name") or "").strip()
        if not station_id or not network or not key:
            return None
        override = normalize_artwork_url(payload.get("artwork_override"))
        return cls(
            id=station_id,
            network=network,
            key=key,
            name=name or key,
            artwork_override=override,
        )

    @classmethod
    def from_station(cls, station: Station, artwork_override: str | None = None) -> Favourite:
        """Create a favourite from a live catalogue station."""

        return cls(
            id=station.id,
            network=station.network,
            key=station.key,
            name=station.name,
            artwork_override=normalize_artwork_url(artwork_override),
        )


@dataclass(slots=True)
class FavouriteView:
    """Favourite merged with the current catalogue."""

    favourite: Favourite
    station: Station | None
    available: bool

    @property
    def id(self) -> str:
        return self.favourite.id

    @property
    def name(self) -> str:
        if self.station:
            return self.station.name
        return self.favourite.name

    @property
    def network(self) -> str:
        return self.favourite.network

    @property
    def key(self) -> str:
        if self.station:
            return self.station.key
        return self.favourite.key

    @property
    def artwork_url(self) -> str | None:
        if self.favourite.artwork_override:
            return self.favourite.artwork_override
        if self.station:
            return self.station.artwork_url
        return None


@dataclass(slots=True)
class Catalogue:
    """Combined networks and stations from the live API."""

    networks: list[Network] = field(default_factory=list)
    stations: dict[str, Station] = field(default_factory=dict)

    def network_name(self, network_key: str) -> str:
        """Return the official network display name, or the key."""

        for network in self.networks:
            if network.key == network_key:
                return network.name
        return network_key

    def selectable_stations(self, service_keys: list[str] | None = None) -> list[Station]:
        """Stations offered as new favourites.

        Inferred-inactive channels stay in ``stations`` so existing favourites
        can be marked unavailable, but they are not offered as new picks.
        """

        keys = set(service_keys) if service_keys else None
        return [
            station
            for station in self.stations.values()
            if not station.inferred_inactive and (keys is None or station.network in keys)
        ]


def _optional_str(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
