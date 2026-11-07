"""Tests for Lovelace card packaging. The card itself is covered by Vitest."""

from __future__ import annotations

from custom_components.difm_radio.frontend import (
    card_module_url,
    card_resource_path,
    is_our_card_resource,
    www_path,
)


def test_card_loader_and_bundle_are_packaged() -> None:
    loader = www_path() / "difm-radio-card.js"
    bundle = www_path() / "difm-radio-card.bundle.js"
    assert loader.is_file()
    assert bundle.is_file()
    loader_source = loader.read_text(encoding="utf-8")
    bundle_source = bundle.read_text(encoding="utf-8")
    assert "difm-radio-card.bundle.js" in loader_source
    assert "home-assistant" in loader_source
    assert "custom:difm-radio-card" in bundle_source
    assert "play_station" in bundle_source
    assert "difm_radio" in bundle_source
    assert "listen_key=REDACTED" in bundle_source or "listen_key=" not in bundle_source


def test_card_module_url_is_versioned() -> None:
    assert card_resource_path() == "/difm_radio/difm-radio-card.js"
    assert card_module_url().startswith("/difm_radio/difm-radio-card.js?v=")
    assert is_our_card_resource("/difm_radio/difm-radio-card.js?v=0.1.4")
    assert not is_our_card_resource("/local/community/di-fm-player-card.js")
    assert not is_our_card_resource("/www/di-fm-player-card.js")
    assert not is_our_card_resource("/difm_radio/difm-radio-card.bundle.js")
