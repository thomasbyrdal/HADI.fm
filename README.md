# DI.FM Radio for Home Assistant

Custom integration and Lovelace card for DI.FM and the sister AudioAddict services. It stores a listen key in the config entry, loads the live station catalogue, remembers favourites, and plays a resolved Icecast URL on a Home Assistant speaker through a logical `media_player`.

**Speaker audio has not been verified on a physical target player.** Stream URL resolution and Icecast `200 audio/mpeg` were verified with a real listen key. Do not treat a dashboard tap as confirmed audio until you hear it on your speaker.

Minimum Home Assistant version: **2025.1.0**.

## Supported radio services

Verified live on 2026-10-24 via `GET https://api.audioaddict.com/v1/networks`:

- DI.FM
- RadioTunes
- JAZZRADIO.com
- ROCKRADIO.COM
- ClassicalRadio.com
- ZenRadio.com

One paid subscription covers every listed service. Sky.fm is not a live network.

## Get a listen key

1. Subscribe at [di.fm/premium](https://www.di.fm/premium) or a sister site.
2. Sign in and open **Settings → Player Settings**.
3. Copy the listen key. Do not put it in card YAML, automations you will share, or Git.

Validation uses:

`GET https://api.audioaddict.com/v1/di/listen/premium_high/trance?listen_key=...`

A request without `listen_key` is public and is not treated as success.

## Install with HACS

1. Publish or add this repository as a HACS **custom repository** of type **Integration**. On Home Assistant 2026.11+ that flow lives under **Settings → Marketplace**.
2. Download **DI.FM Radio**.
3. Restart Home Assistant.
4. Go to **Settings → Devices & services → Add integration → DI.FM Radio**.

See [docs/releasing.md](docs/releasing.md) for GitHub release notes.

## Manual / clean install

1. Copy `custom_components/difm_radio` into `<config>/custom_components/difm_radio` so that `manifest.json` is at `<config>/custom_components/difm_radio/manifest.json`.
2. Confirm `www/difm-radio-card.js` is in that folder.
3. Restart Home Assistant.
4. Add the integration from the UI.

## Initial configuration

1. Paste the listen key.
2. Choose which services appear in the favourite picker.
3. Select favourites. Search the dropdown. Order is kept when you edit later.
4. Choose a default `media_player` and a stream quality.

Options later: **Configure** on the integration. The menu lists **Favourite stations**, **Default speaker and quality**, a service filter, and artwork. Favourite edits do not reload the entry, so an owned stream is not torn down.

Stream quality (official Premium copy):

| Key | Format |
| --- | --- |
| `premium_high` | MP3 320 kbps (default) |
| `premium` | AAC 128 kbps |
| `premium_medium` | AAC-HE 64 kbps |

## Lovelace card

The integration registers `custom:difm-radio-card` as a frontend module at `/difm_radio/difm-radio-card.js`. After a restart, **Edit dashboard → Add card → DI.FM Radio**.

The card layout is:

1. A **speaker** dropdown
2. Favourite stations as artwork icons
3. Large artwork for the selected station, with play, stop, and volume

Do not add the generic media-player card for `media_player.di_fm_radio` if you want that layout. The logical player also exposes **Browse media**.

Mockup: [docs/screenshots/card-mockup.svg](docs/screenshots/card-mockup.svg)

```yaml
type: custom:difm-radio-card
entity: media_player.di_fm_radio
# media_player: media_player.kitchen   # optional speaker override
# columns: 4
# title: DI.FM Radio
# show_names: true
# show_service_labels: true
# show_volume: true
```

Favourites come from the integration entity. The card never stores the listen key.

If the picker does not list the card, add a Lovelace resource of type **module**: `/difm_radio/difm-radio-card.js`

## Services

| Service | Purpose |
| --- | --- |
| `difm_radio.play_station` | Play `station_id`. Optional `media_player` override |
| `difm_radio.stop` | Stop only if this integration owns the speaker session |
| `difm_radio.refresh_stations` | Reload the catalogue |
| `difm_radio.set_favourite` | Add or remove a favourite by `station_id` |

The logical `media_player.di_fm_radio` also accepts `play_media` with a station id, Stop, and volume when the speaker supports it.

## Known limitations

- One active stream per subscription (DI.FM Terms).
- Icecast mounts use the verified bare `?{listen_key}` form. `?listen_key=` returns 401.
- The integration does not probe Icecast itself; that would consume the only allowed stream.
- Now-playing track metadata is not implemented.
- Remote `favorites.pls` is not imported; favourites are local.
- Speaker audio through Home Assistant `play_media` is **unverified**.

## Verified vs unverified

See [docs/api-research.md](docs/api-research.md).

Verified: public catalogue, official artwork, listen-key validation, `/listen` URL lists with the bare-key query, Icecast `200 audio/mpeg`, same key on JazzRadio.

Unverified: audio from a Home Assistant speaker, stream expiry, and every speaker firmware accepting the Icecast URL.

## Troubleshooting

See [docs/troubleshooting.md](docs/troubleshooting.md).

## Tests and checks

```bash
python3.12 -m pip install -e ".[test]"
python3.12 -m ruff check custom_components tests
python3.12 -m pytest
```

```bash
cd frontend
npm ci
npm run typecheck
npm test
npm run build
```

CI does not use a real listen key. Config-flow tests in `tests/test_config_flow.py` run only when `homeassistant` is installed.

## Still requires real hardware, a listen key, or a login

These were not completed automatically:

| Item | Why |
| --- | --- |
| Copy onto `http://homeassistant.local:8123/` | The UI loaded (192.168.1.216) and asked for a username and password. No credentials were used. |
| Hear audio on a speaker | Needs that Home Assistant login plus a speaker that accepts Icecast `play_media` |
| Type a listen key in the UI | The key must be entered locally; it is not stored in this repo |
| HACS store listing | Needs a public GitHub repository and a release |

## Report issues

Use GitHub Issues. Do not include your listen key, stream URLs that contain it, or account passwords.

## Licence

MIT. See [LICENSE](LICENSE).
