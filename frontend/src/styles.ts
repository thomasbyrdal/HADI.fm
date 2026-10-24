export const CARD_STYLES = `
:host {
  display: block;
}
[hidden] {
  display: none !important;
}
.card {
  background: var(--ha-card-background, var(--card-background-color, #fff));
  color: var(--primary-text-color, #212121);
  border-radius: var(--ha-card-border-radius, 12px);
  border: var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--divider-color, #e0e0e0));
  box-shadow: var(--ha-card-box-shadow, none);
  padding: 16px;
  overflow: hidden;
}
.header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.title {
  font: var(--ha-card-header-font-size, 18px) / 1.3 var(--ha-card-header-font-family, var(--ha-font-family-body, sans-serif));
  font-weight: 500;
}
.state {
  color: var(--secondary-text-color, #727272);
  font-size: 13px;
}
.error {
  background: color-mix(in srgb, var(--error-color, #db4437) 12%, transparent);
  color: var(--error-color, #db4437);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 12px;
  font-size: 13px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--tile-min, 88px), 1fr));
  gap: 8px;
}
.grid.fixed {
  grid-template-columns: repeat(var(--columns, 4), minmax(0, 1fr));
}
.tile {
  appearance: none;
  border: 1px solid var(--divider-color, #e0e0e0);
  background: var(--secondary-background-color, transparent);
  color: inherit;
  border-radius: 10px;
  padding: 8px 6px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  position: relative;
  min-height: 88px;
}
.tile:focus-visible {
  outline: 2px solid var(--primary-color, #03a9f4);
  outline-offset: 2px;
}
.tile[aria-pressed="true"] {
  border-color: var(--state-active-color, var(--primary-color, #03a9f4));
  box-shadow: inset 0 0 0 1px var(--state-active-color, var(--primary-color, #03a9f4));
}
.tile.unavailable,
.tile:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.art {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--disabled-color, #9e9e9e);
  display: grid;
  place-items: center;
}
.art img,
.art svg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.art svg {
  padding: 12px;
  box-sizing: border-box;
  fill: var(--card-background-color, #fff);
}
.name,
.service {
  width: 100%;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name {
  font-size: 12px;
  font-weight: 500;
}
.service {
  font-size: 11px;
  color: var(--secondary-text-color, #727272);
}
.spinner {
  position: absolute;
  inset: 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--card-background-color, #fff) 55%, transparent);
  display: grid;
  place-items: center;
}
.spinner::after {
  content: "";
  width: 18px;
  height: 18px;
  border: 2px solid var(--primary-color, #03a9f4);
  border-right-color: transparent;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.empty {
  color: var(--secondary-text-color, #727272);
  font-size: 13px;
  padding: 8px 0 12px;
}
.speaker {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
}
.speaker label {
  font-size: 13px;
  font-weight: 500;
}
.speaker-select {
  width: 100%;
  font: inherit;
  color: var(--primary-text-color, #212121);
  background: var(--mdc-text-field-fill-color, var(--secondary-background-color, #f5f5f5));
  border: 1px solid var(--divider-color, #e0e0e0);
  border-radius: 8px;
  padding: 10px 12px;
}
.now-playing {
  display: grid;
  grid-template-columns: 168px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--divider-color, #e0e0e0);
}
.hero-art {
  width: 168px;
  height: 168px;
  border-radius: 14px;
  overflow: hidden;
  background: var(--secondary-background-color, #eee);
  display: grid;
  place-items: center;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--primary-text-color, #000) 12%, transparent);
}
.hero-art img,
.hero-art svg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hero-art.placeholder svg,
.hero-art svg {
  padding: 36px;
  box-sizing: border-box;
  fill: var(--secondary-text-color, #727272);
}
.hero-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.now-name {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.now-meta {
  color: var(--secondary-text-color, #727272);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.buttons {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  margin-top: 4px;
}
.icon-button {
  appearance: none;
  width: 48px;
  height: 48px;
  border-radius: 24px;
  border: 1px solid var(--divider-color, #e0e0e0);
  background: var(--secondary-background-color, transparent);
  color: var(--primary-text-color, #212121);
  display: grid;
  place-items: center;
  cursor: pointer;
}
.icon-button.play {
  background: var(--primary-color, #03a9f4);
  border-color: var(--primary-color, #03a9f4);
  color: var(--text-primary-color, #fff);
}
.icon-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.icon-button svg {
  width: 22px;
  height: 22px;
  fill: currentColor;
}
.volume {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}
.volume input {
  flex: 1;
  accent-color: var(--primary-color, #03a9f4);
}
.vol-label {
  width: 3.2em;
  text-align: right;
  font-size: 12px;
  color: var(--secondary-text-color, #727272);
}
.volume-hint {
  margin-top: 4px;
  font-size: 12px;
  color: var(--secondary-text-color, #727272);
}
@media (max-width: 520px) {
  .now-playing {
    grid-template-columns: 1fr;
    justify-items: center;
    text-align: center;
  }
  .hero-body {
    width: 100%;
    align-items: center;
  }
  .buttons {
    justify-content: center;
  }
  .volume {
    width: 100%;
  }
  .grid.fixed {
    grid-template-columns: repeat(min(2, var(--columns, 2)), minmax(0, 1fr));
  }
  .card {
    padding: 12px;
  }
}
`;

export const EDITOR_STYLES = `
:host {
  display: block;
  padding: 4px 0 8px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 14px;
}
label {
  color: var(--primary-text-color, #212121);
  font-size: 14px;
  font-weight: 500;
}
.hint {
  color: var(--secondary-text-color, #727272);
  font-size: 12px;
}
input, select {
  font: inherit;
  color: var(--primary-text-color, #212121);
  background: var(--mdc-text-field-fill-color, var(--secondary-background-color, #f5f5f5));
  border: 1px solid var(--divider-color, #e0e0e0);
  border-radius: 8px;
  padding: 10px 12px;
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
`;
