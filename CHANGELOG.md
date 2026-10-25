# Changelog

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
