import { loadArtwork, peekArtwork, prefetchArtwork } from "./artwork-cache";
import { ICON_MINUS, SETTINGS_STYLES } from "./settings-styles";
import {
  SETTINGS_ELEMENT,
  WS_GET_CONFIG,
  WS_SET_CONFIG,
  type HomeAssistant,
  type PanelInfo,
  type SettingsConfig,
  type StationOption,
} from "./settings-types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stationById(stations: StationOption[], id: string): StationOption | undefined {
  return stations.find((item) => item.id === id);
}

function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export class DifmRadioSettings extends HTMLElement {
  private _hass: HomeAssistant | null = null;
  private _loaded = false;
  private _loading = false;
  private _saving = false;
  private _error: string | null = null;
  private _status: string | null = null;
  private _config: SettingsConfig | null = null;
  private _speaker = "";
  private _quality = "";
  private _listenKey = "";
  private _favouriteIds: string[] = [];
  private _baselineSpeaker = "";
  private _baselineQuality = "";
  private _baselineListenKey = "";
  private _baselineFavouriteIds: string[] = [];
  private _addOpen = false;
  private _networkKey = "";
  private _pendingIds: string[] = [];
  private _bound = false;

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    // Home Assistant pushes hass on every state change; do not rebuild the DOM
    // or artwork loads are aborted and the panel flickers.
    if (!this._loaded && !this._loading) {
      void this._load();
    }
  }

  set narrow(_narrow: boolean) {
    // Layout is CSS-driven; ignore narrow updates to avoid full redraws.
  }

  set panel(_panel: PanelInfo) {
    // Panel config is static for this integration.
  }

  connectedCallback(): void {
    if (!this._bound) {
      this._bound = true;
      this.addEventListener("click", this._onClick);
      this.addEventListener("change", this._onChange);
      this.addEventListener("input", this._onInput);
    }
    if (this._hass && !this._loaded && !this._loading) {
      void this._load();
    } else if (this._loaded) {
      this._render();
    }
  }

  disconnectedCallback(): void {
    if (this._bound) {
      this.removeEventListener("click", this._onClick);
      this.removeEventListener("change", this._onChange);
      this.removeEventListener("input", this._onInput);
      this._bound = false;
    }
  }

  private _isDirty(): boolean {
    return (
      this._speaker !== this._baselineSpeaker ||
      this._quality !== this._baselineQuality ||
      this._listenKey !== this._baselineListenKey ||
      !sameIds(this._favouriteIds, this._baselineFavouriteIds)
    );
  }

  private _captureBaseline(): void {
    this._baselineSpeaker = this._speaker;
    this._baselineQuality = this._quality;
    this._baselineListenKey = this._listenKey;
    this._baselineFavouriteIds = [...this._favouriteIds];
  }

  private _syncSaveButton(): void {
    const button = this.querySelector(
      "[data-action='save']",
    ) as HTMLButtonElement | null;
    if (!button) {
      return;
    }
    const dirty = this._isDirty();
    button.disabled = this._saving || !dirty;
    button.textContent = this._saving ? "Saving…" : "Save";
  }

  private _onClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }
    // Keep dialog interactions from hitting the backdrop close handler.
    if (target.closest(".dialog") && !target.closest("[data-action='close-add']")) {
      event.stopPropagation();
    }
    const actionEl = target.closest("[data-action]") as HTMLElement | null;
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

  private _onChange = (event: Event): void => {
    const target = event.target as HTMLSelectElement | HTMLInputElement | null;
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

  private _onInput = (event: Event): void => {
    const target = event.target as HTMLInputElement | null;
    if (!target || target.name !== "listen_key") {
      return;
    }
    this._listenKey = target.value;
    this._status = null;
    this._syncSaveButton();
  };

  private _openAddDialog(): void {
    const networks = this._config?.networks ?? [];
    this._pendingIds = [...this._favouriteIds];
    this._networkKey =
      this._networkKey ||
      networks[0]?.key ||
      this._config?.stations[0]?.network ||
      "";
    this._addOpen = true;
    this._prefetchNetwork(this._networkKey);
    this._render();
  }

  private _prefetchNetwork(networkKey: string): void {
    prefetchArtwork(
      (this._config?.stations ?? [])
        .filter((station) => station.network === networkKey)
        .map((station) => station.artwork_url),
    );
  }

  private _prefetchKnownArtwork(): void {
    prefetchArtwork((this._config?.favourites ?? []).map((item) => item.artwork_url));
  }

  private _hydrateArtwork(): void {
    this.querySelectorAll<HTMLImageElement>("img[data-art]").forEach((img) => {
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
      void loadArtwork(url)
        .then((resolved) => {
          if (!img.isConnected || img.dataset.art !== url) {
            return;
          }
          img.src = resolved;
          img.classList.add("loaded");
        })
        .catch(() => {
          // Leave the tile background as a quiet placeholder.
        });
    });
  }

  private async _load(): Promise<void> {
    if (!this._hass || this._loading) {
      return;
    }
    this._loading = true;
    this._error = null;
    this._status = null;
    this._render();
    try {
      const data = await this._hass.callWS<SettingsConfig>({ type: WS_GET_CONFIG });
      this._config = data;
      this._speaker = data.default_media_player || data.media_players[0]?.entity_id || "";
      this._quality = data.stream_quality || data.qualities[0]?.value || "";
      this._listenKey = data.listen_key ?? "";
      this._favouriteIds = data.favourites.map((item) => item.id);
      this._networkKey = data.networks[0]?.key || data.stations[0]?.network || "";
      this._captureBaseline();
      this._loaded = true;
      this._prefetchKnownArtwork();
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._loading = false;
      this._render();
    }
  }

  private async _save(): Promise<void> {
    if (!this._hass || this._saving) {
      return;
    }
    if (!this._isDirty()) {
      this._status = "No changes to save.";
      this._error = null;
      this._render();
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
      const result = await this._hass.callWS<{
        default_media_player: string;
        stream_quality: string;
        listen_key: string;
        favourites: StationOption[];
      }>({
        type: WS_SET_CONFIG,
        default_media_player: this._speaker,
        stream_quality: this._quality,
        listen_key: this._listenKey,
        favourites: this._favouriteIds,
      });
      if (this._config) {
        this._config = {
          ...this._config,
          default_media_player: result.default_media_player,
          stream_quality: result.stream_quality,
          listen_key: result.listen_key,
          favourites: result.favourites,
        };
      }
      this._speaker = result.default_media_player;
      this._quality = result.stream_quality;
      this._listenKey = result.listen_key;
      this._favouriteIds = result.favourites.map((item) => item.id);
      this._captureBaseline();
      this._status = "Settings saved.";
    } catch (err) {
      this._error = err instanceof Error ? err.message : String(err);
    } finally {
      this._saving = false;
      this._render();
    }
  }

  private _resolvedFavourites(): StationOption[] {
    const catalogue = this._config?.stations ?? [];
    const known = this._config?.favourites ?? [];
    return this._favouriteIds
      .map((id) => stationById(known, id) || stationById(catalogue, id))
      .filter((item): item is StationOption => Boolean(item));
  }

  private _pendingStations(): StationOption[] {
    const catalogue = this._config?.stations ?? [];
    const known = this._config?.favourites ?? [];
    return this._pendingIds
      .map((id) => stationById(known, id) || stationById(catalogue, id))
      .filter((item): item is StationOption => Boolean(item));
  }

  private _networkStations(): StationOption[] {
    const key = this._networkKey;
    const pending = new Set(this._pendingIds);
    return (this._config?.stations ?? []).filter(
      (station) => station.network === key && !pending.has(station.id),
    );
  }

  private _renderTile(
    station: StationOption,
    options: { removeAction?: string; selectAction?: string; selected?: boolean },
  ): string {
    let art: string;
    if (station.artwork_url) {
      const cached = peekArtwork(station.artwork_url);
      const safeUrl = escapeHtml(station.artwork_url);
      art = cached
        ? `<img class="loaded" src="${escapeHtml(cached)}" alt="" decoding="async" data-art="${safeUrl}" />`
        : `<img alt="" decoding="async" data-art="${safeUrl}" />`;
    } else {
      art = `<div class="placeholder">${escapeHtml(station.name)}</div>`;
    }
    const selectAttrs = options.selectAction
      ? `data-action="${options.selectAction}" data-id="${escapeHtml(station.id)}"`
      : "";
    const selectedClass = options.selected ? " selected" : "";
    const unavailable = station.available ? "" : " unavailable";
    const minus = options.removeAction
      ? `<button
          type="button"
          class="minus"
          data-action="${options.removeAction}"
          data-id="${escapeHtml(station.id)}"
          aria-label="Remove ${escapeHtml(station.name)}"
        >${ICON_MINUS}</button>`
      : "";
    return `
      <div class="tile${selectedClass}${unavailable}" title="${escapeHtml(station.name)}" ${selectAttrs}>
        ${art}
        ${minus}
      </div>
    `;
  }

  private _renderGrid(
    stations: StationOption[],
    emptyText: string,
    options: { removeAction?: string; selectAction?: string },
  ): string {
    if (!stations.length) {
      return `<div class="grid-scroll"><div class="empty">${escapeHtml(emptyText)}</div></div>`;
    }
    return `
      <div class="grid-scroll">
        <div class="grid">
          ${stations
            .map((station) => this._renderTile(station, options))
            .join("")}
        </div>
      </div>
    `;
  }

  private _saveDisabledAttr(): string {
    return this._saving || !this._isDirty() ? "disabled" : "";
  }

  private _render(): void {
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
          ${
            this._loading || !this._loaded
              ? `<p class="hint">${this._loading ? "Loading settings…" : "Waiting for Home Assistant…"}</p>`
              : `
            <div class="section">
              <h2>DI.FM Radio configuration</h2>
              <p class="hint">This integration streams DI.FM and sister services (JazzRadio, RockRadio, ClassicalRadio, and more) to a Home Assistant media player using your Premium listen key. On this page you can set the default speaker and stream quality, update or clear the listen key, and choose which stations appear as favourites on the dashboard card.</p>
              <div class="field">
                <label for="speaker">Default speaker</label>
                <select id="speaker" name="speaker" aria-label="Default speaker">
                  ${players
                    .map(
                      (player) =>
                        `<option value="${escapeHtml(player.entity_id)}" ${
                          player.entity_id === this._speaker ? "selected" : ""
                        }>${escapeHtml(player.name)}</option>`,
                    )
                    .join("")}
                </select>
              </div>
              <div class="field">
                <label for="quality">Stream quality</label>
                <select id="quality" name="quality" aria-label="Stream quality">
                  ${qualities
                    .map(
                      (item) =>
                        `<option value="${escapeHtml(item.value)}" ${
                          item.value === this._quality ? "selected" : ""
                        }>${escapeHtml(item.label)}</option>`,
                    )
                    .join("")}
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
                  value="${escapeHtml(this._listenKey)}"
                  aria-label="Listen key"
                />
                <p class="field-hint">From Player Settings on any AudioAddict network site. Clear and save to remove the stored key.</p>
              </div>
            </div>
            <div class="section">
              <h2>Favourite stations</h2>
              <p class="hint">Artwork grid of stations shown on the dashboard card. Use the minus control to remove a favourite.</p>
              ${this._renderGrid(favourites, "No favourite stations yet.", {
                removeAction: "remove-favourite",
              })}
              <div class="actions">
                <button type="button" class="secondary" data-action="open-add">Add favourite station</button>
                <button type="button" class="primary" data-action="save" ${this._saveDisabledAttr()}>${
                  this._saving ? "Saving…" : "Save"
                }</button>
              </div>
            </div>
          `
          }
        </div>
      </div>
      ${this._addOpen ? this._renderAddDialog(networks) : ""}
    `;
    this._hydrateArtwork();
  }

  private _renderAddDialog(networks: { key: string; name: string }[]): string {
    const available = this._networkStations();
    const selected = this._pendingStations();
    return `
      <div class="dialog-backdrop" data-action="close-add">
        <div class="dialog" role="dialog" aria-modal="true" aria-label="Add favourite stations">
          <div class="dialog-header">
            <h2>Add favourite stations</h2>
            <button type="button" class="close-x" data-action="close-add" aria-label="Close">×</button>
          </div>
          <div class="dialog-body">
            <div class="field" style="max-width:100%">
              <label for="network">Radio service</label>
              <select id="network" name="network" aria-label="Radio service">
                ${networks
                  .map(
                    (network) =>
                      `<option value="${escapeHtml(network.key)}" ${
                        network.key === this._networkKey ? "selected" : ""
                      }>${escapeHtml(network.name)}</option>`,
                  )
                  .join("")}
              </select>
            </div>
            <div class="dialog-columns">
              <div>
                <h2>Available stations</h2>
                <p class="hint">Click artwork to add it to your selection.</p>
                ${this._renderGrid(available, "No stations for this service.", {
                  selectAction: "add-station",
                })}
              </div>
              <div>
                <h2>Selected favourites</h2>
                <p class="hint">Minus removes a station from the selection.</p>
                ${this._renderGrid(selected, "Nothing selected yet.", {
                  removeAction: "remove-pending",
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
}

declare global {
  interface HTMLElementTagNameMap {
    [SETTINGS_ELEMENT]: DifmRadioSettings;
  }
}
