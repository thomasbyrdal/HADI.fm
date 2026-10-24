import { findRadioEntity, normalizeConfig } from "./model";
import { EDITOR_STYLES } from "./styles";
import { CARD_TYPE, type CardConfig, type HomeAssistant, type NormalizedConfig } from "./types";

export class DifmRadioCardEditor extends HTMLElement {
  private _config: NormalizedConfig = normalizeConfig({});
  private _hass: HomeAssistant | null = null;

  setConfig(config: CardConfig): void {
    this._config = normalizeConfig(config);
    this._render();
  }

  set hass(hass: HomeAssistant) {
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

  private _render(): void {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    const config = this._config;
    const entities = mediaPlayers(this._hass);
    this.shadowRoot!.innerHTML = `
      <style>${EDITOR_STYLES}</style>
      <div class="field">
        <label for="entity">DI.FM Radio entity</label>
        <select id="entity">
          <option value="">Select entity</option>
          ${entities.map((id) => option(id, config.entity)).join("")}
        </select>
        <div class="hint">Favourites come from this entity, not from the card YAML.</div>
      </div>
      <div class="field">
        <label for="speaker">Speaker override</label>
        <select id="speaker">
          <option value="">Use integration default</option>
          ${entities.map((id) => option(id, config.media_player)).join("")}
        </select>
      </div>
      <div class="field">
        <label for="title">Title</label>
        <input id="title" type="text" value="${escapeAttr(config.title)}">
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

  private _bind(): void {
    const root = this.shadowRoot;
    if (!root) {
      return;
    }
    root.querySelector<HTMLSelectElement>("#entity")?.addEventListener("change", (event) => {
      this._update({ entity: (event.target as HTMLSelectElement).value });
    });
    root.querySelector<HTMLSelectElement>("#speaker")?.addEventListener("change", (event) => {
      this._update({ media_player: (event.target as HTMLSelectElement).value });
    });
    root.querySelector<HTMLInputElement>("#title")?.addEventListener("change", (event) => {
      this._update({ title: (event.target as HTMLInputElement).value });
    });
    root.querySelector<HTMLInputElement>("#columns")?.addEventListener("change", (event) => {
      this._update({ columns: Number((event.target as HTMLInputElement).value) });
    });
    for (const key of ["show_names", "show_service_labels", "show_volume"] as const) {
      root.querySelector<HTMLInputElement>(`#${key}`)?.addEventListener("change", (event) => {
        this._update({ [key]: (event.target as HTMLInputElement).checked });
      });
    }
  }

  private _update(patch: Partial<CardConfig>): void {
    const next: CardConfig = {
      type: CARD_TYPE,
      entity: patch.entity ?? this._config.entity,
      media_player: patch.media_player ?? this._config.media_player,
      title: patch.title ?? this._config.title,
      columns: patch.columns ?? this._config.columns,
      show_names: patch.show_names ?? this._config.show_names,
      show_service_labels: patch.show_service_labels ?? this._config.show_service_labels,
      show_volume: patch.show_volume ?? this._config.show_volume,
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
}

function mediaPlayers(hass: HomeAssistant | null): string[] {
  if (!hass) {
    return [];
  }
  return Object.keys(hass.states)
    .filter((entityId) => entityId.startsWith("media_player."))
    .sort();
}

function option(value: string, selected: string): string {
  return `<option value="${escapeAttr(value)}" ${value === selected ? "selected" : ""}>${escapeAttr(value)}</option>`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}
