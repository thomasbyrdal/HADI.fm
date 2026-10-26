# Troubleshooting

Never paste your listen key, Icecast URLs that contain it, or account passwords into issues or logs.

## Integration does not appear

1. Confirm `custom_components/difm_radio/manifest.json` exists on the Home Assistant host.
2. Restart Home Assistant, not only reload Lovelace.
3. Check **Settings → Devices & services → Add integration** for **DI.FM Radio**.
4. If it is missing, open **Settings → System → Logs** and search for `difm_radio`.

## Listen key rejected

- Copy the key from **Settings → Player Settings** on a network site, not from a playlist URL.
- Empty keys and public `/listen` responses are not treated as success.
- A 403 `Invalid Listen Key` body means the key is wrong or expired. Use **Reconfigure**.
- Timeouts are `cannot_connect`, not an invalid key. Try again later.

## No stations or missing services

- The catalogue is public and cached for six hours. Use the `difm_radio.refresh_stations` service.
- Inferred-inactive names (`X` + capital letter) stay in the catalogue but cannot be added as new favourites.
- A favourite that disappeared is kept and marked unavailable.

## Configure shows three empty arrows

Home Assistant needs `options.step.init.menu_options` translations. Update to 0.1.1 or later, then restart. The menu should list **Favourite stations**, **Default speaker and quality**, **Filter services**, and **Station artwork**. If a form after that is empty, wait until the catalogue refresh finishes and try **Favourite stations** again.

## Card has no stations to play

1. Add **DI.FM favourite stations** from the **By card** tab, not a generic media-player tile.
2. In the card editor, set the entity to `media_player.di_fm_radio` (or the integration player), not the speaker.
3. Confirm **Configure → Favourite stations** still has the stations you picked during setup.
4. Hard-refresh the browser so it loads `difm-radio-card.js?v=0.1.4`.

HACS does not treat a new `main` commit as an update if the integration was first installed before any GitHub release existed. Use **⋮ → Redownload** and pick the release version.

## Custom element doesn't exist: difm-radio-card

1. Update to **0.1.9** or later, then restart Home Assistant.
2. Open **Settings → Dashboards → Resources** and confirm a **module** resource for `/difm_radio/difm-radio-card.js?v=0.1.9` (or newer).
3. If it is missing, add that URL yourself as type **module**, then hard-refresh the browser.
4. In logs, search for `Serving DI.FM Radio card` and `Registered Lovelace card resource`.
5. In the browser console after a hard refresh you should see `DI.FM Radio card v0.1.9`.

## Card shows Configuration error after hours of playback

1. Open the browser console on the dashboard **before** reloading.
2. In Home Assistant logs, search for `DI.FM Radio [` — those lines are breadcrumbs of the last action.
3. Download **Diagnostics** for the integration; the `activity` section lists recent actions without listen keys.
4. Confirm `media_player.di_fm_radio` still exists. From 0.1.8, favourite tiles also appear on `sensor.di_fm_radio_favourites`.

## Card is missing

This is an **integration** card, not a HACS dashboard plugin. It will not appear under `/config/www/community/`. The file lives at:

`custom_components/difm_radio/www/difm-radio-card.js`

Home Assistant should serve it as `/difm_radio/difm-radio-card.js`. A file such as `/www/di-fm-player-card.js` is a different card.

1. Update to 0.1.4 or later, then restart Home Assistant.
2. Open **Settings → Dashboards → Resources** and confirm a **module** resource for `/difm_radio/difm-radio-card.js`.
3. If it is missing, add that URL yourself as type **module**.
4. Hard-refresh the browser.
5. **Edit dashboard → Add card → By card** and search **favourite stations**.

## Tile tap does nothing / playback fails

| Symptom | Likely cause |
| --- | --- |
| `speaker_missing` | The default speaker entity no longer exists |
| `speaker_incompatible` | The selected entity is not a `media_player` |
| `unsupported_format` | The speaker rejected MP3/AAC. Try `premium_high` |
| `playback_failed` | The speaker did not enter `playing` / `buffering` |
| `cannot_connect` | Listen URL resolution failed |
| `invalid_auth` | The listen key was rejected while resolving |

The logical player only stops a stream it started. If another automation changed the speaker, Stop will not touch it.

## Volume slider missing

The card hides the slider when the target speaker does not advertise `VOLUME_SET`. Change volume on the speaker itself.

## Still unverified

Audio on a physical Home Assistant speaker has not been confirmed in this project. If tiles update but you hear nothing, the speaker firmware or URL acceptance is the next thing to check. See [api-research.md](api-research.md).
