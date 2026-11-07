# GitHub / Marketplace release

Home Assistant’s **Marketplace** (formerly HACS) installs custom integrations from a public GitHub repository.

1. Confirm `hacs.json`, `custom_components/difm_radio/manifest.json`, `LICENSE`, `README.md`, and `custom_components/difm_radio/brand/icon.png` are on the default branch. (`hacs.json` remains the Marketplace discovery metadata file.)
2. Keep the GitHub repository description, homepage, and topics set (`homeassistant`, `marketplace`, `custom-integration`, `di-fm`, `radio`, …).
3. Turn on Issues. Update `issue_tracker` in `manifest.json` if the owner/name differs from `thomasbyrdal/HADI.fm`.
4. Confirm **Validate** (hassfest + HACS action) is green on the default branch.
5. Tag a release that matches `manifest.json` `version` (for example `0.2.4`).
6. In Home Assistant: **Settings → Marketplace → Custom repositories → this repo → Integration**.
7. Download **DI.FM Radio**, then restart Home Assistant.

Do not attach listen keys, `.env` files, or diagnostics that still contain stream URLs to a release.
