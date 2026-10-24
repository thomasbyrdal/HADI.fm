"""HACS and clean-install packaging checks."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INTEGRATION = ROOT / "custom_components" / "difm_radio"


def test_hacs_and_manifest_required_fields() -> None:
    hacs = json.loads((ROOT / "hacs.json").read_text(encoding="utf-8"))
    manifest = json.loads((INTEGRATION / "manifest.json").read_text(encoding="utf-8"))
    assert hacs["name"] == "DI.FM Radio"
    assert hacs["homeassistant"] == "2025.1.0"
    for key in ("domain", "name", "version", "documentation", "issue_tracker", "codeowners"):
        assert manifest.get(key), key
    assert manifest["domain"] == "difm_radio"
    assert manifest["config_flow"] is True
    assert (ROOT / "brand" / "icon.png").is_file()
    assert (INTEGRATION / "brand" / "icon.png").is_file()
    assert (INTEGRATION / "www" / "difm-radio-card.js").is_file()
    assert (INTEGRATION / "services.yaml").is_file()
    assert (INTEGRATION / "translations" / "en.json").is_file()
    assert (ROOT / "LICENSE").is_file()
    assert (ROOT / "CHANGELOG.md").is_file()


def test_clean_install_layout_is_self_contained() -> None:
    required = [
        "__init__.py",
        "manifest.json",
        "config_flow.py",
        "media_player.py",
        "www/difm-radio-card.js",
        "strings.json",
    ]
    for relative in required:
        assert (INTEGRATION / relative).is_file(), relative


def test_card_bundle_does_not_ship_raw_listen_key_parameters() -> None:
    source = (INTEGRATION / "www" / "difm-radio-card.js").read_text(encoding="utf-8")
    assert "custom:difm-radio-card" in source
    assert "listen_key=" not in source or "REDACTED" in source
