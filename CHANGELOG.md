# Changelog

## 0.2.4 — 2026-11-07

- Prepare Marketplace catalog readiness: topics, My badges, brand icons, manifest categories, hassfest/HACS validation workflows
- Pass hassfest by dropping invalid manifest `icon` and declaring config-entry-only `CONFIG_SCHEMA`

## 0.2.3 — 2026-11-07

- Document installation via Home Assistant **Marketplace** (formerly HACS)

## 0.2.2 — 2026-11-07

- Fix settings panel flicker caused by rebuilding the DOM on every panel reattach
- Show the listen key reliably with explicit text contrast and property-based value binding
- Surface real websocket error messages instead of `[object Object]` when Save fails

## 0.2.1 — 2026-11-07

- Stop settings-panel flicker from Home Assistant state updates so artwork can finish loading
- Prefetch and cache station artwork for the favourite grids
- Use 5-wide scrollable grids so artwork tiles fit the Configure dialog
- Style speaker/quality/service selectors as clickable dropdown buttons
- Show and edit the listen key on the main settings panel; Save only when something changed

## 0.2.0 — 2026-11-07

- Replace the Configure favourites dropdown with a settings panel artwork grid (scrollable)
- Add favourite stations through a service dropdown and dual selectable/selected grids
- Manage default speaker and stream quality in the same settings panel
- Expose `difm_radio/get_config` and `difm_radio/set_config` websocket commands

## 0.1.9 — 2026-10-26

- Fix `Custom element doesn't exist: difm-radio-card` after restart by waiting for Lovelace before registering the card resource
- Avoid the `add_extra_js_url` startup race that blanked the dashboard card

## 0.1.8 — 2026-10-26

- Harden the Lovelace card so render failures never become a blank Configuration error
- Move favourite tiles to a dedicated sensor so playback state updates stay small
- Ignore Icecast mirror-host rewrites and playing/buffering flaps
- Keep catalogue refresh failures from unloading the integration
- Add activity breadcrumbs in logs and diagnostics for the last successful action

## 0.1.7 — 2026-10-25

- Ignore speaker metadata ticks so long playback no longer floods Home Assistant state
- Keep the card available across brief speaker dropouts instead of latching unavailable
- Re-attach the card to a stream that kept playing across a Home Assistant restart

## 0.1.6 — 2026-10-25

- Add a custom Settings icon: a radio with an antenna connected to the internet

## 0.1.5 — 2026-10-24

- Start playback as soon as a favourite icon is tapped
- Update now-playing in place so the card no longer flickers or duplicates speakers

## 0.1.4 — 2026-10-24

- Register the Lovelace card as a Dashboard resource so Home Assistant can find **DI.FM favourite stations**
- Keep serving the card from the integration (`/difm_radio/difm-radio-card.js`), not `/www/community/`

## 0.1.3 — 2026-10-24

- Show **DI.FM favourite stations** in the Home Assistant 2026.6 card picker when the DI.FM Radio entity is selected

## 0.1.2 — 2026-10-24

- Rebuild the Lovelace card: speaker dropdown, favourite station icons, then large now-playing artwork with play, stop, and volume

## 0.1.1 — 2026-10-24

- Label every item on the integration Configure menu, including English (GB)
- Open favourite-station editing directly from that menu
- Add a station dropdown on the Lovelace card and recover favourites if the card was pointed at a speaker
- Let the logical media player browse favourite stations from the standard media browser

## 0.1.0 — 2026-10-24

Initial public package.

- Config flow validates a listen key against the AudioAddict listen endpoint
- Catalogue for DI.FM, RadioTunes, JazzRadio, RockRadio, ClassicalRadio, and ZenRadio
- Favourites, default speaker, and stream quality in options
- Logical `media_player` that plays verified Icecast URLs on a Home Assistant speaker
- `custom:difm-radio-card` with artwork tiles, play/stop, volume, and a graphical editor
- Diagnostics and logs redact listen keys and credentialed stream URLs
