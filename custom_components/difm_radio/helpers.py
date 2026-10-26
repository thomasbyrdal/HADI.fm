"""Pure helpers for favourites, redaction, and form options."""

from __future__ import annotations

from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from .const import TO_REDACT
from .models import Catalogue, Favourite, FavouriteView, Station


def redact_listen_key(value: str | None) -> str:
    """Replace a listen key with a placeholder."""

    if not value:
        return ""
    return "REDACTED"


def redact_url(url: str, secret: str | None = None) -> str:
    """Redact listen-key material from a URL.

    Verified Icecast mounts use the bare key as the entire query string
    (``http://prem2.di.fm:80/trance_hi?{key}``), not ``listen_key=``.
    """

    parts = urlsplit(url)
    if not parts.query:
        return url
    if "=" not in parts.query:
        return urlunsplit((parts.scheme, parts.netloc, parts.path, "REDACTED", parts.fragment))
    query = parse_qsl(parts.query, keep_blank_values=True)
    redacted: list[tuple[str, str]] = []
    changed = False
    for key, value in query:
        if key in TO_REDACT or (secret and key == secret) or (secret and value == secret):
            name = "listen_key" if key in TO_REDACT or key == secret else key
            redacted.append((name, "REDACTED"))
            changed = True
        else:
            redacted.append((key, value))
    if not changed:
        return url
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(redacted), parts.fragment)
    )


def _credentialed_url(value: str) -> bool:
    """Return whether a string looks like a listen URL that may carry a key."""

    if "listen_key=" in value:
        return True
    parts = urlsplit(value)
    return bool(parts.scheme in {"http", "https"} and parts.query and "=" not in parts.query)


def redact_text(text: str, secret: str | None = None) -> str:
    """Redact a listen key and credentialed URLs from free-form text."""

    if secret:
        text = text.replace(secret, "REDACTED")
    if "://" in text or "listen_key=" in text:
        return redact_url(text, secret)
    return text


def redact_mapping(data: dict[str, Any], secret: str | None = None) -> dict[str, Any]:
    """Return a copy with listen-key fields, URLs, and secret copies redacted."""

    result: dict[str, Any] = {}
    for key, value in data.items():
        if key in TO_REDACT:
            result[key] = redact_listen_key(str(value) if value is not None else None)
        elif isinstance(value, str) and secret and secret in value:
            result[key] = redact_text(value, secret)
        elif isinstance(value, str) and _credentialed_url(value):
            result[key] = redact_url(value, secret)
        elif isinstance(value, dict):
            result[key] = redact_mapping(value, secret)
        elif isinstance(value, list):
            result[key] = [
                redact_mapping(item, secret)
                if isinstance(item, dict)
                else redact_text(item, secret)
                if isinstance(item, str) and (secret and secret in item or _credentialed_url(item))
                else item
                for item in value
            ]
        else:
            result[key] = value
    return result


def parse_favourites(raw: Any) -> list[Favourite]:
    """Parse stored favourite options into Favourite objects."""

    if not isinstance(raw, list):
        return []
    favourites: list[Favourite] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        favourite = Favourite.from_dict(item)
        if favourite is None or favourite.id in seen:
            continue
        seen.add(favourite.id)
        favourites.append(favourite)
    return favourites


def _refresh_favourite(favourite: Favourite, station: Station | None) -> Favourite:
    """Update name/key from the live catalogue while keeping stored overrides."""

    if station is None:
        return favourite
    return Favourite(
        id=favourite.id,
        network=station.network,
        key=station.key,
        name=station.name,
        artwork_override=favourite.artwork_override,
    )


def merge_favourites(
    previous: list[Favourite],
    selected_ids: list[str],
    stations: dict[str, Station],
) -> list[Favourite]:
    """Keep previous order for still-selected ids, then append new ids."""

    previous_by_id = {fav.id: fav for fav in previous}
    selected: list[str] = []
    seen: set[str] = set()
    for station_id in selected_ids:
        sid = str(station_id).strip()
        if not sid or sid in seen:
            continue
        seen.add(sid)
        selected.append(sid)

    merged: list[Favourite] = []
    consumed: set[str] = set()
    for favourite in previous:
        if favourite.id not in seen:
            continue
        station = stations.get(favourite.id)
        merged.append(_refresh_favourite(favourite, station))
        consumed.add(favourite.id)

    for station_id in selected:
        if station_id in consumed:
            continue
        station = stations.get(station_id)
        if station is None:
            continue
        previous_fav = previous_by_id.get(station_id)
        merged.append(
            Favourite.from_station(
                station,
                artwork_override=previous_fav.artwork_override if previous_fav else None,
            )
        )
    return merged


