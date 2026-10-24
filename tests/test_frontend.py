"""Tests for Lovelace card packaging. The card itself is covered by Vitest."""

from __future__ import annotations

from custom_components.difm_radio.frontend import (
    card_module_url,
    card_resource_path,
    is_our_card_resource,
    www_path,
)


def test_card_bundle_is_packaged_and_has_no_listen_key() -> None:
    path = www_path() / "difm-radio-card.js"
    assert path.is_file()
    source = path.read_text(encoding="utf-8")
    assert "custom:difm-radio-card" in source
    assert "play_station" in source
    assert "difm_radio" in source
    assert "listen_key=REDACTED" in source or "listen_key=" not in source


def test_card_module_url_is_versioned() -> None:
    assert card_resource_path() == "/difm_radio/difm-radio-card.js"
    assert card_module_url().startswith("/difm_radio/difm-radio-card.js?v=")
    assert is_our_card_resource("/difm_radio/difm-radio-card.js?v=0.1.4")
    assert not is_our_card_resource("/local/community/di-fm-player-card.js")
    assert not is_our_card_resource("/www/di-fm-player-card.js")
