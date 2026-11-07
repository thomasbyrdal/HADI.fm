# GitHub / Marketplace release

Home Assistant’s **Marketplace** (formerly HACS) installs custom integrations from a public GitHub repository.

1. Confirm `hacs.json`, `custom_components/difm_radio/manifest.json`, `LICENSE`, `README.md`, and `brand/icon.png` are on the default branch. (`hacs.json` remains the Marketplace discovery metadata file.)
2. Set the GitHub repository description and topics (`homeassistant`, `marketplace`, `di.fm`, `radio`).
3. Turn on Issues. Update `issue_tracker` in `manifest.json` if the owner/name differs from `thomasbyrdal/HADI.fm`.
4. Tag a release that matches `manifest.json` `version` (for example `0.2.3`).
5. In Home Assistant: **Settings → Marketplace → Custom repositories → this repo → Integration**.
6. Download **DI.FM Radio**, then restart Home Assistant.

Do not attach listen keys, `.env` files, or diagnostics that still contain stream URLs to a release.
