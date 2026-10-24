import { describe, expect, it } from "vitest";
import {
  cardSize,
  deriveView,
  entitySuggestion,
  errorMessage,
  findRadioEntity,
  listSpeakers,
  normalizeConfig,
  resolveRadioEntity,
  parseFavourites,
  playServiceData,
  sanitizeError,
  shouldIgnoreTap,
} from "../src/model";
import { CARD_TYPE } from "../src/types";
import { createHass, entity, radioEntity } from "./helpers";

describe("normalizeConfig", () => {
  it("applies defaults and rejects invalid config", () => {
    expect(normalizeConfig({})).toMatchObject({
      type: CARD_TYPE,
      entity: "",
      columns: 0,
      show_names: true,
      show_service_labels: true,
      show_volume: true,
      title: "DI.FM Radio",
    });
    expect(normalizeConfig({ columns: 12, show_names: false }).columns).toBe(8);
    expect(() => normalizeConfig(null)).toThrow("Invalid configuration");
  });
});

describe("listSpeakers", () => {
  it("lists each speaker once and skips the radio entity", () => {
    const hass = createHass({
      "media_player.kitchen": entity("media_player.kitchen", "idle", { friendly_name: "Kitchen" }),
    });
    const speakers = listSpeakers(hass, "media_player.di_fm_radio", "media_player.living_room");
    const ids = speakers.map((item) => item.id);
    expect(ids).toEqual(["media_player.kitchen", "media_player.living_room"]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain("media_player.di_fm_radio");
  });
});

describe("entitySuggestion", () => {
  it("suggests the favourite card only for the radio entity", () => {
    const hass = createHass();
    expect(entitySuggestion(hass, "media_player.living_room")).toBeNull();
    expect(entitySuggestion(hass, "media_player.di_fm_radio")).toEqual({
      label: "Favourite stations",
      config: { type: CARD_TYPE, entity: "media_player.di_fm_radio" },
    });
  });
});

describe("findRadioEntity", () => {
  it("prefers the integration attribute", () => {
    const hass = createHass();
    hass.states["media_player.other"] = entity("media_player.other", "idle", {});
    expect(findRadioEntity(hass)).toBe("media_player.di_fm_radio");
  });

  it("falls back to the radio entity when the card points at a speaker", () => {
    const hass = createHass();
    const config = normalizeConfig({ entity: "media_player.living_room" });
    expect(resolveRadioEntity(hass, config)).toBe("media_player.di_fm_radio");
    const view = deriveView(hass, config);
    expect(view.entityId).toBe("media_player.di_fm_radio");
    expect(view.favourites).toHaveLength(3);
  });
});

describe("parseFavourites and deriveView", () => {
  it("keeps catalogue order and drops unsafe artwork", () => {
    const tiles = parseFavourites([
      { id: "1", name: "Trance", network: "di", artwork_url: "http://insecure.example/x.png" },
      { id: "1", name: "dup" },
      { bad: true },
    ]);
    expect(tiles).toHaveLength(1);
    expect(tiles[0].artwork_url).toBeNull();
  });

  it("maps playback state, volume, and errors from the logical player", () => {
    const hass = createHass({
      "media_player.di_fm_radio": radioEntity({
        attributes: {
          station_id: "1",
          network: "di",
          media_title: "Trance",
          owned: true,
          last_error: "playback_failed",
          speaker_entity_id: "media_player.living_room",
        },
      }),
    });
    hass.states["media_player.di_fm_radio"].state = "playing";
    hass.states["media_player.di_fm_radio"].attributes.favourites = radioEntity().attributes.favourites;
    hass.states["media_player.di_fm_radio"].attributes.integration = "difm_radio";
    const view = deriveView(hass, normalizeConfig({ entity: "media_player.di_fm_radio" }));
    expect(view.playing).toBe(true);
    expect(view.stationName).toBe("Trance");
    expect(view.networkLabel).toBe("DI.FM");
    expect(view.lastError).toBe("The speaker could not start the stream.");
    expect(view.volume.supported).toBe(true);
    expect(view.volume.level).toBe(0.4);
    expect(view.volume.entityId).toBe("media_player.living_room");
    expect(view.stationArtwork).toContain("trance.png");
    expect(view.speakers.map((item) => item.id)).toEqual(["media_player.living_room"]);
  });

  it("hides volume when the speaker cannot set it", () => {
    const hass = createHass({
      "media_player.kitchen": entity("media_player.kitchen", "idle", { supported_features: 0 }),
    });
    const view = deriveView(
      hass,
      normalizeConfig({ entity: "media_player.di_fm_radio", media_player: "media_player.kitchen" }),
    );
    expect(view.volume.supported).toBe(false);
    expect(view.speakerEntityId).toBe("media_player.kitchen");
  });
});

describe("helpers", () => {
  it("sanitizes secrets and URLs from errors", () => {
    expect(sanitizeError("failed http://prem2.di.fm:80/trance_hi?listen_key=abc")).toContain("[redacted]");
    expect(sanitizeError("listen_key=super-secret")).toBe("listen_key=REDACTED");
    expect(errorMessage("speaker_missing")).toMatch(/speaker/i);
  });

  it("ignores duplicate and in-flight taps", () => {
    expect(shouldIgnoreTap("1", 0, 1000, "1", null, false)).toBe(true);
    expect(shouldIgnoreTap(null, 900, 1000, "1", "1", false)).toBe(true);
    expect(shouldIgnoreTap(null, 0, 1000, "1", "1", true)).toBe(true);
    expect(shouldIgnoreTap(null, 0, 1000, "12", "1", true)).toBe(false);
    expect(shouldIgnoreTap("1", 0, 1000, "12", "1", true)).toBe(false);
  });

  it("builds play service data with an optional speaker override", () => {
    expect(playServiceData("1", "")).toEqual({ station_id: "1" });
    expect(playServiceData("1", "media_player.kitchen")).toEqual({
      station_id: "1",
      media_player: "media_player.kitchen",
    });
  });

  it("sizes the card from the favourite grid", () => {
    expect(cardSize(8, 4)).toBe(6);
    expect(cardSize(0, 0)).toBe(5);
  });
});
