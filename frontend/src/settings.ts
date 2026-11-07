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

export class DifmRadioSettings extends HTMLElement {
  private _hass: HomeAssistant | null = null;
  private _narrow = false;
  private _panel: PanelInfo | null = null;
  private _loaded = false;
  private _loading = false;
  private _saving = false;
  private _error: string | null = null;
  private _status: string | null = null;
  private _config: SettingsConfig | null = null;
  private _speaker = "";
  private _quality = "";
  private _favouriteIds: string[] = [];
  private _addOpen = false;
  private _networkKey = "";
  private _pendingIds: string[] = [];
  private _bound = false;

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    if (!this._loaded && !this._loading) {
      void this._load();
    } else {
      this._render();
    }
  }

  set narrow(narrow: boolean) {
    this._narrow = Boolean(narrow);
    this._render();
  }

  set panel(panel: PanelInfo) {
    this._panel = panel;
    this._render();
  }

  connectedCallback(): void {
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

  disconnectedCallback(): void {
    if (this._bound) {
      this.removeEventListener("click", this._onClick);
      this.removeEventListener("change", this._onChange);
      this._bound = false;
    }
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
    const target = event.target as HTMLSelectElement | null;
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

  private _openAddDialog(): void {
    const networks = this._config?.networks ?? [];
    this._pendingIds = [...this._favouriteIds];
    this._networkKey =
      this._networkKey ||
      networks[0]?.key ||
      this._config?.stations[0]?.network ||
      "";
    this._addOpen = true;
    this._render();
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

  private async _save(): Promise<void> {
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
      const result = await this._hass.callWS<{
        default_media_player: string;
        stream_quality: string;
        favourites: StationOption[];
      }>({
        type: WS_SET_CONFIG,
        default_media_player: this._speaker,
        stream_quality: this._quality,
        favourites: this._favouriteIds,
      });
      if (this._config) {
        this._config = {
          ...this._config,
          default_media_player: result.default_media_player,
          stream_quality: result.stream_quality,
          favourites: result.favourites,
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
    const art = station.artwork_url
      ? `<img src="${escapeHtml(station.artwork_url)}" alt="" loading="lazy" />`
      : `<div class="placeholder">${escapeHtml(station.name)}</div>`;
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
              <h2>Playback</h2>
              <p class="hint">Default speaker and stream quality used when you tap a favourite.</p>
              <div class="field">
                <label for="speaker">Default speaker</label>
                <select id="speaker" name="speaker">
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
                <select id="quality" name="quality">
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
            </div>
            <div class="section">
              <h2>Favourite stations</h2>
              <p class="hint">Artwork grid of stations shown on the dashboard card. Use the minus control to remove a favourite.</p>
              ${this._renderGrid(favourites, "No favourite stations yet.", {
                removeAction: "remove-favourite",
              })}
              <div class="actions">
                <button type="button" class="secondary" data-action="open-add">Add favourite station</button>
                <button type="button" class="primary" data-action="save" ${
                  this._saving ? "disabled" : ""
                }>${this._saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          `
          }
        </div>
      </div>
      ${this._addOpen ? this._renderAddDialog(networks) : ""}
    `;
    void this._narrow;
    void this._panel;
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
              <select id="network" name="network">
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
