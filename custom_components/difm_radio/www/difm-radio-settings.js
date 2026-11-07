// src/artwork-cache.ts
var ready = /* @__PURE__ */ new Map();
var inflight = /* @__PURE__ */ new Map();
function peekArtwork(url) {
  return ready.get(url) ?? null;
}
function loadArtwork(url) {
  const cached = ready.get(url);
  if (cached) {
    return Promise.resolve(cached);
  }
  const pending = inflight.get(url);
  if (pending) {
    return pending;
  }
  const task = new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      ready.set(url, url);
      inflight.delete(url);
      resolve(url);
    };
    img.onerror = () => {
      inflight.delete(url);
      reject(new Error(`Failed to load artwork: ${url}`));
    };
    img.src = url;
  });
  inflight.set(url, task);
  return task;
}
function prefetchArtwork(urls) {
  const seen = /* @__PURE__ */ new Set();
  for (const raw of urls) {
    if (!raw || seen.has(raw) || ready.has(raw) || inflight.has(raw)) {
      continue;
    }
    seen.add(raw);
    void loadArtwork(raw).catch(() => {
    });
  }
}

// src/settings-types.ts
var SETTINGS_ELEMENT = "difm-radio-settings";
var WS_GET_CONFIG = "difm_radio/get_config";
var WS_SET_CONFIG = "difm_radio/set_config";
var GRID_COLUMNS = 5;
var GRID_VISIBLE_ROWS = 5;

