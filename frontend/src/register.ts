import { DifmRadioCard } from "./card";
import { defineCardElement, ensureDefinedAfterFrontend } from "./define";
import { DifmRadioCardEditor } from "./editor";
import { entitySuggestion } from "./model";

const CARD_VERSION = "0.2.5";
const CARD_TAG = "difm-radio-card";
const EDITOR_TAG = "difm-radio-card-editor";

defineCardElement(CARD_TAG, DifmRadioCard);
defineCardElement(EDITOR_TAG, DifmRadioCardEditor);
ensureDefinedAfterFrontend(CARD_TAG, DifmRadioCard);
ensureDefinedAfterFrontend(EDITOR_TAG, DifmRadioCardEditor);

const win = window as Window & {
  customCards?: Array<Record<string, unknown>>;
};
win.customCards = win.customCards || [];
if (!win.customCards.some((card) => card.type === CARD_TAG)) {
  win.customCards.push({
    type: CARD_TAG,
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
