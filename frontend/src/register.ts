import { DifmRadioCard } from "./card";
import { DifmRadioCardEditor } from "./editor";
import { entitySuggestion } from "./model";

const CARD_VERSION = "0.1.9";

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

console.info(
  `%c DI.FM Radio card %c v${CARD_VERSION} `,
  "background:#03a9f4;color:#fff;padding:2px 4px;border-radius:4px 0 0 4px",
  "background:#333;color:#fff;padding:2px 4px;border-radius:0 4px 4px 0",
);
