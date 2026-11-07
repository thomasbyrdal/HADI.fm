// src/settings-types.ts
var SETTINGS_ELEMENT = "difm-radio-settings";
var WS_GET_CONFIG = "difm_radio/get_config";
var WS_SET_CONFIG = "difm_radio/set_config";
var GRID_COLUMNS = 6;
var GRID_VISIBLE_ROWS = 6;

// src/settings-styles.ts
var TILE_PX = 84;
var GAP_PX = 8;
var SETTINGS_STYLES = `
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
var ICON_MINUS = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 13H5v-2h14v2z"/></svg>`;

// src/settings.ts
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function stationById(stations, id) {
  return stations.find((item) => item.id === id);
}
var DifmRadioSettings = class extends HTMLElement {
  _hass = null;
  _narrow = false;
  _panel = null;
  _loaded = false;
  _loading = false;
  _saving = false;
  _error = null;
  _status = null;
  _config = null;
  _speaker = "";
  _quality = "";
  _favouriteIds = [];
  _addOpen = false;
  _networkKey = "";
  _pendingIds = [];
  _bound = false;
  set hass(hass) {
    this._hass = hass;
    if (!this._loaded && !this._loading) {
      void this._load();
    } else {
      this._render();
    }
  }
  set narrow(narrow) {
    this._narrow = Boolean(narrow);
    this._render();
  }
  set panel(panel) {
    this._panel = panel;
    this._render();
  }
  connectedCallback() {
    if (!this._bound) {
      this._bound = true;
      this.addEventListener("click", this._onClick);
      this.addEventListener("change", this._onChange);
    }
    if (this._hass && !this._loaded && !this._loading) {
      void this._load();
    } else {
      this._render();
    }
  }
  disconnectedCallback() {
    if (this._bound) {
      this.removeEventListener("click", this._onClick);
      this.removeEventListener("change", this._onChange);
      this._bound = false;
    }
  }
  _onClick = (event) => {
    const target = event.target;
    if (!target) {
      return;
    }
    if (target.closest(".dialog") && !target.closest("[data-action='close-add']")) {
      event.stopPropagation();
    }
    const actionEl = target.closest("[data-action]");
    if (!actionEl || actionEl.dataset.action === "dialog-root") {
      return;
    }
    const action = actionEl.dataset.action;
    const id = actionEl.dataset.id || "";
    if (action === "close-add" && actionEl.classList.contains("dialog-backdrop")) {
      if (target !== actionEl) {
        return;
      }
    }
    event.preventDefault();
    event.stopPropagation();
    switch (action) {
      case "remove-favourite":
        this._favouriteIds = this._favouriteIds.filter((item) => item !== id);
        this._status = null;
        this._render();
        break;
      case "open-add":
        this._openAddDialog();
        break;
      case "close-add":
        this._addOpen = false;
        this._render();
        break;
      case "apply-add":
        this._favouriteIds = [...this._pendingIds];
        this._addOpen = false;
        this._status = null;
        this._render();
        break;
      case "add-station":
        if (id && !this._pendingIds.includes(id)) {
          this._pendingIds = [...this._pendingIds, id];
          this._render();
        }
        break;
      case "remove-pending":
        this._pendingIds = this._pendingIds.filter((item) => item !== id);
        this._render();
        break;
      case "save":
        void this._save();
        break;
      case "reload":
        void this._load();
        break;
      default:
        break;
    }
  };
  _onChange = (event) => {
    const target = event.target;
    if (!target || !target.name) {
      return;
    }
    if (target.name === "speaker") {
      this._speaker = target.value;
      this._status = null;
    } else if (target.name === "quality") {
      this._quality = target.value;
      this._status = null;
    } else if (target.name === "network") {
      this._networkKey = target.value;
      this._render();
      return;
    }
    this._render();
  };
  _openAddDialog() {
    const networks = this._config?.networks ?? [];
    this._pendingIds = [...this._favouriteIds];
    this._networkKey = this._networkKey || networks[0]?.key || this._config?.stations[0]?.network || "";
    this._addOpen = true;
    this._render();
  }
  async _load() {
    if (!this._hass || this._loading) {
      return;
    }
    this._loading = true;
    this._error = null;
    this._status = null;
    this._render();
    try {
      const data = await this._hass.callWS({ type: WS_GET_CONFIG });
      this._config = data;
      this._speaker = data.default_media_player || data.media_players[0]?.entity_id || "";
      this._quality = data.stream_quality || data.qualities[0]?.value || "";
      this._favouriteIds = data.favourites.map((item) => item.id);
      this._networkKey = data.networks[0]?.key || data.stations[0]?.network || "";
      this._loaded = true;
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._loading = false;
      this._render();
    }
  }
  async _save() {
    if (!this._hass || this._saving) {
      return;
    }
    if (!this._speaker) {
      this._error = "Choose a default speaker.";
      this._render();
      return;
    }
    if (!this._favouriteIds.length) {
      this._error = "Select at least one favourite station.";
      this._render();
      return;
    }
    this._saving = true;
    this._error = null;
    this._status = null;
    this._render();
    try {
      const result = await this._hass.callWS({
        type: WS_SET_CONFIG,
        default_media_player: this._speaker,
        stream_quality: this._quality,
        favourites: this._favouriteIds
      });
      if (this._config) {
        this._config = {
          ...this._config,
          default_media_player: result.default_media_player,
          stream_quality: result.stream_quality,
          favourites: result.favourites
        };
      }
      this._favouriteIds = result.favourites.map((item) => item.id);
      this._status = "Settings saved.";
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._saving = false;
      this._render();
    }
  }
  _resolvedFavourites() {
    const catalogue = this._config?.stations ?? [];
    const known = this._config?.favourites ?? [];
    return this._favouriteIds.map((id) => stationById(known, id) || stationById(catalogue, id)).filter((item) => Boolean(item));
  }
  _pendingStations() {
    const catalogue = this._config?.stations ?? [];
    const known = this._config?.favourites ?? [];
    return this._pendingIds.map((id) => stationById(known, id) || stationById(catalogue, id)).filter((item) => Boolean(item));
  }
  _networkStations() {
    const key = this._networkKey;
    const pending = new Set(this._pendingIds);
    return (this._config?.stations ?? []).filter(
      (station) => station.network === key && !pending.has(station.id)
    );
  }
  _renderTile(station, options) {
    const art = station.artwork_url ? `<img src="${escapeHtml(station.artwork_url)}" alt="" loading="lazy" />` : `<div class="placeholder">${escapeHtml(station.name)}</div>`;
    const selectAttrs = options.selectAction ? `data-action="${options.selectAction}" data-id="${escapeHtml(station.id)}"` : "";
    const selectedClass = options.selected ? " selected" : "";
    const unavailable = station.available ? "" : " unavailable";
    const minus = options.removeAction ? `<button
          type="button"
          class="minus"
          data-action="${options.removeAction}"
          data-id="${escapeHtml(station.id)}"
          aria-label="Remove ${escapeHtml(station.name)}"
        >${ICON_MINUS}</button>` : "";
    return `
      <div class="tile${selectedClass}${unavailable}" title="${escapeHtml(station.name)}" ${selectAttrs}>
        ${art}
        ${minus}
      </div>
    `;
  }
  _renderGrid(stations, emptyText, options) {
    if (!stations.length) {
      return `<div class="grid-scroll"><div class="empty">${escapeHtml(emptyText)}</div></div>`;
    }
    return `
      <div class="grid-scroll">
        <div class="grid">
          ${stations.map((station) => this._renderTile(station, options)).join("")}
        </div>
      </div>
    `;
  }
  _render() {
    if (!this.isConnected) {
      return;
    }
    const favourites = this._resolvedFavourites();
    const networks = this._config?.networks ?? [];
    const qualities = this._config?.qualities ?? [];
    const players = this._config?.media_players ?? [];
    this.innerHTML = `
      <style>${SETTINGS_STYLES}</style>
      <div class="shell">
        <div class="header">
          <h1>DI.FM Radio</h1>
        </div>
        <div class="content">
          ${this._error ? `<div class="error">${escapeHtml(this._error)}</div>` : ""}
          ${this._status ? `<div class="status">${escapeHtml(this._status)}</div>` : ""}
          ${this._loading || !this._loaded ? `<p class="hint">${this._loading ? "Loading settings\u2026" : "Waiting for Home Assistant\u2026"}</p>` : `
            <div class="section">
              <h2>Playback</h2>
              <p class="hint">Default speaker and stream quality used when you tap a favourite.</p>
              <div class="field">
                <label for="speaker">Default speaker</label>
                <select id="speaker" name="speaker">
                  ${players.map(
      (player) => `<option value="${escapeHtml(player.entity_id)}" ${player.entity_id === this._speaker ? "selected" : ""}>${escapeHtml(player.name)}</option>`
    ).join("")}
                </select>
              </div>
              <div class="field">
                <label for="quality">Stream quality</label>
                <select id="quality" name="quality">
                  ${qualities.map(
      (item) => `<option value="${escapeHtml(item.value)}" ${item.value === this._quality ? "selected" : ""}>${escapeHtml(item.label)}</option>`
    ).join("")}
                </select>
              </div>
            </div>
            <div class="section">
              <h2>Favourite stations</h2>
              <p class="hint">Artwork grid of stations shown on the dashboard card. Use the minus control to remove a favourite.</p>
              ${this._renderGrid(favourites, "No favourite stations yet.", {
      removeAction: "remove-favourite"
    })}
              <div class="actions">
                <button type="button" class="secondary" data-action="open-add">Add favourite station</button>
                <button type="button" class="primary" data-action="save" ${this._saving ? "disabled" : ""}>${this._saving ? "Saving\u2026" : "Save"}</button>
              </div>
            </div>
          `}
        </div>
      </div>
      ${this._addOpen ? this._renderAddDialog(networks) : ""}
    `;
    void this._narrow;
    void this._panel;
  }
  _renderAddDialog(networks) {
    const available = this._networkStations();
    const selected = this._pendingStations();
    return `
      <div class="dialog-backdrop" data-action="close-add">
        <div class="dialog" role="dialog" aria-modal="true" aria-label="Add favourite stations">
          <div class="dialog-header">
            <h2>Add favourite stations</h2>
            <button type="button" class="close-x" data-action="close-add" aria-label="Close">\xD7</button>
          </div>
          <div class="dialog-body">
            <div class="field" style="max-width:100%">
              <label for="network">Radio service</label>
              <select id="network" name="network">
                ${networks.map(
      (network) => `<option value="${escapeHtml(network.key)}" ${network.key === this._networkKey ? "selected" : ""}>${escapeHtml(network.name)}</option>`
    ).join("")}
              </select>
            </div>
            <div class="dialog-columns">
              <div>
                <h2>Available stations</h2>
                <p class="hint">Click artwork to add it to your selection.</p>
                ${this._renderGrid(available, "No stations for this service.", {
      selectAction: "add-station"
    })}
              </div>
              <div>
                <h2>Selected favourites</h2>
                <p class="hint">Minus removes a station from the selection.</p>
                ${this._renderGrid(selected, "Nothing selected yet.", {
      removeAction: "remove-pending"
    })}
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <button type="button" class="secondary" data-action="close-add">Cancel</button>
            <button type="button" class="primary" data-action="apply-add">Done</button>
          </div>
        </div>
      </div>
    `;
  }
};

// src/settings-register.ts
var SETTINGS_VERSION = "0.2.0";
if (!customElements.get(SETTINGS_ELEMENT)) {
  customElements.define(SETTINGS_ELEMENT, DifmRadioSettings);
}
console.info(
  `%c DI.FM Radio settings %c v${SETTINGS_VERSION} `,
  "background:#03a9f4;color:#fff;padding:2px 4px;border-radius:4px 0 0 4px",
  "background:#333;color:#fff;padding:2px 4px;border-radius:0 4px 4px 0"
);