def apply_artwork_overrides(
    favourites: list[Favourite],
    overrides: dict[str, str | None],
) -> list[Favourite]:
    """Set or clear per-favourite artwork overrides."""

    updated: list[Favourite] = []
    for favourite in favourites:
        if favourite.id not in overrides:
            updated.append(favourite)
            continue
        raw = overrides[favourite.id]
        artwork = None if raw is None or not str(raw).strip() else str(raw).strip()
        updated.append(
            Favourite(
                id=favourite.id,
                network=favourite.network,
                key=favourite.key,
                name=favourite.name,
                artwork_override=artwork,
            )
        )
    return updated


def favourite_views(favourites: list[Favourite], catalogue: Catalogue) -> list[FavouriteView]:
    """Attach live catalogue state to stored favourites without dropping missing ones."""

    views: list[FavouriteView] = []
    for favourite in favourites:
        station = catalogue.stations.get(favourite.id)
        available = station is not None and not station.inferred_inactive
        views.append(FavouriteView(favourite=favourite, station=station, available=available))
    return views


def station_option_label(station: Station, service_name: str, *, unavailable: bool = False) -> str:
    """Label used in config/options multi-selects."""

    suffix = " (unavailable)" if unavailable else ""
    return f"{station.name} — {service_name}{suffix}"


def favourite_option_label(view: FavouriteView, service_name: str) -> str:
    """Label for a stored favourite, including unavailable ones."""

    suffix = "" if view.available else " (unavailable)"
    return f"{view.name} — {service_name}{suffix}"


def build_station_options(
    catalogue: Catalogue,
    service_keys: list[str] | None = None,
    extra_favourites: list[Favourite] | None = None,
) -> list[dict[str, str]]:
    """Build select options: live selectable stations plus preserved favourites."""

    options: list[dict[str, str]] = []
    seen: set[str] = set()
    for station in sorted(
        catalogue.selectable_stations(service_keys),
        key=lambda item: (catalogue.network_name(item.network), item.name.lower()),
    ):
        options.append(
            {
                "value": station.id,
                "label": station_option_label(station, catalogue.network_name(station.network)),
            }
        )
        seen.add(station.id)

    for favourite in extra_favourites or []:
        if favourite.id in seen:
            continue
        if service_keys and favourite.network not in service_keys and favourite.id not in seen:
            # Still include previously saved favourites so they are not silently dropped
            # when the user filters services.
            pass
        station = catalogue.stations.get(favourite.id)
        view = FavouriteView(
            favourite=favourite,
            station=station,
            available=station is not None and not station.inferred_inactive,
        )
        options.append(
            {
                "value": favourite.id,
                "label": favourite_option_label(view, catalogue.network_name(favourite.network)),
            }
        )
        seen.add(favourite.id)
    return options


def validate_media_player_entity(exists: bool, domain: str | None) -> str | None:
    """Return a flow error key if the selected speaker cannot be used."""

    if not exists:
        return "speaker_missing"
    if domain != "media_player":
        return "speaker_incompatible"
    return None


_AUDIOADDICT_HOST_NETWORKS: tuple[tuple[str, str], ...] = (
    ("classicalradio.com", "classicalradio"),
    ("radiotunes.com", "radiotunes"),
    ("jazzradio.com", "jazzradio"),
    ("rockradio.com", "rockradio"),
    ("zenradio.com", "zenradio"),
    ("di.fm", "di"),
    ("audioaddict.com", ""),
)
_QUALITY_MOUNT_SUFFIXES = ("_aacp", "_aac", "_hi")
_NETWORK_MOUNT_PREFIXES = {
    "zenradio": ("zr",),
    "radiotunes": ("rt",),
    "rockradio": ("rr",),
    "classicalradio": ("cr",),
}


def _stream_host(netloc: str) -> str:
    return netloc.split("@")[-1].split(":")[0].lower()


