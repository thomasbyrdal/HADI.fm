# GitHub / HACS release

HACS and the Home Assistant Marketplace install from a public GitHub repository.

1. Confirm `hacs.json`, `custom_components/difm_radio/manifest.json`, `LICENSE`, `README.md`, and `brand/icon.png` are on the default branch.
2. Set the GitHub repository description and topics (`homeassistant`, `hacs`, `di.fm`, `radio`).
3. Turn on Issues. Update `issue_tracker` in `manifest.json` if the owner/name differs from `byrdal/HADI.fm`.
4. Tag a release that matches `manifest.json` `version` (for example `0.1.0`).
5. In HACS (or **Settings → Marketplace** on Home Assistant 2026.11+): **Custom repositories → this repo → Integration**.
6. Download **DI.FM Radio**, then restart Home Assistant.

Do not attach listen keys, `.env` files, or diagnostics that still contain stream URLs to a release.
