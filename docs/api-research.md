# Milestone 1: DI.FM / sister-service API research

Research date: 2026-10-24

This document records what was verified against live endpoints and official pages
before any integration code is written. Icecast URL assembly and listen-key
validation were re-tested with a real key on 2026-10-24. Audio playing through a
Home Assistant speaker has **not** been verified.

## 1. Source quality

### Official sources used

- [DI.FM Premium](https://www.di.fm/premium)
- [DI.FM Hardware Players](https://www.di.fm/apps/hardware-players)
- [DI.FM Terms of Use](https://www.di.fm/member/tos)
- Live `api.audioaddict.com` and `listen.*` responses captured on 2026-10-24

### No official public API specification

Digitally Imported, Inc. does not publish a developer API guide. The Terms of Use
refer to “APIs and other services” as part of the Platform, but they do not
document endpoints, headers, or response fields.

The official subscriber path for third-party players is:

1. Subscribe.
2. Open Player Settings on a network site (for example [di.fm/settings](https://www.di.fm/settings)).
3. Copy a hardware-player stream URL that includes a listen key.
4. Paste that URL into a player that accepts custom radio URLs (VLC, Sonos, TuneIn, etc.).

Website settings pages are behind Cloudflare. The API and listen hosts used below
are not.

### Authoritative unofficial clients used as cross-checks only

These clients were used to decide *which live URLs to probe*. Behaviour in this
document comes from those probes, not from copying their code blindly.

- [Music Assistant Digitally Incorporated provider](https://github.com/music-assistant/server/tree/dev/music_assistant/providers/digitally_incorporated)
- [di-tui](https://github.com/acaloiaro/di-tui)
- [AudioAddict.bundle](https://github.com/phrawzty/AudioAddict.bundle)

## 2. Verified services

`GET https://api.audioaddict.com/v1/networks` returned exactly six active
networks on 2026-10-24:

| API key          | Official name        | Site                         | Listen host                      | Active channel count (API) |
| ---------------- | -------------------- | ---------------------------- | -------------------------------- | -------------------------- |
| `di`             | DI.FM                | https://www.di.fm            | http://listen.di.fm              | 101                        |
| `radiotunes`     | RadioTunes           | https://www.radiotunes.com   | http://listen.radiotunes.com     | 99                         |
| `jazzradio`      | JAZZRADIO.com        | https://www.jazzradio.com    | http://listen.jazzradio.com      | 45                         |
| `rockradio`      | ROCKRADIO.COM        | https://www.rockradio.com    | http://listen.rockradio.com      | 37                         |
| `classicalradio` | ClassicalRadio.com   | https://www.classicalradio.com | http://listen.classicalradio.com | 56                         |
| `zenradio`       | ZenRadio.com         | https://www.zenradio.com     | http://listen.zenradio.com       | 39                         |

Sky.fm is no longer a live network key. RadioTunes is the current successor.

Official Premium FAQ: one subscription covers all six networks. Clients and
Music Assistant state that the listen key is the same on every site. A real key
was accepted on 2026-10-24 for both `GET /v1/di/listen/premium_high/trance` and
`GET /v1/jazzradio/listen/premium_high/smoothjazz`.

## 3. Authentication

### How a listener obtains a key

Official and widely documented subscriber path:

1. Create a paid (or trial) subscription.
2. Sign in at any network site.
3. Open Settings → Player Settings / Hardware Player Settings.
4. Copy the listen key or a generated channel URL that contains it.

Example official-style hardware URL used by subscribers and third-party players:

```text
https://listen.di.fm/premium_high/<channel_key>.pls?listen_key=<LISTEN_KEY>
```

Username/password login exists at
`POST https://api.audioaddict.com/v1/{network}/members/authenticate`, but the
website is Cloudflare-protected and storing a password is unnecessary. This
integration should accept only a listen key.

### How a listen key is validated (verified for invalid keys)

The catalogue endpoints do **not** validate a listen key. They succeed with no
credentials.

A listen key **is** checked when it is supplied as `listen_key` on listen/playlist
endpoints.

| Request | Result |
| ------- | ------ |
| `GET /v1/di/listen/premium_high/trance` (no `listen_key`) | `200` JSON list of Icecast URLs |
| `GET /v1/di/listen/premium_high/trance?listen_key=` (empty) | `403` body `Invalid Listen Key` |
| `GET /v1/di/listen/premium_high/trance?listen_key=invalidkey123456` | `403` body `Invalid Listen Key` |
| `GET https://listen.di.fm/premium_high/trance.pls` (no key) | `200` PLS of Icecast URLs |
| `GET https://listen.di.fm/premium_high/trance.pls?listen_key=invalidkey123456` | `403` body `Invalid Listen Key` |
| `GET https://listen.di.fm/premium/favorites.pls?listen_key=invalidkey123456` | `403` body `Invalid Listen Key` |

Proposed config-flow validation (confirmed with a real key on 2026-10-24):

1. Reject empty / too-short keys locally.
2. Call `GET https://api.audioaddict.com/v1/di/listen/premium_high/trance?listen_key={key}`.
3. Treat HTTP 403 + `Invalid Listen Key` as `invalid_auth`.
4. Treat HTTP 200 + a JSON array of `http://prem*.*.*:80/...` URLs as a valid key.
5. Treat timeouts / 5xx as `cannot_connect`.

Do **not** treat a missing `listen_key` parameter as success. That request is
public and returns unauthenticated mirror URLs.

### Stream-server authentication

Direct Icecast mounts without a valid key return `401` with
`WWW-Authenticate: Basic realm="Icecast 2.4.0-kh22"`.

A real listen key was tested against `http://prem2.di.fm:80/trance_hi` on
2026-10-24:

| Query form | Result |
| ---------- | ------ |
| none | `401` |
| `?listen_key={key}` | `401` |
| `?{key}` (bare key as the entire query string) | `200 audio/mpeg` |
| both forms together | `401` |

`GET /v1/{network}/listen/...` without a key returns mounts **without**
credentials. The same endpoint with a valid `listen_key` returns those mounts
already using the bare `?{key}` form. The official PLS endpoint
(`https://listen.di.fm/premium_high/trance.pls?listen_key=`) returns
`200 audio/x-scpls` whose `FileN` URLs also use `?{key}`. The integration
attaches the bare key when missing and keeps `listen_key=` only on API/PLS
requests.

Do not probe Icecast from the integration process before `play_media`: that
would consume the single allowed stream.

## 4. Station catalogue

### Primary catalogue endpoint (verified)

```http
GET https://api.audioaddict.com/v1/{network}/channels
```

No authentication header or listen key is required. HTTPS works. Response is a
JSON array.

Live counts on 2026-10-24 (includes inactive/hidden channels):

| Network        | `/channels` count | `active_channel_count` |
| -------------- | ----------------- | ---------------------- |
| di             | 119               | 101                    |
| radiotunes     | 119               | 99                     |
| jazzradio      | 49                | 45                     |
| rockradio      | 48                | 37                     |
| classicalradio | 58                | 56                     |
| zenradio       | 40                | 39                     |
| **total**      | **433**           | **377**                |

On DI.FM, the 18-channel gap matches names that start with `X` followed by a
capital letter (`XChiptunes`, `XUK Garage`, …). Music Assistant treats those as
disabled. That heuristic is **inferred**, not documented.

### Verified channel fields

From the first DI.FM channel (`trance`) and confirmed present across networks:

| Field | Purpose |
| ----- | ------- |
| `id` | Integer. **Globally unique** across all six networks (433 IDs, 0 collisions). |
| `key` | Slug used in stream/playlist URLs. Unique *within* a network, reused across networks (`ambient` exists on DI.FM, RadioTunes, and ZenRadio). |
| `name` | Display name. |
| `network_id` | Numeric network id (1 = DI.FM, 2 = RadioTunes, …). |
| `description_short` | Short copy. |
| `description_long` | Long copy. |
| `channel_director` | Curator name. |
| `channel_filter_ids` | Genre / collection ids. |
| `images` | Official artwork map. |
| `similar_channels` | Related channel ids. |
| `artists` | Featured artists. |
| `public` | Boolean flag. |
| `premium_id` | Present but `0` on every sampled channel. Treat as unused. |

### Official artwork (verified)

Artwork is served from `cdn-images.audioaddict.com`. Example fields:

```json
{
  "square": "//cdn-images.audioaddict.com/.../hash.png{?size,height,width,quality,pad}",
  "compact": "//cdn-images.audioaddict.com/.../hash.png{?size,height,width,quality,pad}",
  "default": "//cdn-images.audioaddict.com/.../hash.png{?size,height,width,quality,pad}",
  "vertical": "//cdn-images.audioaddict.com/.../hash.png{?size,height,width,quality,pad}"
}
```

Verified:

- Prefix `https:` onto protocol-relative URLs.
- Strip the `{?size,...}` template. The bare PNG returns `200 image/png`.
- `?size=200` also returns `200 image/png`.

Use `images.square` as the tile artwork, with `compact` / `default` as fallbacks.

### Alternate catalogue: listen-host playlists (verified)

```http
GET https://listen.{domain}/{quality}
GET https://listen.{domain}/{quality}.json
```

Returns a slimmer list: `id`, `key`, `name`, `playlist`. Useful as a fallback,
but `/v1/{network}/channels` is the richer source of truth.

### Grouping and filters (verified)

```http
GET https://api.audioaddict.com/v1/{network}/channel_filters
```

Returns collections such as Popular, All, New, and genre filters
(`genre: true`). Each filter embeds its channel list.

```http
GET https://api.audioaddict.com/v1/{network}/currently_playing
```

Returns `{channel_id, channel_key, track:{id, display_artist, display_title, start_time, duration}}`.
Useful later for now-playing, not required for Milestone 2–5.

### Recommended stable station identifier

Use both:

- `station_id`: string of the numeric `id` (globally unique, stable if the slug changes).
- `channel_key` + `network`: required to resolve a stream.

Home Assistant item IDs can be `"{network}:{key}"` plus the numeric `id` stored
in attributes. Do not use display names as identifiers.

## 5. Stream resolution

### Official quality marketing

From [di.fm/premium](https://www.di.fm/premium):

| Service | Formats |
| ------- | ------- |
| Premium | MP3 320 kbps, AAC 128 kbps, AAC-HE 64 kbps |
| Free    | AAC-HE 64 kbps |

### Live listen quality keys (verified)

```http
GET https://api.audioaddict.com/v1/{network}/listen/{quality}/{channel_key}
```

DI.FM Trance mirrors on 2026-10-24:

| Quality key       | Example mount              | Inferred format (unofficial) |
| ----------------- | -------------------------- | ---------------------------- |
| `premium_high`    | `http://prem2.di.fm:80/trance_hi`     | MP3 320                      |
| `premium`         | `http://prem2.di.fm:80/trance`        | AAC 128                      |
| `premium_medium`  | `http://prem2.di.fm:80/trance_aac`    | AAC / AAC-HE 64              |
| `premium_low`     | `http://prem2.di.fm:80/trance_aacp`   | AAC-HE (not listed on the marketing page) |
| `public3`         | `http://pub8.di.fm:80/di_trance`      | Free / ad-supported          |

Sister-service examples also work:

- `GET /v1/jazzradio/listen/premium_high/smoothjazz` → `prem*.jazzradio.com/smoothjazz`
- `GET /v1/zenradio/listen/premium_high/meditation` → `prem*.zenradio.com/zrmeditation`

Equivalent PLS:

```text
https://listen.{domain}/{quality}/{channel_key}.pls
```

A premium_high Trance PLS contained three regional mirrors (`prem2`, `prem1`,
`prem4`) titled `DI.FM - Trance`.

### What remains unverified

- Audio playing on a Home Assistant `media_player` (no compatible target player
  was available when milestone 5 was implemented).
- Whether every speaker firmware accepts a direct Icecast URL versus a PLS URL.
- Whether stream URLs expire. They look like stable Icecast mounts; the key is
  the credential. Key rotation is unknown.
- Whether `premium_low` is a supported subscriber option or a leftover.
- Exact bitrate of each mount (inferred from official copy + mount suffix +
  Music Assistant / Plex clients).
- Geographic availability of `prem1` / `prem2` / `prem4`. Older clients say
  `prem2` is EU and the others US; this was not re-verified.

### Recommended playback path

1. Resolve mirrors with the listen key:
   `GET /v1/{network}/listen/{quality}/{channel_key}?listen_key={key}`
2. If HTTP 403 / `Invalid Listen Key`, fail permanently (no retry storm).
3. If HTTP 200, take the JSON array of Icecast URLs (a valid key is already
   attached as `?{key}`).
4. If a mount is missing the key, attach it as the entire query string:
   `http://prem…/mount?{key}`. Do not use `?listen_key=` on Icecast mounts;
   that form returned `401`.
5. Send the first URL to the Home Assistant target `media_player`.
6. If the speaker does not enter `playing` / `buffering`, try the next mirror,
   then re-resolve the listen list once.
7. Prefer `premium_high` (MP3 320) as the default because most speakers handle
   MP3 more reliably than AAC.

Do not decode audio in Python. Do not use free `public3` streams as the default;
official Premium copy and clients say free streams are limited / not equivalent.

## 6. Favourites

The provider exposes remote favourites as:

```text
https://listen.{domain}/premium/favorites.pls?listen_key={key}&download=1
```

An invalid key returns `403 Invalid Listen Key`. A valid-key body has not been
captured. Music Assistant treats this list as read-only.

This Home Assistant integration should store favourites locally in the config
entry (as required by the project spec) and treat remote `favorites.pls` as an
optional later import, not the source of truth.

## 7. Terms, rate limits, and policy

From the official Terms of Use and Premium FAQ:

- Personal, non-commercial use only. Public/business playback is not licensed.
- One active stream per subscription. Extra connections may be dropped.
- Do not capture, re-stream, or redistribute audio.
- Section 11 forbids robots/scrapers and unreasonable load without written
  permission.
- No published numeric rate limit.

Practical approach for this integration:

- Use the same listen-key / custom-URL mechanism DI.FM advertises for VLC,
  Sonos, and other third-party players.
- Call public catalogue endpoints only from a coordinator, cached for hours.
- Resolve a stream URL only when the user starts playback.
- Cap request rate (Music Assistant uses 2 requests/second; that is a client
  choice, not an official limit).
- Never log the listen key or raw stream URLs that contain it.

## 8. Provider-module isolation

Implementation must keep verified and unverified behaviour separate.

```text
custom_components/difm_radio/provider.py   # thin verified HTTP client
custom_components/difm_radio/models.py     # parsed station objects
docs/api-research.md                       # this file
```

`provider.py` should expose only:

| Method | Verified now | Needs real key |
| ------ | ------------ | -------------- |
| `async_list_networks()` | yes | no |
| `async_list_channels(network)` | yes | no |
| `async_validate_listen_key(key)` | yes (invalid and valid) | no |
| `async_resolve_stream_urls(network, key, quality)` | yes (URL list + Icecast auth form) | speaker `play_media` still unverified |
| `async_get_remote_favorites(network, key)` | invalid-key path only | yes |

Do not hardcode a station catalogue. Do not invent extra headers. Do not embed
reverse-engineered mobile-app basic-auth credentials; they are unnecessary for
the verified endpoints.

## 9. Proposed Home Assistant implementation

This is a design proposal for later milestones, not implemented code.

### Domain and entities

- Integration name: **DI.FM Radio**
- Domain: `difm_radio`
- Logical player: `media_player.difm_radio` (or `media_player.difm_radio_<entry>`)
- Card type: `custom:difm-radio-card`

The logical player is *not* the speaker. It remembers the active station and
forwards `play_media` / volume / stop to a selected `media_player` entity.

### Config flow

1. User enters listen key.
2. Validate via `/v1/di/listen/premium_high/trance?listen_key=`.
3. Fetch `/v1/networks` + `/v1/{network}/channels` for all six services.
4. Multi-select favourites with search and service filter. Persist
   `id` + `network` + `key` + optional user artwork override.
5. Select default speaker from existing `media_player` entities.
6. Select stream quality, default `premium_high`.
7. Options flow later for favourites, speaker, quality, and artwork overrides.

Secrets stay in the config entry. The card never receives the listen key.

### Playback

1. Look up station by numeric `id` in the coordinator catalogue.
2. Resolve Icecast URL(s) with the listen key.
3. Call `media_player.play_media` on the target speaker with the audio URL.
4. Confirm the target entity actually enters `playing` (a successful service
   call is not enough).
5. Stop only if this integration owns the current session on that speaker.
6. Enforce one in-flight stream (Terms §4).

### Lovelace card

Favourites come from integration state/attributes, not card YAML. The card
calls `difm_radio.play_station` and subscribes to the logical media player.
Implemented in milestone 6 as `custom:difm-radio-card`.

### What remains unverified on a Home Assistant speaker

- Whether `media_player.play_media` with a bare-key Icecast URL reaches
  `playing` on typical HA speakers (Sonos, VLC, Google Cast, …)
- Whether PLS-or-direct-URL is more reliable on those speakers
- Stream interruption after 30 seconds (Music Assistant reports this as the
  symptom of a second concurrent stream)

## 10. Implementation status

Milestones 1–8 are implemented in this repository. A real listen key has
validated, loaded the catalogue, resolved Icecast mounts, and produced
`200 audio/mpeg` from `prem*.di.fm` using the bare-key query form.

Speaker playback through Home Assistant is implemented but **unverified**. A
live Home Assistant UI at homeassistant.local:8123 was reachable and showed a
login form; files were not installed there. Do not claim that a dashboard tap
produces audio until that is confirmed on a compatible target player.
