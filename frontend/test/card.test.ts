import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DifmRadioCard } from "../src/card";
import { createHass, entity, radioEntity } from "./helpers";

describe("DifmRadioCard", () => {
  beforeEach(() => {
    if (!customElements.get("difm-radio-card")) {
      customElements.define("difm-radio-card", DifmRadioCard);
    }
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function mount(hass = createHass(), config: Record<string, unknown> = {}) {
    const card = document.createElement("difm-radio-card") as DifmRadioCard;
    card.setConfig({ entity: "media_player.di_fm_radio", ...config });
    document.body.appendChild(card);
    card.hass = hass;
    return { card, hass };
  }

  it("shows an empty favourite message", () => {
    const hass = createHass({
      "media_player.di_fm_radio": radioEntity({
        attributes: { favourites: [], integration: "difm_radio" },
      }),
    });
    const { card } = mount(hass);
    expect(card.shadowRoot!.textContent).toContain("Add favourite stations");
    expect(card.shadowRoot!.querySelectorAll(".tile")).toHaveLength(0);
  });

  it("renders favourite tiles from entity attributes", () => {
    const { card } = mount();
    const tiles = card.shadowRoot!.querySelectorAll(".tile");
    expect(tiles).toHaveLength(3);
    expect(card.shadowRoot!.textContent).toContain("Trance");
    expect(card.shadowRoot!.textContent).toContain("DI.FM");
    expect(card.shadowRoot!.querySelector(".tile.unavailable")).toBeTruthy();
    expect(card.shadowRoot!.querySelector(".speaker-select")).toBeTruthy();
    expect(card.shadowRoot!.querySelector(".now-playing")).toBeTruthy();
    expect(card.shadowRoot!.textContent).toContain("Select a station");
    expect(card.shadowRoot!.innerHTML).not.toContain("listen_key");
    expect(card.shadowRoot!.innerHTML).not.toContain("prem2.di.fm");
  });

  it("lets the user pick a speaker on the card", async () => {
    const hass = createHass({
      "media_player.kitchen": entity("media_player.kitchen", "idle", {
        friendly_name: "Kitchen",
        volume_level: 0.2,
        supported_features: 4,
      }),
    });
    const { card } = mount(hass);
    const events: unknown[] = [];
    card.addEventListener("config-changed", (event) => {
      events.push((event as CustomEvent).detail.config);
    });
    const select = card.shadowRoot!.querySelector<HTMLSelectElement>(".speaker-select")!;
    expect(select.value).toBe("media_player.living_room");
    expect(select.textContent).toContain("Kitchen");
    select.value = "media_player.kitchen";
    select.dispatchEvent(new Event("change"));
    expect(events.at(-1)).toMatchObject({ media_player: "media_player.kitchen" });
    card.shadowRoot!.querySelector<HTMLButtonElement>('[data-station-id="1"]')!.click();
    await Promise.resolve();
    expect(hass.calls[0]).toEqual({
      domain: "difm_radio",
      service: "play_station",
      data: { station_id: "1", media_player: "media_player.kitchen" },
    });
  });

  it("shows large artwork for the selected station", () => {
    const hass = createHass({
      "media_player.di_fm_radio": radioEntity({
        attributes: {
          station_id: "1",
          media_title: "Trance",
          network: "di",
          owned: true,
        },
      }),
    });
    hass.states["media_player.di_fm_radio"].state = "playing";
    hass.states["media_player.di_fm_radio"].attributes.favourites = radioEntity().attributes.favourites;
    hass.states["media_player.di_fm_radio"].attributes.integration = "difm_radio";
    const { card } = mount(hass);
    expect(card.shadowRoot!.querySelector(".hero-art img")?.getAttribute("src")).toContain("trance.png");
    expect(card.shadowRoot!.querySelector(".now-playing")!.textContent).toContain("Trance");
    expect(card.shadowRoot!.querySelector(".station-select")).toBeNull();
  });

  it("starts playback from a favourite tile and keeps one speaker list", async () => {
    const hass = createHass({
      "media_player.kitchen": entity("media_player.kitchen", "idle", {
        friendly_name: "Kitchen",
        volume_level: 0.2,
        supported_features: 4,
      }),
    });
    const { card } = mount(hass);
    const initial = card.shadowRoot!.querySelectorAll(".speaker-select option").length;
    for (const stationId of ["1", "12", "1", "12"]) {
      card.shadowRoot!.querySelector<HTMLButtonElement>(`[data-station-id="${stationId}"]`)!.click();
      await Promise.resolve();
      hass.states["media_player.di_fm_radio"].state = "playing";
      hass.states["media_player.di_fm_radio"].attributes = {
        ...hass.states["media_player.di_fm_radio"].attributes,
        station_id: stationId,
        owned: true,
      };
      card.hass = hass;
    }
    expect(hass.calls.filter((call) => call.service === "play_station")).toHaveLength(4);
    expect(card.shadowRoot!.querySelectorAll(".speaker-select option").length).toBe(initial);
    expect(initial).toBeGreaterThan(1);
  });

  it("calls play_station when a tile is clicked", async () => {
    const { card, hass } = mount();
    const trance = card.shadowRoot!.querySelector<HTMLButtonElement>('[data-station-id="1"]')!;
    trance.click();
    await Promise.resolve();
    expect(hass.calls[0]).toEqual({
      domain: "difm_radio",
      service: "play_station",
      data: { station_id: "1" },
    });
  });

  it("passes a speaker override to play_station", async () => {
    const { card, hass } = mount(createHass(), { media_player: "media_player.living_room" });
    card.shadowRoot!.querySelector<HTMLButtonElement>('[data-station-id="12"]')!.click();
    await Promise.resolve();
    expect(hass.calls[0].data).toEqual({
      station_id: "12",
      media_player: "media_player.living_room",
    });
  });

  it("ignores a second tap on the station that is already playing", async () => {
    const hass = createHass({
      "media_player.di_fm_radio": radioEntity({
        attributes: {
          station_id: "1",
          media_title: "Trance",
          owned: true,
          network: "di",
        },
      }),
    });
    hass.states["media_player.di_fm_radio"].state = "playing";
    hass.states["media_player.di_fm_radio"].attributes.favourites = radioEntity().attributes.favourites;
    hass.states["media_player.di_fm_radio"].attributes.integration = "difm_radio";
    const { card } = mount(hass);
    card.shadowRoot!.querySelector<HTMLButtonElement>('[data-station-id="1"]')!.click();
    await Promise.resolve();
    expect(hass.calls).toEqual([]);
  });

  it("shows buffering as a loading state and surfaces last_error", () => {
    const hass = createHass({
      "media_player.di_fm_radio": radioEntity({
        attributes: {
          station_id: "1",
          media_title: "Trance",
          last_error: "unsupported_format",
          owned: true,
        },
      }),
    });
    hass.states["media_player.di_fm_radio"].state = "buffering";
    hass.states["media_player.di_fm_radio"].attributes.favourites = radioEntity().attributes.favourites;
    hass.states["media_player.di_fm_radio"].attributes.integration = "difm_radio";
    const { card } = mount(hass);
    expect(card.shadowRoot!.textContent).toContain("Starting");
    expect(card.shadowRoot!.querySelector(".spinner")).toBeTruthy();
    expect(card.shadowRoot!.textContent).toContain("rejected the stream format");
  });

  it("resumes the current station and stops only through the integration service", async () => {
    const hass = createHass({
      "media_player.di_fm_radio": radioEntity({
        attributes: { station_id: "12", media_title: "Ambient", owned: true, network: "di" },
      }),
    });
    hass.states["media_player.di_fm_radio"].attributes.favourites = radioEntity().attributes.favourites;
    hass.states["media_player.di_fm_radio"].attributes.integration = "difm_radio";
    const { card } = mount(hass);
    card.shadowRoot!.querySelector<HTMLButtonElement>(".play")!.click();
    await Promise.resolve();
    card.shadowRoot!.querySelector<HTMLButtonElement>(".stop")!.click();
    await Promise.resolve();
    expect(hass.calls.map((call) => `${call.domain}.${call.service}`)).toEqual([
      "difm_radio.play_station",
      "difm_radio.stop",
    ]);
    expect(hass.calls[0].data).toEqual({ station_id: "12" });
  });

  it("forwards the slider to the actual speaker volume", async () => {
    const { card, hass } = mount();
    const slider = card.shadowRoot!.querySelector<HTMLInputElement>(".vol")!;
    expect(card.shadowRoot!.textContent).toContain("40%");
    slider.value = "80";
    slider.dispatchEvent(new Event("change"));
    await Promise.resolve();
    expect(hass.calls[0]).toEqual({
      domain: "media_player",
      service: "volume_set",
      data: { entity_id: "media_player.living_room", volume_level: 0.8 },
    });
  });

  it("explains when the speaker cannot change volume", () => {
    const hass = createHass({
      "media_player.living_room": {
        entity_id: "media_player.living_room",
        state: "idle",
        attributes: { supported_features: 0 },
      },
    });
    const { card } = mount(hass);
    expect(card.shadowRoot!.querySelector<HTMLElement>(".volume")?.hidden).toBe(true);
    expect(card.shadowRoot!.textContent).toContain("does not support volume control");
  });

  it("shows a service error without leaking URLs", async () => {
    const hass = createHass();
    hass.callService = async () => {
      throw new Error("failed http://prem2.di.fm:80/trance_hi?listen_key=abc");
    };
    const { card } = mount(hass);
    card.shadowRoot!.querySelector<HTMLButtonElement>('[data-station-id="1"]')!.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(card.shadowRoot!.textContent).toContain("[redacted]");
    expect(card.shadowRoot!.textContent).not.toContain("listen_key=abc");
    expect(card.shadowRoot!.textContent).not.toContain("prem2.di.fm");
  });
});
