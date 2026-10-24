// src/icons.ts
var ICON_RADIO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.24 6.15C2.51 6.43 2 7.17 2 8v12c0 1.1.9 2 2 2h16c1.11 0 2-.9 2-2V8c0-1.11-.89-2-2-2H8.3l8.26-3.34L15.88 1 3.24 6.15zM7 20c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm13-8h-2v-2h-2v2H4V8h16v4z"/></svg>`;
var ICON_PLAY = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
var ICON_STOP = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6z"/></svg>`;

// src/types.ts
var CARD_TYPE = "custom:difm-radio-card";
var DOMAIN = "difm_radio";
var PLAY_STATION = "play_station";
var STOP = "stop";
var VOLUME_SET = 4;
var TAP_DEBOUNCE_MS = 400;

// src/model.ts
var NETWORK_LABELS = {
  di: "DI.FM",
  radiotunes: "RadioTunes",
  jazzradio: "JAZZRADIO.com",
  rockradio: "ROCKRADIO.COM",
  classicalradio: "ClassicalRadio.com",
  zenradio: "ZenRadio.com"
};
var ERROR_MESSAGES = {
  unknown_station: "That station is not in the catalogue.",
  station_unavailable: "That station is currently unavailable.",
  speaker_missing: "The speaker is not available.",
  speaker_incompatible: "The selected entity is not a media player.",
  no_speaker: "No default speaker is configured.",
  invalid_auth: "The listen key was rejected.",
  cannot_connect: "Could not reach the radio service.",
  unsupported_format: "The speaker rejected the stream format.",
  playback_failed: "The speaker could not start the stream."
};
function normalizeConfig(config) {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid configuration");
  }
  const columns = Number(config.columns);
  return {
    type: CARD_TYPE,
    entity: String(config.entity ?? "").trim(),
    media_player: String(config.media_player ?? "").trim(),
    title: config.title == null || config.title === "" ? "DI.FM Radio" : String(config.title),
    columns: Number.isFinite(columns) && columns > 0 ? Math.min(8, Math.floor(columns)) : 0,
    show_names: config.show_names !== false,
    show_service_labels: config.show_service_labels !== false,
    show_volume: config.show_volume !== false
  };
}
function isRadioEntity(hass, entityId) {
  if (!entityId.startsWith("media_player.")) {
    return false;
  }
  const attrs = hass?.states[entityId]?.attributes ?? {};
  return attrs.integration === DOMAIN || Array.isArray(attrs.favourites);
}
function findRadioEntity(hass) {
  if (!hass?.states) {
    return null;
  }
  const matches = Object.keys(hass.states).filter((entityId) => isRadioEntity(hass, entityId)).sort();
  return matches[0] ?? null;
}
function resolveRadioEntity(hass, config) {
  const configured = config.entity;
  if (configured && hass?.states[configured] && isRadioEntity(hass, configured)) {
    return configured;
  }
  return findRadioEntity(hass) || configured || "";
}
function speakerLabel(hass, entityId) {
  const name = hass?.states[entityId]?.attributes?.friendly_name;
  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }
  return entityId.replace(/^media_player\./, "").replace(/_/g, " ");
}
function listSpeakers(hass, radioEntityId, selectedId) {
  if (!hass?.states) {
    return selectedId ? [{ id: selectedId, name: speakerLabel(hass, selectedId) }] : [];
  }
  const speakers = Object.keys(hass.states).filter(
    (entityId) => entityId.startsWith("media_player.") && entityId !== radioEntityId && !isRadioEntity(hass, entityId)
  ).sort().map((id) => ({ id, name: speakerLabel(hass, id) }));
  if (selectedId && !speakers.some((item) => item.id === selectedId)) {
    speakers.unshift({ id: selectedId, name: speakerLabel(hass, selectedId) });
  }
  return speakers;
}
function selectedFavourite(favourites, stationId) {
  if (!stationId) {
    return null;
  }
  return favourites.find((tile) => tile.id === stationId) ?? null;
}
function networkLabel(network) {
  if (!network) {
    return null;
  }
  return NETWORK_LABELS[network] ?? network;
}
function errorMessage(code, fallback) {
  if (code && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }
  if (fallback && fallback.trim()) {
    return sanitizeError(fallback);
  }
  return code ? "Playback failed." : null;
}
function sanitizeError(text) {
  const withoutUrls = text.replace(/https?:\/\/\S+/gi, "[redacted]");
  return withoutUrls.replace(/listen_key=[^&\s]*/gi, "listen_key=REDACTED");
}
function parseFavourites(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  const tiles = [];
  const seen = /* @__PURE__ */ new Set();
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const data = item;
    const id = String(data.id ?? "").trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const artwork = typeof data.artwork_url === "string" ? data.artwork_url.trim() : "";
    tiles.push({
      id,
      name: String(data.name ?? data.key ?? id),
      network: String(data.network ?? ""),
      key: String(data.key ?? ""),
      available: data.available !== false,
      artwork_url: artwork && artwork.startsWith("https://") ? artwork : null,
      playing: Boolean(data.playing)
    });
  }
  return tiles;
}
function resolveVolume(hass, config, attrs, logicalVolume, logicalFeatures) {
  const speakerId = config.media_player || (typeof attrs.speaker_entity_id === "string" ? attrs.speaker_entity_id : "");
  const speaker = speakerId && hass?.states[speakerId] ? hass.states[speakerId] : null;
  const logical = config.entity && hass?.states[config.entity] ? hass.states[config.entity] : null;
  const target = speaker ?? logical;
  if (!target) {
    return { level: null, entityId: null, supported: false };
  }
  const features = Number(
    target.attributes.supported_features ?? (target === logical ? logicalFeatures : 0) ?? 0
  );
  const level = readVolume(target.attributes.volume_level ?? (target === logical ? logicalVolume : null));
  return {
    level,
    entityId: target.entity_id,
    supported: Boolean(features & VOLUME_SET)
  };
}
function deriveView(hass, config) {
  const entityId = resolveRadioEntity(hass, config);
  const entity = entityId && hass?.states[entityId] ? hass.states[entityId] : null;
  if (!entity) {
    return emptyView(entityId, !entityId);
  }
  const attrs = entity.attributes ?? {};
  const favourites = parseFavourites(attrs.favourites);
  const stationId = attrs.station_id == null ? null : String(attrs.station_id);
  const network = typeof attrs.network === "string" ? attrs.network : null;
  const playing = entity.state === "playing";
  const buffering = entity.state === "buffering";
  const selected = selectedFavourite(favourites, stationId);
  const speakerEntityId = config.media_player || (typeof attrs.speaker_entity_id === "string" ? attrs.speaker_entity_id : null);
  return {
    entityId,
    available: entity.state !== "unavailable" && entity.state !== "unknown",
    missingEntity: false,
    state: entity.state,
    stationId,
    stationName: selected?.name || (typeof entity.attributes.media_title === "string" ? entity.attributes.media_title : null),
    stationArtwork: selected?.artwork_url ?? null,
    network: selected?.network || network,
    networkLabel: networkLabel(selected?.network || network),
    speakerEntityId,
    speakers: listSpeakers(hass, entityId, speakerEntityId),
    owned: Boolean(attrs.owned),
    lastError: errorMessage(
      typeof attrs.last_error === "string" ? attrs.last_error : null
    ),
    lastErrorCode: typeof attrs.last_error === "string" ? attrs.last_error : null,
    favourites,
    volume: resolveVolume(hass, { ...config, entity: entityId }, attrs, attrs.volume_level ?? entity.attributes.volume_level, entity.attributes.supported_features),
    playing,
    buffering
  };
}
function viewSignature(view) {
  return JSON.stringify({
    entityId: view.entityId,
    state: view.state,
    stationId: view.stationId,
    owned: view.owned,
    lastError: view.lastErrorCode,
    speakerEntityId: view.speakerEntityId,
    speakers: view.speakers,
    volume: view.volume,
    favourites: view.favourites,
    stationArtwork: view.stationArtwork
  });
}
function shouldIgnoreTap(pending, lastTapAt, now, stationId, playingStationId, playing) {
  if (pending) {
    return true;
  }
  if (now - lastTapAt < TAP_DEBOUNCE_MS) {
    return true;
  }
  return playing && playingStationId === stationId;
}
function playServiceData(stationId, speakerOverride) {
  const data = { station_id: stationId };
  if (speakerOverride) {
    data.media_player = speakerOverride;
  }
  return data;
}
function cardSize(favouriteCount, columns) {
  const cols = columns > 0 ? columns : 4;
  const rows = favouriteCount === 0 ? 1 : Math.ceil(favouriteCount / cols);
  return 4 + rows;
}
function emptyView(entityId, missingEntity) {
  return {
    entityId,
    available: false,
    missingEntity,
    state: "unavailable",
    stationId: null,
    stationName: null,
    stationArtwork: null,
    network: null,
    networkLabel: null,
    speakerEntityId: null,
    speakers: [],
    owned: false,
    lastError: null,
    lastErrorCode: null,
    favourites: [],
    volume: { level: null, entityId: null, supported: false },
    playing: false,
    buffering: false
  };
}
function readVolume(value) {
  const level = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(level)) {
    return null;
  }
  return Math.min(1, Math.max(0, level));
}

