# Milestone status

## Milestone 1 — API research

Done. See [api-research.md](api-research.md).

## Milestone 2 — Skeleton, config flow, tests

Implemented:

- Custom integration package `custom_components/difm_radio`
- Manifest, translations, HACS metadata, MIT licence
- Config flow that validates a listen key against the verified listen endpoint
- pytest unit tests that mock HTTP and do not need a real listen key

## Milestone 3 — API access and multi-service discovery

Implemented:

- `AudioAddictClient` for `GET /v1/networks` and `GET /v1/{network}/channels`
- Coordinator that caches the combined catalogue for six hours
- Parsing of official artwork, descriptions, and globally unique station ids
- Inferred-inactive stations stay in the catalogue but are not offered as new favourites

Not implemented: now-playing / `currently_playing` (not required for 2–4).

## Milestone 4 — Favourites, persistence, default speaker

Implemented:

- Multi-step favourite picker with service filter
- Favourites stored as `{id, network, key, name, artwork_override?}` in entry options
- Previous favourite order is preserved; missing stations are kept and marked unavailable
- Default `media_player` selector with existence/domain checks
- Stream quality option limited to the three Premium formats listed on di.fm/premium
- Options flow for speaker, favourites, and artwork overrides
- Listen key stays in `entry.data` and is redacted from diagnostics helpers

## Milestone 5 — Playback

Implemented:

- Logical `media_player` that forwards `play_media`, stop, and volume to the configured speaker
- Stream resolution via `GET /v1/{network}/listen/{quality}/{channel_key}?listen_key=`
- Icecast URLs assembled with the verified bare `?{listen_key}` query
- State tracking, station switching, stop-only-if-owned, volume forwarding, one URL refresh after mirror failure
- Services: `play_station`, `stop`, `refresh_stations`, `set_favourite`
- Unit tests for every controller playback path

Verified with a real listen key on 2026-10-24: key validation, `/listen` URL lists, Icecast `200 audio/mpeg` for the bare-key form, and the same key on JazzRadio.

**Not verified:** audio actually playing on a Home Assistant speaker. No compatible target player was available in this environment. Do not treat speaker playback as working until that is confirmed.

## Milestone 6 — Lovelace card

Implemented:

- `custom:difm-radio-card` TypeScript card bundled to `custom_components/difm_radio/www/difm-radio-card.js`
- Favourite tiles from the logical media player attributes (artwork or icon, name, service label, active state)
- Taps call `difm_radio.play_station`; play/resume and stop use integration services
- Volume slider controls the actual speaker entity when it supports `VOLUME_SET`
- Loading, error, unavailable, and empty-favourite states
- Responsive grid, Home Assistant theme variables, graphical card editor
- Auto-registered as a frontend module (`/difm_radio/difm-radio-card.js`)
- Vitest coverage for model, card, and editor

The card never receives the listen key. Speaker audio is still unverified on a physical Home Assistant player.

## Milestone 7 — Errors, diagnostics, security

Implemented:

- 401 on listen treated as an invalid key; 429 treated as rate-limited connect failure
- One bounded retry for catalogue transport / 5xx / 429; listen-key checks are not retried
- Diagnostics include version, card URL, coordinator status, and playback without stream URLs
- Redaction walks mappings and free text with the configured listen key
- Services unload when the last config entry unloads
- Frontend registration is idempotent from both `async_setup` and `async_setup_entry`

## Milestone 8 — Tests, HACS, docs, clean install

Implemented:

- Backend and frontend tests plus Ruff / TypeScript checks
- `hacs.json`, brand icon, changelog, issue template, release notes
- Installation, services, troubleshooting, and screenshot mockup in the README
- Packaging test for a self-contained `custom_components/difm_radio` tree

Clean install on `http://homeassistant.local:8123/` was reachable (HTTP UI on 192.168.1.216). The instance presented a login form. No Home Assistant credentials were available, so the integration was **not** copied onto that host and speaker audio was **not** exercised there.

## Remaining manual work

See the “Still requires real hardware or credentials” list in the project README / this file’s notes:

- Home Assistant login, then copy `custom_components/difm_radio` and restart
- Enter a listen key in the UI
- Hear audio on a physical speaker
- Publish the GitHub repository to HACS / Marketplace

