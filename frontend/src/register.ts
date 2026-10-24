import { DifmRadioCard } from "./card";
import { DifmRadioCardEditor } from "./editor";

if (!customElements.get("difm-radio-card")) {
  customElements.define("difm-radio-card", DifmRadioCard);
}
if (!customElements.get("difm-radio-card-editor")) {
  customElements.define("difm-radio-card-editor", DifmRadioCardEditor);
}

const win = window as Window & {
  customCards?: Array<Record<string, unknown>>;
};
win.customCards = win.customCards || [];
if (!win.customCards.some((card) => card.type === "difm-radio-card")) {
  win.customCards.push({
    type: "difm-radio-card",
    name: "DI.FM Radio",
    description: "Play favourite DI.FM stations on a Home Assistant speaker.",
    preview: true,
    documentationURL: "https://www.di.fm/premium",
  });
}
