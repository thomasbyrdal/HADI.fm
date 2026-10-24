import { DifmRadioCard } from "./card";
import { DifmRadioCardEditor } from "./editor";
import { entitySuggestion } from "./model";

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
    name: "DI.FM favourite stations",
    description: "Speaker dropdown, favourite station icons, and now playing.",
    preview: true,
    documentationURL: "https://github.com/thomasbyrdal/HADI.fm",
    getEntitySuggestion: entitySuggestion,
  });
}