// src/settings-styles.ts
var GAP_PX = 8;
var SETTINGS_STYLES = `
:host {
  display: block;
  height: 100%;
  background: var(--primary-background-color, #fafafa);
  color: var(--primary-text-color, #212121);
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
.field select,
.field input[type="text"] {
  box-sizing: border-box;
  width: 100%;
  border-radius: 8px;
  padding: 10px 12px;
  font: inherit;
}
.field select {
  appearance: none;
  -webkit-appearance: none;
  cursor: pointer;
  border: 1px solid var(--primary-color, #03a9f4);
  background-color: var(--primary-color, #03a9f4);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23ffffff'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 22px;
  color: #fff;
  -webkit-text-fill-color: #fff;
  padding-right: 40px;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
}
.field select:hover {
  filter: brightness(1.05);
}
.field select:focus-visible {
  outline: 2px solid var(--primary-color, #03a9f4);
  outline-offset: 2px;
}
.field input[type="text"] {
  border: 1px solid var(--divider-color, #9e9e9e);
  background: var(--card-background-color, #fff);
  color: var(--primary-text-color, #212121);
  -webkit-text-fill-color: var(--primary-text-color, #212121);
  caret-color: var(--primary-text-color, #212121);
}
.field input[type="text"]:focus-visible {
  outline: 2px solid var(--primary-color, #03a9f4);
  outline-offset: 1px;
  border-color: var(--primary-color, #03a9f4);
}
.field .field-hint {
  margin: 0;
  font-size: 12px;
  color: var(--secondary-text-color, #727272);
}
.grid-scroll {
  container-type: inline-size;
  border: 1px solid var(--divider-color, #e0e0e0);
  border-radius: 12px;
  background: var(--card-background-color, #fff);
  padding: 8px;
  max-height: calc(
    var(--settings-rows) * ((100cqw - 16px - (var(--settings-cols) - 1) * var(--settings-gap)) / var(--settings-cols))
    + (var(--settings-rows) - 1) * var(--settings-gap)
    + 16px
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
  width: 100%;
  border-radius: 10px;
  overflow: hidden;
  background: var(--secondary-background-color, #eee);
  border: 1px solid var(--divider-color, #e0e0e0);
  cursor: pointer;
  padding: 0;
  min-height: 0;
  min-width: 0;
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
.tile img {
  opacity: 0;
  transition: opacity 120ms ease-out;
  background: var(--secondary-background-color, #eee);
}
.tile img.loaded {
  opacity: 1;
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
function sameIds(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function formatError(err) {
  if (err instanceof Error) {
    return err.message || err.name;
  }
  if (typeof err === "string") {
    return err;
  }
  if (err && typeof err === "object") {
    const record = err;
    if (typeof record.message === "string" && record.message.trim()) {
      return typeof record.code === "string" ? `${record.message} (${record.code})` : record.message;
    }
    if (typeof record.error === "string") {
      return record.error;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return "Unknown error";
    }
  }
  return String(err);
}
var DifmRadioSettings = class extends HTMLElement {
  _hass = null;
  _loaded = false;
  _loading = false;
  _saving = false;
  _loadToken = 0;
  _error = null;
  _status = null;
  _config = null;
  _speaker = "";
  _quality = "";
  _listenKey = "";
  _favouriteIds = [];
  _baselineSpeaker = "";
  _baselineQuality = "";
  _baselineListenKey = "";
  _baselineFavouriteIds = [];
  _addOpen = false;
  _networkKey = "";
  _pendingIds = [];
  _bound = false;
  set hass(hass) {
    this._hass = hass;
    if (!this._loaded && !this._loading) {
      void this._load();
    }
  }
  set narrow(_narrow) {
  }
  set panel(_panel) {
  }
  connectedCallback() {
    if (!this._bound) {
      this._bound = true;
      this.addEventListener("click", this._onClick);
      this.addEventListener("change", this._onChange);
      this.addEventListener("input", this._onInput);
    }
    if (this._hass && !this._loaded && !this._loading) {
      void this._load();
      return;
    }
    if (this._loaded && !this.querySelector(".shell")) {
      this._render();
    }
  }
  disconnectedCallback() {
  }
  _isDirty() {
    return this._speaker !== this._baselineSpeaker || this._quality !== this._baselineQuality || this._listenKey !== this._baselineListenKey || !sameIds(this._favouriteIds, this._baselineFavouriteIds);
  }
  _captureBaseline() {
    this._baselineSpeaker = this._speaker;
    this._baselineQuality = this._quality;
    this._baselineListenKey = this._listenKey;
    this._baselineFavouriteIds = [...this._favouriteIds];
  }
  _syncSaveButton() {
    const button = this.querySelector(
      "[data-action='save']"
    );
    if (!button) {
      return;
    }
    const dirty = this._isDirty();
    button.disabled = this._saving || !dirty;
    button.textContent = this._saving ? "Saving\u2026" : "Save";
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
      this._syncSaveButton();
      return;
    }
    if (target.name === "quality") {
      this._quality = target.value;
      this._status = null;
      this._syncSaveButton();
      return;
    }
    if (target.name === "network") {
      this._networkKey = target.value;
      this._prefetchNetwork(this._networkKey);
      this._render();
    }
  };
  _onInput = (event) => {
    const target = event.target;
    if (!target || target.name !== "listen_key") {
      return;
    }
    this._listenKey = target.value;
    this._status = null;
    this._syncSaveButton();
  };
  _openAddDialog() {
    const networks = this._config?.networks ?? [];
    this._pendingIds = [...this._favouriteIds];
    this._networkKey = this._networkKey || networks[0]?.key || this._config?.stations[0]?.network || "";
    this._addOpen = true;
    this._prefetchNetwork(this._networkKey);
    this._render();
  }
  _prefetchNetwork(networkKey) {
    prefetchArtwork(
      (this._config?.stations ?? []).filter((station) => station.network === networkKey).map((station) => station.artwork_url)
    );
  }
  _prefetchKnownArtwork() {
    prefetchArtwork((this._config?.favourites ?? []).map((item) => item.artwork_url));
  }
  _hydrateArtwork() {
    this.querySelectorAll("img[data-art]").forEach((img) => {
      const url = img.dataset.art;
      if (!url) {
        return;
      }
      const cached = peekArtwork(url);
      if (cached) {
        if (img.src !== cached) {
          img.src = cached;
        }
        img.classList.add("loaded");
        return;
      }
      void loadArtwork(url).then((resolved) => {
        if (!img.isConnected || img.dataset.art !== url) {
          return;
        }
        img.src = resolved;
        img.classList.add("loaded");
      }).catch(() => {
      });
    });
  }
  async _load() {
    if (!this._hass || this._loading) {
      return;
    }
    const token = ++this._loadToken;
    this._loading = true;
    this._error = null;
    this._status = null;
    this._render();
    try {
      const data = await this._hass.callWS({ type: WS_GET_CONFIG });
      if (token !== this._loadToken) {
        return;
      }
      this._config = data;
      this._speaker = data.default_media_player || data.media_players[0]?.entity_id || "";
      this._quality = data.stream_quality || data.qualities[0]?.value || "";
      this._listenKey = typeof data.listen_key === "string" ? data.listen_key : "";
      this._favouriteIds = data.favourites.map((item) => String(item.id));
      this._networkKey = data.networks[0]?.key || data.stations[0]?.network || "";
      this._captureBaseline();
      this._loaded = true;
      this._prefetchKnownArtwork();
    } catch (err) {
      if (token !== this._loadToken) {
        return;
      }
      this._error = formatError(err);
    } finally {
      if (token === this._loadToken) {
        this._loading = false;
        this._render();
      }
    }
  }
  async _save() {
    if (!this._hass || this._saving) {
      return;
    }
    const liveKey = this.querySelector("input[name='listen_key']");
    if (liveKey) {
      this._listenKey = liveKey.value;
    }
    if (!this._isDirty()) {
      this._status = "No changes to save.";
      this._error = null;
      this._syncSaveButton();
      const status = this.querySelector(".status");
      if (status) {
        status.textContent = this._status;
      } else {
        this._render();
      }
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
    this._syncSaveButton();
    try {
      const result = await this._hass.callWS({
        type: WS_SET_CONFIG,
        default_media_player: this._speaker,
        stream_quality: this._quality,
        listen_key: this._listenKey,
        favourites: this._favouriteIds.map(String)
      });
      if (this._config) {
        this._config = {
          ...this._config,
          default_media_player: result.default_media_player,
          stream_quality: result.stream_quality,
          listen_key: result.listen_key,
          favourites: result.favourites
        };
      }
      this._speaker = result.default_media_player;
      this._quality = result.stream_quality;
      this._listenKey = typeof result.listen_key === "string" ? result.listen_key : "";
      this._favouriteIds = result.favourites.map((item) => String(item.id));
      this._captureBaseline();
      this._status = "Settings saved.";
    } catch (err) {
      this._error = formatError(err);
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
    let art;
    if (station.artwork_url) {
      const cached = peekArtwork(station.artwork_url);
      const safeUrl = escapeHtml(station.artwork_url);
      art = cached ? `<img class="loaded" src="${escapeHtml(cached)}" alt="" decoding="async" data-art="${safeUrl}" />` : `<img alt="" decoding="async" data-art="${safeUrl}" />`;
    } else {
      art = `<div class="placeholder">${escapeHtml(station.name)}</div>`;
    }
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
  _saveDisabledAttr() {
    return this._saving || !this._isDirty() ? "disabled" : "";
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
              <h2>DI.FM Radio configuration</h2>
              <p class="hint">This integration streams DI.FM and sister services (JazzRadio, RockRadio, ClassicalRadio, and more) to a Home Assistant media player using your Premium listen key. On this page you can set the default speaker and stream quality, update or clear the listen key, and choose which stations appear as favourites on the dashboard card.</p>
              <div class="field">
                <label for="speaker">Default speaker</label>
                <select id="speaker" name="speaker" aria-label="Default speaker">
                  ${players.map(
      (player) => `<option value="${escapeHtml(player.entity_id)}" ${player.entity_id === this._speaker ? "selected" : ""}>${escapeHtml(player.name)}</option>`
    ).join("")}
                </select>
              </div>
              <div class="field">
                <label for="quality">Stream quality</label>
                <select id="quality" name="quality" aria-label="Stream quality">
                  ${qualities.map(
      (item) => `<option value="${escapeHtml(item.value)}" ${item.value === this._quality ? "selected" : ""}>${escapeHtml(item.label)}</option>`
    ).join("")}
                </select>
              </div>
              <div class="field">
                <label for="listen_key">Listen key</label>
                <input
                  id="listen_key"
                  name="listen_key"
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  aria-label="Listen key"
                />
                <p class="field-hint">From Player Settings on any AudioAddict network site. Clear and save to remove the stored key.</p>
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
                <button type="button" class="primary" data-action="save" ${this._saveDisabledAttr()}>${this._saving ? "Saving\u2026" : "Save"}</button>
              </div>
            </div>
          `}
        </div>
      </div>
      ${this._addOpen ? this._renderAddDialog(networks) : ""}
    `;
    const listenInput = this.querySelector("input[name='listen_key']");
    if (listenInput) {
      listenInput.value = this._listenKey;
    }
    this._hydrateArtwork();
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
              <select id="network" name="network" aria-label="Radio service">
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
var SETTINGS_VERSION = "0.2.3";
if (!customElements.get(SETTINGS_ELEMENT)) {
  customElements.define(SETTINGS_ELEMENT, DifmRadioSettings);
}
console.info(
  `%c DI.FM Radio settings %c v${SETTINGS_VERSION} `,
  "background:#03a9f4;color:#fff;padding:2px 4px;border-radius:4px 0 0 4px",
  "background:#333;color:#fff;padding:2px 4px;border-radius:0 4px 4px 0"
);
