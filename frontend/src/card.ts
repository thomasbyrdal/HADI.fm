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
  speakerIds,
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
  private _bound = false;
  private _speakerKey = "";

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
    if (this._hass) {
      this._view = deriveView(this._hass, this._config);
      this._signature = viewSignature(this._view);
    }
    this._render(false);
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
    this._render(false);
  }

  getCardSize(): number {
    return cardSize(this._view.favourites.length, this._config.columns);
  }

  getGridOptions(): Record<string, number | string> {
    return { columns: 12, min_rows: 4 };
  }

  connectedCallback(): void {
    this._render(false);
  }

  disconnectedCallback(): void {
    this._pendingStation = null;
  }

  private _render(force: boolean): void {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    const card = this.shadowRoot!.querySelector(".card");
    if (!card || force) {
      this._mount();
      return;
    }
    this._patch();
  }

  private _mount(): void {
    const view = this._view;
    const rootTag = customElements.get("ha-card") ? "ha-card" : "div";
    this.shadowRoot!.innerHTML = `
      <style>${CARD_STYLES}</style>
      <${rootTag} class="card">
        <div class="header">
          <div class="title"></div>
          <div class="state"></div>
        </div>
        <div class="speaker">
          <label for="speaker">Speaker</label>
          <select id="speaker" class="speaker-select" aria-label="Choose a speaker"></select>
          <div class="empty speaker-empty" hidden>No Home Assistant speakers were found.</div>
        </div>
        <div class="error" role="alert" hidden></div>
        <div class="grid-host"></div>
        <section class="now-playing" aria-label="Now playing">
          <div class="hero-art placeholder">${ICON_RADIO}</div>
          <div class="hero-body">
            <div class="now-name">Select a station</div>
            <div class="now-meta"></div>
            <div class="buttons">
              <button class="icon-button play" type="button" aria-label="Play">${ICON_PLAY}</button>
              <button class="icon-button stop" type="button" aria-label="Stop">${ICON_STOP}</button>
            </div>
            <div class="volume">
              <input class="vol" type="range" min="0" max="100" step="1" value="0" aria-label="Speaker volume">
              <span class="vol-label">0%</span>
            </div>
            <div class="volume-hint" hidden>This speaker does not support volume control.</div>
          </div>
        </section>
      </${rootTag}>
    `;
    this._speakerKey = "";
    this._bind();
    this._patch();
  }

  private _bind(): void {
    if (this._bound || !this.shadowRoot) {
      return;
    }
    this._bound = true;
    const select = this.shadowRoot.querySelector<HTMLSelectElement>(".speaker-select");
    select?.addEventListener("change", (event) => {
      this._setSpeaker((event.target as HTMLSelectElement).value);
    });
    const slider = this.shadowRoot.querySelector<HTMLInputElement>(".vol");
    slider?.addEventListener("input", () => {
      const label = this.shadowRoot?.querySelector(".vol-label");
      if (slider && label) {
        label.textContent = `${slider.value}%`;
      }
    });
    slider?.addEventListener("change", () => {
      if (slider) {
        void this._setVolume(Number(slider.value) / 100);
      }
    });
    this.shadowRoot.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      const tile = target.closest<HTMLButtonElement>(".tile");
      if (tile?.dataset.stationId) {
        void this._play(tile.dataset.stationId);
        return;
      }
      if (target.closest(".play")) {
        const stationId = this._pendingStation || this._view.stationId;
        if (stationId) {
          void this._play(stationId);
        }
        return;
      }
      if (target.closest(".stop")) {
        void this._stop();
      }
    });
  }

  private _patch(): void {
    const root = this.shadowRoot;
    if (!root) {
      return;
    }
    const view = this._view;
    const error = this._localError || view.lastError;
    setText(root.querySelector(".title"), this._config.title);
    setText(root.querySelector(".state"), stateLabel(view, this._pendingStation));
    const errorEl = root.querySelector<HTMLElement>(".error");
    if (errorEl) {
      errorEl.hidden = !error;
      errorEl.textContent = error || "";
    }
    this._patchSpeakers(view);
    this._patchGrid(view);
    this._patchNowPlaying(view);
  }

  private _patchSpeakers(view: CardView): void {
    const select = this.shadowRoot?.querySelector<HTMLSelectElement>(".speaker-select");
    const empty = this.shadowRoot?.querySelector<HTMLElement>(".speaker-empty");
    if (!select || !empty) {
      return;
    }
    if (!view.speakers.length) {
      select.hidden = true;
      empty.hidden = false;
      this._speakerKey = "";
      return;
    }
    select.hidden = false;
    empty.hidden = true;
    const nextKey = speakerIds(view.speakers);
    if (nextKey !== this._speakerKey) {
      const options = document.createDocumentFragment();
      for (const speaker of view.speakers) {
        const option = document.createElement("option");
        option.value = speaker.id;
        option.textContent = speaker.name;
        options.append(option);
      }
      select.replaceChildren(options);
      this._speakerKey = nextKey;
    }
    const selected = view.speakerEntityId || view.speakers[0]?.id || "";
    if (selected && select.value !== selected) {
      select.value = selected;
    }
    select.disabled = false;
  }

  private _patchGrid(view: CardView): void {
    const host = this.shadowRoot?.querySelector(".grid-host");
    if (!host) {
      return;
    }
    if (view.missingEntity) {
      host.innerHTML = `<div class="empty">Select the DI.FM Radio media player in the card editor.</div>`;
      return;
    }
    if (!view.available) {
      host.innerHTML = `<div class="empty">DI.FM Radio is unavailable.</div>`;
      return;
    }
    if (!view.favourites.length) {
      host.innerHTML = `<div class="empty">Add favourite stations under Settings → Devices &amp; services → DI.FM Radio → Configure → Favourite stations.</div>`;
      return;
    }
    let grid = host.querySelector<HTMLElement>(".grid");
    const favouriteKey = view.favourites.map((tile) => tile.id).join("|");
    if (!grid || grid.dataset.ids !== favouriteKey) {
      const gridClass = this._config.columns > 0 ? "grid fixed" : "grid";
      const columns = this._config.columns > 0 ? `--columns:${this._config.columns};` : "";
      host.innerHTML = `<div class="${gridClass}" style="${columns}" role="list" data-ids="${escapeAttr(favouriteKey)}"></div>`;
      grid = host.querySelector<HTMLElement>(".grid");
      if (grid) {
        grid.replaceChildren(...view.favourites.map((tile) => this._createTile(tile)));
      }
    }
    view.favourites.forEach((tile) => this._patchTile(tile, view));
  }

  private _createTile(tile: FavouriteTile): HTMLButtonElement {
    const button = document.createElement("button");
    button.className = "tile";
    button.type = "button";
    button.setAttribute("role", "listitem");
    button.dataset.stationId = tile.id;
    button.title = tile.name;
    const art = document.createElement("span");
    art.className = "art";
    if (tile.artwork_url) {
      const img = document.createElement("img");
      img.src = tile.artwork_url;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("error", () => {
        art.innerHTML = ICON_RADIO;
      });
      art.append(img);
    } else {
      art.innerHTML = ICON_RADIO;
    }
    button.append(art);
    if (this._config.show_names) {
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = tile.name;
      button.append(name);
    }
    if (this._config.show_service_labels) {
      const service = document.createElement("span");
      service.className = "service";
      service.textContent = networkLabel(tile.network) ?? tile.network;
      button.append(service);
    }
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.hidden = true;
    spinner.setAttribute("aria-hidden", "true");
    button.append(spinner);
    return button;
  }

  private _patchTile(tile: FavouriteTile, view: CardView): void {
    const button = this.shadowRoot?.querySelector<HTMLButtonElement>(
      `.tile[data-station-id="${cssEscape(tile.id)}"]`,
    );
    if (!button) {
      return;
    }
    const currentId = this._pendingStation || view.stationId;
    const active = Boolean(
      tile.playing || (currentId === tile.id && (view.playing || view.buffering || this._pendingStation)),
    );
    const loading = this._pendingStation === tile.id || (view.buffering && view.stationId === tile.id);
    button.classList.toggle("unavailable", !tile.available);
    button.disabled = !tile.available;
    button.setAttribute("aria-pressed", active ? "true" : "false");
    const spinner = button.querySelector<HTMLElement>(".spinner");
    if (spinner) {
      spinner.hidden = !loading;
    }
  }

  private _patchNowPlaying(view: CardView): void {
    const selected = selectedFavourite(view.favourites, this._pendingStation || view.stationId);
    const name = selected?.name || view.stationName || "Select a station";
    const artwork = selected?.artwork_url || view.stationArtwork;
    const hero = this.shadowRoot?.querySelector<HTMLElement>(".hero-art");
    if (hero) {
      const current = hero.querySelector("img")?.getAttribute("src") || "";
      if (artwork && current !== artwork) {
        hero.classList.remove("placeholder");
        hero.innerHTML = `<img src="${escapeAttr(artwork)}" alt="${escapeAttr(name)}">`;
        const img = hero.querySelector("img");
        img?.addEventListener("error", () => {
          hero.classList.add("placeholder");
          hero.innerHTML = ICON_RADIO;
        });
      } else if (!artwork && !hero.classList.contains("placeholder")) {
        hero.classList.add("placeholder");
        hero.innerHTML = ICON_RADIO;
      }
    }
    setText(this.shadowRoot?.querySelector(".now-name") ?? null, name);
    setText(this.shadowRoot?.querySelector(".now-meta") ?? null, metaLine(view, selected));
    const play = this.shadowRoot?.querySelector<HTMLButtonElement>(".play");
    const stop = this.shadowRoot?.querySelector<HTMLButtonElement>(".stop");
    if (play) {
      play.disabled = playDisabled(view, selected);
    }
    if (stop) {
      stop.disabled = stopDisabled(view);
    }
    this._patchVolume(view);
  }

  private _patchVolume(view: CardView): void {
    const slider = this.shadowRoot?.querySelector<HTMLInputElement>(".vol");
    const label = this.shadowRoot?.querySelector(".vol-label");
    const row = this.shadowRoot?.querySelector<HTMLElement>(".volume");
    const hint = this.shadowRoot?.querySelector<HTMLElement>(".volume-hint");
    if (!this._config.show_volume) {
      if (row) {
        row.hidden = true;
      }
      if (hint) {
        hint.hidden = true;
      }
      return;
    }
    if (!view.volume.supported) {
      if (row) {
        row.hidden = true;
      }
      if (hint) {
        hint.hidden = false;
      }
      return;
    }
    if (row) {
      row.hidden = false;
    }
    if (hint) {
      hint.hidden = true;
    }
    const percent = view.volume.level == null ? 0 : Math.round(view.volume.level * 100);
    if (slider && slider.value !== String(percent) && this.shadowRoot?.activeElement !== slider) {
      slider.value = String(percent);
    }
    if (label && this.shadowRoot?.activeElement !== slider) {
      label.textContent = `${percent}%`;
    }
    if (slider) {
      slider.disabled = false;
    }
  }

  private _setSpeaker(entityId: string): void {
    if (!entityId || entityId === this._config.media_player) {
      return;
    }
    const next: CardConfig = {
      type: CARD_TYPE,
      entity: this._config.entity,
      media_player: entityId,
      title: this._config.title,
      columns: this._config.columns,
      show_names: this._config.show_names,
      show_service_labels: this._config.show_service_labels,
      show_volume: this._config.show_volume,
    };
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
    this._patch();
  }

  private async _play(stationId: string): Promise<void> {
    if (
      shouldIgnoreTap(
        this._pendingStation,
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
    this._patch();
    try {
      await this._hass?.callService(
        DOMAIN,
        PLAY_STATION,
        playServiceData(stationId, this._config.media_player),
      );
    } catch (err) {
      this._localError = errorMessage(null, sanitizeError(err instanceof Error ? err.message : String(err)));
    } finally {
      if (this._pendingStation === stationId) {
        this._pendingStation = null;
      }
      this._patch();
    }
  }

  private async _stop(): Promise<void> {
    this._localError = null;
    try {
      await this._hass?.callService(DOMAIN, STOP, {});
    } catch (err) {
      this._localError = errorMessage(null, sanitizeError(err instanceof Error ? err.message : String(err)));
      this._patch();
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
      this._patch();
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
  const speaker =
    view.speakers.find((item) => item.id === view.speakerEntityId)?.name || view.speakerEntityId;
  return [network, speaker].filter(Boolean).join(" · ");
}

function setText(element: Element | null, value: string): void {
  if (element && element.textContent !== value) {
    element.textContent = value;
  }
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
