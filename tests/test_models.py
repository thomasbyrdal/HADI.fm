"""Tests for catalogue parsing."""

from custom_components.difm_radio.models import (
    Network,
    Station,
    artwork_from_images,
    is_inferred_inactive,
    normalize_artwork_url,
)

from .conftest import DI_CHANNELS, NETWORKS_PAYLOAD


def test_network_from_verified_payload() -> None:
    network = Network.from_api(NETWORKS_PAYLOAD[0])
    assert network is not None
    assert network.key == "di"
    assert network.name == "DI.FM"
    assert network.active is True
    assert network.active_channel_count == 101


def test_network_skips_malformed_payload() -> None:
    assert Network.from_api({"name": "DI.FM"}) is None
    assert Network.from_api({"id": 1, "key": "", "name": "x"}) is None


def test_station_from_verified_payload() -> None:
    station = Station.from_api(DI_CHANNELS[0], "di")
    assert station is not None
    assert station.id == "1"
    assert station.key == "trance"
    assert station.network == "di"
    assert station.item_id == "di:trance"
    assert station.artwork_url == (
        "https://cdn-images.audioaddict.com/4/0/e/f/2/9/"
        "40ef29dd8b6a53f19608325284534e0d.png"
    )
    assert station.inferred_inactive is False


def test_station_inferred_inactive() -> None:
    station = Station.from_api(DI_CHANNELS[2], "di")
    assert station is not None
    assert station.inferred_inactive is True
    assert is_inferred_inactive("XChiptunes") is True
    assert is_inferred_inactive("Trance") is False
    assert is_inferred_inactive("xlower") is False


def test_normalize_artwork_url() -> None:
    assert (
        normalize_artwork_url("//cdn.example/img.png{?size}")
        == "https://cdn.example/img.png"
    )
    assert normalize_artwork_url("https://cdn.example/img.png") == "https://cdn.example/img.png"
    assert normalize_artwork_url("ftp://cdn.example/img.png") is None
    assert artwork_from_images({"compact": "//cdn.example/c.png"}) == "https://cdn.example/c.png"
    assert artwork_from_images("not-a-dict") is None