// src/styles.ts
var CARD_STYLES = `
:host {
  display: block;
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
var EDITOR_STYLES = `
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

// src/card.ts
var DifmRadioCard = class extends HTMLElement {
  _config = normalizeConfig({});
  _hass = null;
  _view = deriveView(null, this._config);
  _signature = "";
  _pendingStation = null;
  _localError = null;
  _lastTapAt = 0;
  static getStubConfig(hass) {
    return {
      type: CARD_TYPE,
      entity: findRadioEntity(hass ?? null) ?? "",
      show_names: true,
      show_service_labels: true,
      show_volume: true
    };
  }
  static getConfigElement() {
    return document.createElement("difm-radio-card-editor");
  }
  setConfig(config) {
    this._config = normalizeConfig(config);
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    const view = deriveView(hass, this._config);
    const signature = viewSignature(view);
    if (signature === this._signature && !this._pendingStation) {
      this._view = view;
      return;
    }
    this._view = view;
    this._signature = signature;
    this._render();
  }
  getCardSize() {
    return cardSize(this._view.favourites.length, this._config.columns);
  }
  connectedCallback() {
    this._render();
  }
  disconnectedCallback() {
    this._pendingStation = null;
  }
  _render() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    const view = this._view;
    const error = this._localError || view.lastError;
    const rootTag = customElements.get("ha-card") ? "ha-card" : "div";
    this.shadowRoot.innerHTML = `
      <style>${CARD_STYLES}</style>
      <${rootTag} class="card">
        <div class="header">
          <div class="title">${escapeHtml(this._config.title)}</div>
          <div class="state">${escapeHtml(stateLabel(view, this._pendingStation))}</div>
        </div>
        ${this._speakerHtml(view)}
        ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ""}
        ${this._gridHtml(view)}
        ${this._nowPlayingHtml(view)}
      </${rootTag}>
    `;
    this._bind();
  }
  _speakerHtml(view) {
    if (!view.speakers.length) {
      return `<div class="speaker">
        <label for="speaker">Speaker</label>
        <div class="empty">No Home Assistant speakers were found.</div>
      </div>`;
    }
    const selected = view.speakerEntityId || "";
    return `<div class="speaker">
      <label for="speaker">Speaker</label>
      <select id="speaker" class="speaker-select" aria-label="Choose a speaker" ${this._pendingStation ? "disabled" : ""}>
        ${view.speakers.map((speaker) => {
      const isSelected = speaker.id === selected ? "selected" : "";
      return `<option value="${escapeAttr(speaker.id)}" ${isSelected}>${escapeHtml(speaker.name)}</option>`;
    }).join("")}
      </select>
    </div>`;
  }
  _gridHtml(view) {
    if (view.missingEntity) {
      return `<div class="empty">Select the DI.FM Radio media player in the card editor.</div>`;
    }
    if (!view.available) {
      return `<div class="empty">DI.FM Radio is unavailable.</div>`;
    }
    if (!view.favourites.length) {
      return `<div class="empty">Add favourite stations under Settings \u2192 Devices &amp; services \u2192 DI.FM Radio \u2192 Configure \u2192 Favourite stations.</div>`;
    }
    const gridClass = this._config.columns > 0 ? "grid fixed" : "grid";
    const columns = this._config.columns > 0 ? `--columns:${this._config.columns};` : "";
    return `<div class="${gridClass}" style="${columns}" role="list">
      ${view.favourites.map((tile) => this._tileHtml(tile, view)).join("")}
    </div>`;
  }
  _tileHtml(tile, view) {
    const currentId = this._pendingStation || view.stationId;
    const active = Boolean(tile.playing || currentId === tile.id && (view.playing || view.buffering || this._pendingStation));
    const loading = this._pendingStation === tile.id || view.buffering && view.stationId === tile.id;
    const disabled = !tile.available || Boolean(this._pendingStation);
    const art = tile.artwork_url ? `<img src="${escapeAttr(tile.artwork_url)}" alt="" loading="lazy">` : ICON_RADIO;
    return `<button class="tile${tile.available ? "" : " unavailable"}" type="button" role="listitem"
      data-station-id="${escapeAttr(tile.id)}" aria-pressed="${active ? "true" : "false"}"
      ${disabled ? "disabled" : ""} title="${escapeAttr(tile.name)}">
      <span class="art">${art}</span>
      ${this._config.show_names ? `<span class="name">${escapeHtml(tile.name)}</span>` : ""}
      ${this._config.show_service_labels ? `<span class="service">${escapeHtml(networkLabel(tile.network) ?? tile.network)}</span>` : ""}
      ${loading ? `<span class="spinner" aria-hidden="true"></span>` : ""}
    </button>`;
  }
  _nowPlayingHtml(view) {
    const selected = selectedFavourite(view.favourites, this._pendingStation || view.stationId);
    const name = selected?.name || view.stationName || "Select a station";
    const artwork = selected?.artwork_url || view.stationArtwork;
    const art = artwork ? `<img src="${escapeAttr(artwork)}" alt="${escapeAttr(name)}">` : ICON_RADIO;
    return `<section class="now-playing" aria-label="Now playing">
      <div class="hero-art${artwork ? "" : " placeholder"}">${art}</div>
      <div class="hero-body">
        <div class="now-name">${escapeHtml(name)}</div>
        <div class="now-meta">${escapeHtml(metaLine(view, selected))}</div>
        <div class="buttons">
          <button class="icon-button play" type="button" aria-label="Play" ${playDisabled(view, selected) ? "disabled" : ""}>
            ${ICON_PLAY}
          </button>
          <button class="icon-button stop" type="button" aria-label="Stop" ${stopDisabled(view) ? "disabled" : ""}>
            ${ICON_STOP}
          </button>
        </div>
        ${this._volumeHtml(view)}
      </div>
    </section>`;
  }
  _volumeHtml(view) {
    if (!this._config.show_volume) {
      return "";
    }
    if (!view.volume.supported) {
      return `<div class="volume-hint">This speaker does not support volume control.</div>`;
    }
    const percent = view.volume.level == null ? 0 : Math.round(view.volume.level * 100);
    return `<div class="volume">
      <input class="vol" type="range" min="0" max="100" step="1" value="${percent}"
        aria-label="Speaker volume" ${this._pendingStation ? "disabled" : ""}>
      <span class="vol-label">${percent}%</span>
    </div>`;
  }
  _bind() {
    this.shadowRoot?.querySelector(".speaker-select")?.addEventListener("change", (event) => {
      this._setSpeaker(event.target.value);
    });
    this.shadowRoot?.querySelectorAll(".tile").forEach((button) => {
      button.addEventListener("click", () => {
        const stationId = button.dataset.stationId;
        if (stationId) {
          void this._play(stationId);
        }
      });
    });
    this.shadowRoot?.querySelector(".play")?.addEventListener("click", () => {
      const stationId = this._pendingStation || this._view.stationId;
      if (stationId) {
        void this._play(stationId);
      }
    });
    this.shadowRoot?.querySelector(".stop")?.addEventListener("click", () => {
      void this._stop();
    });
    const slider = this.shadowRoot?.querySelector(".vol");
    slider?.addEventListener("input", () => {
      const label = this.shadowRoot?.querySelector(".vol-label");
      if (label) {
        label.textContent = `${slider.value}%`;
      }
    });
    slider?.addEventListener("change", () => {
      void this._setVolume(Number(slider.value) / 100);
    });
    this.shadowRoot?.querySelectorAll("img").forEach((img) => {
      img.addEventListener("error", () => {
        const art = img.closest(".art, .hero-art");
        if (art) {
          art.innerHTML = ICON_RADIO;
          art.classList.add("placeholder");
        }
      });
    });
  }
  _setSpeaker(entityId) {
    const next = {
      type: CARD_TYPE,
      entity: this._config.entity,
      title: this._config.title,
      columns: this._config.columns,
      show_names: this._config.show_names,
      show_service_labels: this._config.show_service_labels,
      show_volume: this._config.show_volume
    };
    if (entityId) {
      next.media_player = entityId;
    }
    this._config = normalizeConfig(next);
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: next },
        bubbles: true,
        composed: true
      })
    );
    if (this._hass) {
      this._view = deriveView(this._hass, this._config);
      this._signature = viewSignature(this._view);
    }
    this._render();
  }
  async _play(stationId) {
    if (shouldIgnoreTap(
      Boolean(this._pendingStation),
      this._lastTapAt,
      Date.now(),
      stationId,
      this._view.stationId,
      this._view.playing
    )) {
      return;
    }
    this._lastTapAt = Date.now();
    this._pendingStation = stationId;
    this._localError = null;
    this._render();
    try {
      await this._hass?.callService(
        DOMAIN,
        PLAY_STATION,
        playServiceData(stationId, this._config.media_player)
      );
    } catch (err) {
      this._localError = errorMessage(null, sanitizeError(err instanceof Error ? err.message : String(err)));
    } finally {
      this._pendingStation = null;
      this._render();
    }
  }
  async _stop() {
    this._localError = null;
    try {
      await this._hass?.callService(DOMAIN, STOP, {});
    } catch (err) {
      this._localError = errorMessage(null, sanitizeError(err instanceof Error ? err.message : String(err)));
      this._render();
    }
  }
  async _setVolume(level) {
    const entityId = this._view.volume.entityId;
    if (!entityId || !this._view.volume.supported) {
      return;
    }
    try {
      await this._hass?.callService("media_player", "volume_set", {
        entity_id: entityId,
        volume_level: Math.min(1, Math.max(0, level))
      });
    } catch (err) {
      this._localError = errorMessage(null, sanitizeError(err instanceof Error ? err.message : String(err)));
      this._render();
    }
  }
};
function playDisabled(view, selected) {
  const stationId = selected?.id || view.stationId;
  return !stationId || !view.available || view.playing || view.buffering;
}
function stopDisabled(view) {
  return !view.owned && !view.playing && !view.buffering;
}
function stateLabel(view, pending) {
  if (pending || view.buffering) {
    return "Starting\u2026";
  }
  if (view.playing) {
    return "Playing";
  }
  if (view.state === "idle" || view.state === "off") {
    return "Stopped";
  }
  if (!view.available) {
    return "Unavailable";
  }
  return "Idle";
}
function metaLine(view, selected) {
  const network = networkLabel(selected?.network || view.network) ?? view.networkLabel;
  const speaker = view.speakers.find((item) => item.id === view.speakerEntityId)?.name || view.speakerEntityId;
  return [network, speaker].filter(Boolean).join(" \xB7 ");
}
function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttr(value) {
  return escapeHtml(value);
}

