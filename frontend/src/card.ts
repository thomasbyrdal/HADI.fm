import { ICON_PLAY, ICON_RADIO, ICON_STOP } from "./icons";
import {
  cardSize,
  deriveView,
  errorMessage,
  findRadioEntity,
  networkLabel,
  normalizeConfig,
  playServiceData,
  sanitizeError,
  selectedFavourite,
  shouldIgnoreTap,
  viewSignature,
} from "./model";
import { CARD_STYLES } from "./styles";
import {
  CARD_TYPE,
  DOMAIN,
  PLAY_STATION,
  STOP,
  type CardConfig,
  type CardView,
  type FavouriteTile,
  type HomeAssistant,
  type NormalizedConfig,
} from "./types";

export class DifmRadioCard extends HTMLElement {
  private _config: NormalizedConfig = normalizeConfig({});
  private _hass: HomeAssistant | null = null;
  private _view: CardView = deriveView(null, this._config);
  private _signature = "";
  private _pendingStation: string | null = null;
  private _localError: string | null = null;
  private _lastTapAt = 0;

  static getStubConfig(hass?: HomeAssistant): CardConfig {
    return {
      type: CARD_TYPE,
      entity: findRadioEntity(hass ?? null) ?? "",
      show_names: true,
      show_service_labels: true,
      show_volume: true,
    };
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("difm-radio-card-editor");
  }

  setConfig(config: CardConfig): void {
    this._config = normalizeConfig(config);
    this._render();
  }

