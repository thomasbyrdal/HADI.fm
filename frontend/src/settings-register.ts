import { DifmRadioSettings } from "./settings";
import { SETTINGS_ELEMENT } from "./settings-types";

const SETTINGS_VERSION = "0.2.3";

if (!customElements.get(SETTINGS_ELEMENT)) {
  customElements.define(SETTINGS_ELEMENT, DifmRadioSettings);
}

console.info(
  `%c DI.FM Radio settings %c v${SETTINGS_VERSION} `,
  "background:#03a9f4;color:#fff;padding:2px 4px;border-radius:4px 0 0 4px",
  "background:#333;color:#fff;padding:2px 4px;border-radius:0 4px 4px 0",
);
