import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearArtworkCache } from "../src/artwork-cache";
import { DifmRadioSettings } from "../src/settings";
import { GRID_COLUMNS, SETTINGS_ELEMENT } from "../src/settings-types";

if (!customElements.get(SETTINGS_ELEMENT)) {
  customElements.define(SETTINGS_ELEMENT, DifmRadioSettings);
}

function configPayload() {
  return {
    default_media_player: "media_player.kitchen",
    stream_quality: "premium_high",
    listen_key: "stored-listen-key",
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
    clearArtworkCache();
  });

  it("uses five-column grids", () => {
    expect(GRID_COLUMNS).toBe(5);
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
    expect((el.querySelector("input[name='listen_key']") as HTMLInputElement).value).toBe(
      "stored-listen-key",
    );
    const save = el.querySelector("[data-action='save']") as HTMLButtonElement;
    expect(save.disabled).toBe(true);

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
    expect((el.querySelector("[data-action='save']") as HTMLButtonElement).disabled).toBe(false);

    const listenKey = el.querySelector("input[name='listen_key']") as HTMLInputElement;
    listenKey.value = "changed-key";
    listenKey.dispatchEvent(new Event("input", { bubbles: true }));
    expect((el.querySelector("[data-action='save']") as HTMLButtonElement).disabled).toBe(false);

    callWS.mockResolvedValueOnce({
      default_media_player: "media_player.kitchen",
      stream_quality: "premium_high",
      listen_key: "changed-key",
      favourites: [
        configPayload().stations[0],
        configPayload().stations[1],
      ],
    });
    (el.querySelector("[data-action='save']") as HTMLButtonElement).click();
    await vi.waitFor(() => {
      expect(callWS).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "difm_radio/set_config",
          listen_key: "changed-key",
          favourites: ["1", "2"],
        }),
      );
    });
  });

  it("does not redraw the DOM on every hass update or reattach", async () => {
    const callWS = vi.fn().mockResolvedValue(configPayload());
    const el = document.createElement(SETTINGS_ELEMENT) as DifmRadioSettings;
    document.body.appendChild(el);
    el.hass = { states: {}, callWS };

    await vi.waitFor(() => {
      expect(el.querySelector(".grid .tile")).toBeTruthy();
    });

    const tile = el.querySelector(".grid .tile");
    const listen = el.querySelector("input[name='listen_key']") as HTMLInputElement;
    expect(listen.value).toBe("stored-listen-key");

    el.hass = { states: { "sensor.tick": { entity_id: "sensor.tick", state: "1", attributes: {} } }, callWS };
    el.disconnectedCallback();
    el.connectedCallback();
    el.hass = { states: { "sensor.tick": { entity_id: "sensor.tick", state: "2", attributes: {} } }, callWS };

    expect(el.querySelector(".grid .tile")).toBe(tile);
    expect((el.querySelector("input[name='listen_key']") as HTMLInputElement).value).toBe(
      "stored-listen-key",
    );
    expect(callWS).toHaveBeenCalledTimes(1);
  });

  it("shows websocket error messages instead of [object Object]", async () => {
    const callWS = vi
      .fn()
      .mockResolvedValueOnce(configPayload())
      .mockRejectedValueOnce({ code: "invalid_auth", message: "The listen key was rejected" });
    const el = document.createElement(SETTINGS_ELEMENT) as DifmRadioSettings;
    document.body.appendChild(el);
    el.hass = { states: {}, callWS };

    await vi.waitFor(() => {
      expect(el.querySelector("input[name='listen_key']")).toBeTruthy();
    });

    const listenKey = el.querySelector("input[name='listen_key']") as HTMLInputElement;
    listenKey.value = "bad-key";
    listenKey.dispatchEvent(new Event("input", { bubbles: true }));
    (el.querySelector("[data-action='save']") as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(el.querySelector(".error")?.textContent).toContain("The listen key was rejected");
    });
    expect(el.querySelector(".error")?.textContent).not.toContain("[object Object]");
  });
});
