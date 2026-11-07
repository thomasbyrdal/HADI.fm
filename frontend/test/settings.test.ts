import { beforeEach, describe, expect, it, vi } from "vitest";
import { DifmRadioSettings } from "../src/settings";
import { SETTINGS_ELEMENT } from "../src/settings-types";

if (!customElements.get(SETTINGS_ELEMENT)) {
  customElements.define(SETTINGS_ELEMENT, DifmRadioSettings);
}

function configPayload() {
  return {
    default_media_player: "media_player.kitchen",
    stream_quality: "premium_high",
    qualities: [{ value: "premium_high", label: "MP3 320" }],
    media_players: [{ entity_id: "media_player.kitchen", name: "Kitchen" }],
    networks: [
      { key: "di", name: "DI.FM" },
      { key: "jazzradio", name: "JAZZRADIO.com" },
    ],
    stations: [
      {
        id: "1",
        name: "Trance",
        network: "di",
        key: "trance",
        artwork_url: "https://cdn.example/trance.jpg",
        available: true,
      },
      {
        id: "2",
        name: "House",
        network: "di",
        key: "house",
        artwork_url: "https://cdn.example/house.jpg",
        available: true,
      },
      {
        id: "9",
        name: "Smooth Jazz",
        network: "jazzradio",
        key: "smoothjazz",
        artwork_url: "https://cdn.example/smooth.jpg",
        available: true,
      },
    ],
    favourites: [
      {
        id: "1",
        name: "Trance",
        network: "di",
        key: "trance",
        artwork_url: "https://cdn.example/trance.jpg",
        available: true,
      },
    ],
  };
}

describe("difm-radio-settings", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders favourites grid and add dialog with service filter", async () => {
    const callWS = vi.fn().mockResolvedValue(configPayload());
    const el = document.createElement(SETTINGS_ELEMENT) as DifmRadioSettings;
    document.body.appendChild(el);
    el.hass = { states: {}, callWS };

    await vi.waitFor(() => {
      expect(el.querySelector(".grid .tile")).toBeTruthy();
    });

    expect(el.querySelectorAll(".content > .section:last-of-type .tile").length).toBe(1);
    expect(el.querySelector("[data-action='open-add']")).toBeTruthy();

    (el.querySelector("[data-action='open-add']") as HTMLButtonElement).click();
    expect(el.querySelector(".dialog")).toBeTruthy();
    expect((el.querySelector("select[name='network']") as HTMLSelectElement).value).toBe("di");

    const columns = el.querySelectorAll(".dialog-columns > div");
    expect(columns[0].querySelectorAll(".tile").length).toBe(1); // House; Trance already selected
    expect(columns[1].querySelectorAll(".tile").length).toBe(1);

    (columns[0].querySelector("[data-action='add-station']") as HTMLElement).click();
    const columnsAfter = el.querySelectorAll(".dialog-columns > div");
    expect(columnsAfter[1].querySelectorAll(".tile").length).toBe(2);

    (el.querySelector("[data-action='apply-add']") as HTMLButtonElement).click();
    expect(el.querySelector(".dialog")).toBeFalsy();
    expect(el.querySelectorAll(".content > .section:last-of-type .tile").length).toBe(2);
  });
});