def is_audioaddict_stream_host(netloc: str) -> bool:
    """Return whether a URL host belongs to an AudioAddict listen/Icecast server."""

    host = _stream_host(netloc)
    return any(
        host == domain or host.endswith(f".{domain}") for domain, _ in _AUDIOADDICT_HOST_NETWORKS
    )


def network_from_stream_host(netloc: str) -> str | None:
    """Map an Icecast host to a catalogue network key, if known."""

    host = _stream_host(netloc)
    for domain, network in _AUDIOADDICT_HOST_NETWORKS:
        if host == domain or host.endswith(f".{domain}"):
            return network or None
    return None


def stream_carries_listen_key(url: str, listen_key: str | None) -> bool:
    """Return whether *url* includes the configured listen key."""

    if not url or not listen_key:
        return False
    parts = urlsplit(url)
    if parts.query == listen_key:
        return True
    values = (value for _key, value in parse_qsl(parts.query, keep_blank_values=True))
    return any(value == listen_key for value in values)


def stream_looks_ours(url: str, listen_key: str | None) -> bool:
    """Return whether a speaker media_content_id is a DI.FM / sister-service stream."""

    if not url or "://" not in url:
        return False
    if stream_carries_listen_key(url, listen_key):
        return True
    return is_audioaddict_stream_host(urlsplit(url).netloc)


def same_icecast_mount(left: str | None, right: str | None) -> bool:
    """Return whether two URLs point at the same AudioAddict Icecast mount.

    Mirror host changes (``prem1`` vs ``prem2``) and listen-key query differences
    are ignored so speaker metadata rewrites do not look like foreign media.
    """

    if not left or not right:
        return False
    left_parts = urlsplit(left)
    right_parts = urlsplit(right)
    if not left_parts.path or left_parts.path != right_parts.path:
        return False
    if left_parts.netloc == right_parts.netloc:
        return True
    return is_audioaddict_stream_host(left_parts.netloc) and is_audioaddict_stream_host(
        right_parts.netloc
    )


def _mount_name(path: str) -> str:
    return path.strip("/").split("/")[-1]


def _strip_quality_suffix(mount: str) -> str:
    for suffix in _QUALITY_MOUNT_SUFFIXES:
        if mount.endswith(suffix):
            return mount[: -len(suffix)]
    return mount


def _station_matches_mount(station: Station, mount: str, network: str | None) -> bool:
    if network and station.network != network:
        return False
    if station.key == mount:
        return True
    prefixes = _NETWORK_MOUNT_PREFIXES.get(station.network, ())
    return any(mount == f"{prefix}{station.key}" for prefix in prefixes)


def match_station_from_stream(
    catalogue: Catalogue,
    url: str,
    *,
    hint_station_id: str | None = None,
) -> Station | None:
    """Resolve a playing Icecast URL back to a catalogue station."""

    parts = urlsplit(url)
    mount = _strip_quality_suffix(_mount_name(parts.path))
    network = network_from_stream_host(parts.netloc)
    hinted_id = str(hint_station_id).strip() if hint_station_id else ""
    hinted = catalogue.stations.get(hinted_id) if hinted_id else None
    if hinted is not None and _station_matches_mount(hinted, mount, network):
        return hinted
    matches = [
        station
        for station in catalogue.stations.values()
        if _station_matches_mount(station, mount, network)
    ]
    if len(matches) == 1:
        return matches[0]
    if hinted is not None and network is not None and hinted.network == network:
        return hinted
    return None


def attach_icecast_key(url: str, listen_key: str) -> str:
    """Attach a listen key in the form verified against Icecast.

    A real key was tested on 2026-10-24:

    - ``http://prem2.di.fm:80/trance_hi?{key}`` returned ``200 audio/mpeg``
    - ``http://prem2.di.fm:80/trance_hi?listen_key={key}`` returned ``401``
    - Combining both query forms also returned ``401``

    Unauthenticated ``/listen`` responses omit the key. A valid-key
    ``/listen`` response and each PLS ``FileN`` URL already use this form.
    """

    if not listen_key:
        return url
    parts = urlsplit(url)
    if parts.query == listen_key:
        return url
    return urlunsplit((parts.scheme, parts.netloc, parts.path, listen_key, parts.fragment))
