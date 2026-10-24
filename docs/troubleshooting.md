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
4. Hard-refresh the browser so it loads `difm-radio-card.js?v=0.1.3`.

HACS does not treat a new `main` commit as an update if the integration was first installed before any GitHub release existed. Use **⋮ → Redownload** and pick the release version.

## Card is missing

The integration registers `/difm_radio/difm-radio-card.js` as a frontend module.

1. Restart after installing.
2. Hard-refresh the browser.
3. If the card picker still has no **DI.FM Radio** card, add a Lovelace resource of type **module**: `/difm_radio/difm-radio-card.js`
4. Confirm `custom_components/difm_radio/www/difm-radio-card.js` is present.

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
