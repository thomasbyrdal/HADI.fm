import { GRID_COLUMNS, GRID_VISIBLE_ROWS } from "./settings-types";

/** Tile size used to size the scroll viewport to roughly GRID_VISIBLE_ROWS. */
const TILE_PX = 84;
const GAP_PX = 8;

export const SETTINGS_STYLES = `
:host {
  display: block;
  height: 100%;
  background: var(--primary-background-color, #fafafa);
  color: var(--primary-text-color, #212121);
  --settings-tile: ${TILE_PX}px;
  --settings-gap: ${GAP_PX}px;
  --settings-cols: ${GRID_COLUMNS};
  --settings-rows: ${GRID_VISIBLE_ROWS};
}
[hidden] {
  display: none !important;
}
.shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--app-header-background-color, var(--primary-color, #03a9f4));
  color: var(--app-header-text-color, #fff);
  min-height: 56px;
  box-sizing: border-box;
}
.header h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 500;
  flex: 1;
}
.content {
  flex: 1;
  overflow: auto;
  padding: 16px;
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}
.section {
  margin-bottom: 24px;
}
.section h2 {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 500;
}
.hint {
  margin: 0 0 12px;
  color: var(--secondary-text-color, #727272);
  font-size: 13px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  max-width: 420px;
}
.field label {
  font-size: 13px;
  color: var(--secondary-text-color, #727272);
}
.field select {
  appearance: none;
  border: 1px solid var(--divider-color, #e0e0e0);
  background: var(--card-background-color, #fff);
  color: inherit;
  border-radius: 8px;
  padding: 10px 12px;
  font: inherit;
}
.grid-scroll {
  border: 1px solid var(--divider-color, #e0e0e0);
  border-radius: 12px;
  background: var(--card-background-color, #fff);
  padding: 8px;
  max-height: calc(
    var(--settings-rows) * var(--settings-tile) + (var(--settings-rows) - 1) * var(--settings-gap) + 16px
  );
  overflow-y: auto;
  overflow-x: hidden;
}
.grid {
  display: grid;
  grid-template-columns: repeat(var(--settings-cols), minmax(0, 1fr));
  gap: var(--settings-gap);
}
.tile {
  position: relative;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
  background: var(--secondary-background-color, #eee);
  border: 1px solid var(--divider-color, #e0e0e0);
  cursor: pointer;
  padding: 0;
  min-height: 0;
  height: var(--settings-tile);
}
.tile:focus-visible {
  outline: 2px solid var(--primary-color, #03a9f4);
  outline-offset: 2px;
}
.tile img,
.tile .placeholder {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.tile .placeholder {
  display: grid;
  place-items: center;
  font-size: 11px;
  text-align: center;
  padding: 4px;
  box-sizing: border-box;
  color: var(--secondary-text-color, #727272);
}
.tile.unavailable {
  opacity: 0.45;
}
.tile.selected {
  box-shadow: inset 0 0 0 2px var(--primary-color, #03a9f4);
}
.minus {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  padding: 0;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--error-color, #db4437) 92%, #000);
  color: #fff;
  cursor: pointer;
  z-index: 1;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
.minus svg {
  width: 14px;
  height: 14px;
  fill: currentColor;
}
.minus:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 1px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
button.primary,
button.secondary {
  appearance: none;
  border-radius: 8px;
  padding: 10px 14px;
  font: inherit;
  cursor: pointer;
  border: 1px solid transparent;
}
button.primary {
  background: var(--primary-color, #03a9f4);
  color: var(--text-primary-color, #fff);
}
button.secondary {
  background: var(--secondary-background-color, transparent);
  color: inherit;
  border-color: var(--divider-color, #e0e0e0);
}
button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.error {
  background: color-mix(in srgb, var(--error-color, #db4437) 12%, transparent);
  color: var(--error-color, #db4437);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 12px;
  font-size: 13px;
}
.status {
  color: var(--success-color, #43a047);
  font-size: 13px;
  margin-bottom: 12px;
}
.empty {
  padding: 24px 12px;
  text-align: center;
  color: var(--secondary-text-color, #727272);
  font-size: 13px;
}
.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
  box-sizing: border-box;
}
.dialog {
  background: var(--card-background-color, #fff);
  color: var(--primary-text-color, #212121);
  border-radius: 12px;
  width: min(920px, 100%);
  max-height: min(90vh, 860px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
}
.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--divider-color, #e0e0e0);
}
.dialog-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
}
.dialog-body {
  padding: 16px;
  overflow: auto;
  flex: 1;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--divider-color, #e0e0e0);
}
.dialog-columns {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
@media (min-width: 720px) {
  .dialog-columns {
    grid-template-columns: 1fr 1fr;
  }
}
.close-x {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  padding: 4px 8px;
}
`;

export const ICON_MINUS = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 13H5v-2h14v2z"/></svg>`;
