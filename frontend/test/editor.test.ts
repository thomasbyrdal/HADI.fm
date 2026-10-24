import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DifmRadioCardEditor } from "../src/editor";
import { CARD_TYPE } from "../src/types";
import { createHass } from "./helpers";

describe("DifmRadioCardEditor", () => {
  beforeEach(() => {
    if (!customElements.get("difm-radio-card-editor")) {
      customElements.define("difm-radio-card-editor", DifmRadioCardEditor);
    }
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("emits graphical editor changes without a station list", () => {
    const editor = document.createElement("difm-radio-card-editor") as DifmRadioCardEditor;
    const events: unknown[] = [];
    editor.addEventListener("config-changed", (event) => {
      events.push((event as CustomEvent).detail.config);
    });
    editor.setConfig({ type: CARD_TYPE, entity: "media_player.di_fm_radio" });
    document.body.appendChild(editor);
    editor.hass = createHass();

    editor.shadowRoot!.querySelector<HTMLInputElement>("#show_names")!.checked = false;
    editor.shadowRoot!.querySelector<HTMLInputElement>("#show_names")!.dispatchEvent(new Event("change"));
    editor.shadowRoot!.querySelector<HTMLInputElement>("#columns")!.value = "3";
    editor.shadowRoot!.querySelector<HTMLInputElement>("#columns")!.dispatchEvent(new Event("change"));

    expect(events.at(-1)).toMatchObject({
      type: CARD_TYPE,
      entity: "media_player.di_fm_radio",
      show_names: false,
      columns: 3,
    });
    expect(JSON.stringify(events.at(-1))).not.toContain("favourites");
    expect(JSON.stringify(events.at(-1))).not.toContain("listen_key");
  });
});
