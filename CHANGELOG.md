# Changelog

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