// src/editor.ts
var DifmRadioCardEditor = class extends HTMLElement {
  _config = normalizeConfig({});
  _hass = null;
  setConfig(config) {
    this._config = normalizeConfig(config);
    this._render();
  }
  set hass(hass) {
    const first = this._hass == null;
    this._hass = hass;
    if (!this._config.entity) {
      const found = findRadioEntity(hass);
      if (found) {
        this._update({ entity: found });
        return;
      }
    }
    if (first) {
      this._render();
    }
  }
  _render() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    const config = this._config;
    const radios = radioEntities(this._hass);
    const speakers = mediaPlayers(this._hass);
    const entityChoices = radios.length ? radios : speakers;
    this.shadowRoot.innerHTML = `
      <style>${EDITOR_STYLES}</style>
      <div class="field">
        <label for="entity">DI.FM Radio entity</label>
        <select id="entity">
          <option value="">Select entity</option>
          ${entityChoices.map((id) => option(id, config.entity)).join("")}
        </select>
        <div class="hint">Choose the DI.FM Radio player, not the speaker. Favourites come from this entity.</div>
      </div>
      <div class="field">
        <label for="speaker">Speaker override</label>
        <select id="speaker">
          <option value="">Use integration default</option>
          ${speakers.map((id) => option(id, config.media_player)).join("")}
        </select>
        <div class="hint">Optional starting speaker. The card also has a speaker dropdown.</div>
      </div>
      <div class="field">
        <label for="title">Title</label>
        <input id="title" type="text" value="${escapeAttr2(config.title)}">
      </div>
      <div class="field">
        <label for="columns">Grid columns (0 = automatic)</label>
        <input id="columns" type="number" min="0" max="8" step="1" value="${config.columns}">
      </div>
      <label class="check"><input id="show_names" type="checkbox" ${config.show_names ? "checked" : ""}> Show station names</label>
      <label class="check"><input id="show_service_labels" type="checkbox" ${config.show_service_labels ? "checked" : ""}> Show service labels</label>
      <label class="check"><input id="show_volume" type="checkbox" ${config.show_volume ? "checked" : ""}> Show volume slider</label>
    `;
    this._bind();
  }
  _bind() {
    const root = this.shadowRoot;
    if (!root) {
      return;
    }
    root.querySelector("#entity")?.addEventListener("change", (event) => {
      this._update({ entity: event.target.value });
    });
    root.querySelector("#speaker")?.addEventListener("change", (event) => {
      this._update({ media_player: event.target.value });
    });
    root.querySelector("#title")?.addEventListener("change", (event) => {
      this._update({ title: event.target.value });
    });
    root.querySelector("#columns")?.addEventListener("change", (event) => {
      this._update({ columns: Number(event.target.value) });
    });
    for (const key of ["show_names", "show_service_labels", "show_volume"]) {
      root.querySelector(`#${key}`)?.addEventListener("change", (event) => {
        this._update({ [key]: event.target.checked });
      });
    }
  }
  _update(patch) {
    const next = {
      type: CARD_TYPE,
      entity: patch.entity ?? this._config.entity,
      media_player: patch.media_player ?? this._config.media_player,
      title: patch.title ?? this._config.title,
      columns: patch.columns ?? this._config.columns,
      show_names: patch.show_names ?? this._config.show_names,
      show_service_labels: patch.show_service_labels ?? this._config.show_service_labels,
      show_volume: patch.show_volume ?? this._config.show_volume
    };
    if (!next.media_player) {
      delete next.media_player;
    }
    if (!next.columns) {
      delete next.columns;
    }
    this._config = normalizeConfig(next);
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: next } }));
    this._render();
  }
};
function radioEntities(hass) {
  if (!hass) {
    return [];
  }
  return Object.keys(hass.states).filter((entityId) => isRadioEntity(hass, entityId)).sort();
}
function mediaPlayers(hass) {
  if (!hass) {
    return [];
  }
  return Object.keys(hass.states).filter((entityId) => entityId.startsWith("media_player.") && !isRadioEntity(hass, entityId)).sort();
}
function option(value, selected) {
  return `<option value="${escapeAttr2(value)}" ${value === selected ? "selected" : ""}>${escapeAttr2(value)}</option>`;
}
function escapeAttr2(value) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// src/register.ts
if (!customElements.get("difm-radio-card")) {
  customElements.define("difm-radio-card", DifmRadioCard);
}
if (!customElements.get("difm-radio-card-editor")) {
  customElements.define("difm-radio-card-editor", DifmRadioCardEditor);
}
var win = window;
win.customCards = win.customCards || [];
if (!win.customCards.some((card) => card.type === "difm-radio-card")) {
  win.customCards.push({
    type: "difm-radio-card",
    name: "DI.FM Radio",
    description: "Play favourite DI.FM stations on a Home Assistant speaker.",
    preview: true,
    documentationURL: "https://www.di.fm/premium"
  });
}