  set hass(hass: HomeAssistant) {
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

  getCardSize(): number {
    return cardSize(this._view.favourites.length, this._config.columns);
  }

  connectedCallback(): void {
    this._render();
  }

  disconnectedCallback(): void {
    this._pendingStation = null;
  }

  private _render(): void {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    const view = this._view;
    const error = this._localError || view.lastError;
    const rootTag = customElements.get("ha-card") ? "ha-card" : "div";
    this.shadowRoot!.innerHTML = `
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

  private _speakerHtml(view: CardView): string {
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
        ${view.speakers
          .map((speaker) => {
            const isSelected = speaker.id === selected ? "selected" : "";
            return `<option value="${escapeAttr(speaker.id)}" ${isSelected}>${escapeHtml(speaker.name)}</option>`;
          })
          .join("")}
      </select>
    </div>`;
  }

  private _gridHtml(view: CardView): string {
    if (view.missingEntity) {
      return `<div class="empty">Select the DI.FM Radio media player in the card editor.</div>`;
    }
    if (!view.available) {
      return `<div class="empty">DI.FM Radio is unavailable.</div>`;
    }
    if (!view.favourites.length) {
      return `<div class="empty">Add favourite stations under Settings → Devices &amp; services → DI.FM Radio → Configure → Favourite stations.</div>`;
    }
    const gridClass = this._config.columns > 0 ? "grid fixed" : "grid";
    const columns = this._config.columns > 0 ? `--columns:${this._config.columns};` : "";
    return `<div class="${gridClass}" style="${columns}" role="list">
      ${view.favourites.map((tile) => this._tileHtml(tile, view)).join("")}
    </div>`;
  }

  private _tileHtml(tile: FavouriteTile, view: CardView): string {
    const currentId = this._pendingStation || view.stationId;
    const active = Boolean(tile.playing || (currentId === tile.id && (view.playing || view.buffering || this._pendingStation)));
    const loading = this._pendingStation === tile.id || (view.buffering && view.stationId === tile.id);
    const disabled = !tile.available || Boolean(this._pendingStation);
    const art = tile.artwork_url
      ? `<img src="${escapeAttr(tile.artwork_url)}" alt="" loading="lazy">`
      : ICON_RADIO;
    return `<button class="tile${tile.available ? "" : " unavailable"}" type="button" role="listitem"
      data-station-id="${escapeAttr(tile.id)}" aria-pressed="${active ? "true" : "false"}"
      ${disabled ? "disabled" : ""} title="${escapeAttr(tile.name)}">
      <span class="art">${art}</span>
      ${this._config.show_names ? `<span class="name">${escapeHtml(tile.name)}</span>` : ""}
      ${this._config.show_service_labels ? `<span class="service">${escapeHtml(networkLabel(tile.network) ?? tile.network)}</span>` : ""}
      ${loading ? `<span class="spinner" aria-hidden="true"></span>` : ""}
    </button>`;
  }

  private _nowPlayingHtml(view: CardView): string {
    const selected = selectedFavourite(view.favourites, this._pendingStation || view.stationId);
    const name = selected?.name || view.stationName || "Select a station";
    const artwork = selected?.artwork_url || view.stationArtwork;
    const art = artwork
      ? `<img src="${escapeAttr(artwork)}" alt="${escapeAttr(name)}">`
      : ICON_RADIO;
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

  private _volumeHtml(view: CardView): string {
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

  private _bind(): void {
    this.shadowRoot?.querySelector<HTMLSelectElement>(".speaker-select")?.addEventListener("change", (event) => {
      this._setSpeaker((event.target as HTMLSelectElement).value);
    });
    this.shadowRoot?.querySelectorAll<HTMLButtonElement>(".tile").forEach((button) => {
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
    const slider = this.shadowRoot?.querySelector<HTMLInputElement>(".vol");
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

  private _setSpeaker(entityId: string): void {
    const next: CardConfig = {
      type: CARD_TYPE,
      entity: this._config.entity,
      title: this._config.title,
      columns: this._config.columns,
      show_names: this._config.show_names,
      show_service_labels: this._config.show_service_labels,
      show_volume: this._config.show_volume,
    };
    if (entityId) {
      next.media_player = entityId;
    }
    this._config = normalizeConfig(next);
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: next },
        bubbles: true,
        composed: true,
      }),
    );
    if (this._hass) {
      this._view = deriveView(this._hass, this._config);
      this._signature = viewSignature(this._view);
    }
    this._render();
  }

  private async _play(stationId: string): Promise<void> {
    if (
      shouldIgnoreTap(
        Boolean(this._pendingStation),
        this._lastTapAt,
        Date.now(),
        stationId,
        this._view.stationId,
        this._view.playing,
      )
    ) {
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
        playServiceData(stationId, this._config.media_player),
      );
    } catch (err) {
      this._localError = errorMessage(null, sanitizeError(err instanceof Error ? err.message : String(err)));
    } finally {
      this._pendingStation = null;
      this._render();
    }
  }

  private async _stop(): Promise<void> {
    this._localError = null;
    try {
      await this._hass?.callService(DOMAIN, STOP, {});
    } catch (err) {
      this._localError = errorMessage(null, sanitizeError(err instanceof Error ? err.message : String(err)));
      this._render();
    }
  }

  private async _setVolume(level: number): Promise<void> {
    const entityId = this._view.volume.entityId;
    if (!entityId || !this._view.volume.supported) {
      return;
    }
    try {
      await this._hass?.callService("media_player", "volume_set", {
        entity_id: entityId,
        volume_level: Math.min(1, Math.max(0, level)),
      });
    } catch (err) {
      this._localError = errorMessage(null, sanitizeError(err instanceof Error ? err.message : String(err)));
      this._render();
    }
  }
}

function playDisabled(view: CardView, selected: FavouriteTile | null): boolean {
  const stationId = selected?.id || view.stationId;
  return !stationId || !view.available || view.playing || view.buffering;
}

function stopDisabled(view: CardView): boolean {
  return !view.owned && !view.playing && !view.buffering;
}

function stateLabel(view: CardView, pending: string | null): string {
  if (pending || view.buffering) {
    return "Starting…";
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

function metaLine(view: CardView, selected: FavouriteTile | null): string {
  const network = networkLabel(selected?.network || view.network) ?? view.networkLabel;
  const speaker = view.speakers.find((item) => item.id === view.speakerEntityId)?.name || view.speakerEntityId;
  return [network, speaker].filter(Boolean).join(" · ");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
