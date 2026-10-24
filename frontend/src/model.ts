import {
  CARD_TYPE,
  DOMAIN,
  TAP_DEBOUNCE_MS,
  VOLUME_SET,
  type CardConfig,
  type CardView,
  type FavouriteTile,
  type HomeAssistant,
  type NormalizedConfig,
  type SpeakerChoice,
  type VolumeInfo,
} from "./types";

export const NETWORK_LABELS: Record<string, string> = {
  di: "DI.FM",
  radiotunes: "RadioTunes",
  jazzradio: "JAZZRADIO.com",
  rockradio: "ROCKRADIO.COM",
  classicalradio: "ClassicalRadio.com",
  zenradio: "ZenRadio.com",
};

const ERROR_MESSAGES: Record<string, string> = {
  unknown_station: "That station is not in the catalogue.",
  station_unavailable: "That station is currently unavailable.",
  speaker_missing: "The speaker is not available.",
  speaker_incompatible: "The selected entity is not a media player.",
  no_speaker: "No default speaker is configured.",
  invalid_auth: "The listen key was rejected.",
  cannot_connect: "Could not reach the radio service.",
  unsupported_format: "The speaker rejected the stream format.",
  playback_failed: "The speaker could not start the stream.",
};

export function normalizeConfig(config: CardConfig | null | undefined): NormalizedConfig {
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
    show_volume: config.show_volume !== false,
  };
}

export function isRadioEntity(
  hass: HomeAssistant | null | undefined,
  entityId: string,
): boolean {
  if (!entityId.startsWith("media_player.")) {
    return false;
  }
  const attrs = hass?.states[entityId]?.attributes ?? {};
  return attrs.integration === DOMAIN || Array.isArray(attrs.favourites);
}

export function findRadioEntity(hass: HomeAssistant | null | undefined): string | null {
  if (!hass?.states) {
    return null;
  }
  const matches = Object.keys(hass.states)
    .filter((entityId) => isRadioEntity(hass, entityId))
    .sort();
  return matches[0] ?? null;
}

export function resolveRadioEntity(
  hass: HomeAssistant | null | undefined,
  config: NormalizedConfig,
): string {
  const configured = config.entity;
  if (configured && hass?.states[configured] && isRadioEntity(hass, configured)) {
    return configured;
  }
  return findRadioEntity(hass) || configured || "";
}

export function speakerLabel(
  hass: HomeAssistant | null | undefined,
  entityId: string,
): string {
  const name = hass?.states[entityId]?.attributes?.friendly_name;
  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }
  return entityId.replace(/^media_player\./, "").replace(/_/g, " ");
}

export function listSpeakers(
  hass: HomeAssistant | null | undefined,
  radioEntityId: string,
  selectedId: string | null,
): SpeakerChoice[] {
  const byId = new Map<string, SpeakerChoice>();
  if (hass?.states) {
    for (const entityId of Object.keys(hass.states)) {
      if (!isSpeakerEntity(hass, entityId, radioEntityId)) {
        continue;
      }
      byId.set(entityId, { id: entityId, name: speakerLabel(hass, entityId) });
    }
  }
  if (selectedId && isSpeakerEntity(hass, selectedId, radioEntityId) && !byId.has(selectedId)) {
    byId.set(selectedId, { id: selectedId, name: speakerLabel(hass, selectedId) });
  }
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export function speakerIds(speakers: SpeakerChoice[]): string {
  return speakers.map((item) => item.id).sort().join("|");
}

function isSpeakerEntity(
  hass: HomeAssistant | null | undefined,
  entityId: string,
  radioEntityId: string,
): boolean {
  return (
    /^media_player\.[A-Za-z0-9_]+$/.test(entityId) &&
    entityId !== radioEntityId &&
    !isRadioEntity(hass, entityId)
  );
}

export function entitySuggestion(
  hass: HomeAssistant | null | undefined,
  entityId: string,
): { label: string; config: CardConfig } | null {
  if (!isRadioEntity(hass, entityId)) {
    return null;
  }
  return {
    label: "Favourite stations",
    config: {
      type: CARD_TYPE,
      entity: entityId,
    },
  };
}

export function selectedFavourite(
  favourites: FavouriteTile[],
  stationId: string | null,
): FavouriteTile | null {
  if (!stationId) {
    return null;
  }
  return favourites.find((tile) => tile.id === stationId) ?? null;
}

export function networkLabel(network: string | null | undefined): string | null {
  if (!network) {
    return null;
  }
  return NETWORK_LABELS[network] ?? network;
}

export function errorMessage(code: string | null | undefined, fallback?: string | null): string | null {
  if (code && ERROR_MESSAGES[code]) {
    return ERROR_MESSAGES[code];
  }
  if (fallback && fallback.trim()) {
    return sanitizeError(fallback);
  }
  return code ? "Playback failed." : null;
}

export function sanitizeError(text: string): string {
  const withoutUrls = text.replace(/https?:\/\/\S+/gi, "[redacted]");
  return withoutUrls.replace(/listen_key=[^&\s]*/gi, "listen_key=REDACTED");
}

export function parseFavourites(raw: unknown): FavouriteTile[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const tiles: FavouriteTile[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const data = item as Record<string, unknown>;
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
      playing: Boolean(data.playing),
    });
  }
  return tiles;
}

export function resolveVolume(
  hass: HomeAssistant | null | undefined,
  config: NormalizedConfig,
  attrs: Record<string, unknown>,
  logicalVolume: unknown,
  logicalFeatures: unknown,
): VolumeInfo {
  const speakerId =
    config.media_player || (typeof attrs.speaker_entity_id === "string" ? attrs.speaker_entity_id : "");
  const speaker = speakerId && hass?.states[speakerId] ? hass.states[speakerId] : null;
  const logical = config.entity && hass?.states[config.entity] ? hass.states[config.entity] : null;
  const target = speaker ?? logical;
  if (!target) {
    return { level: null, entityId: null, supported: false };
  }
  const features = Number(
    target.attributes.supported_features ?? (target === logical ? logicalFeatures : 0) ?? 0,
  );
  const level = readVolume(target.attributes.volume_level ?? (target === logical ? logicalVolume : null));
  return {
    level,
    entityId: target.entity_id,
    supported: Boolean(features & VOLUME_SET),
  };
}

export function deriveView(hass: HomeAssistant | null | undefined, config: NormalizedConfig): CardView {
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
  const speakerEntityId =
    config.media_player ||
    (typeof attrs.speaker_entity_id === "string" ? attrs.speaker_entity_id : null);
  return {
    entityId,
    available: entity.state !== "unavailable" && entity.state !== "unknown",
    missingEntity: false,
    state: entity.state,
    stationId,
    stationName:
      selected?.name ||
      (typeof entity.attributes.media_title === "string" ? entity.attributes.media_title : null),
    stationArtwork: selected?.artwork_url ?? null,
    network: selected?.network || network,
    networkLabel: networkLabel(selected?.network || network),
    speakerEntityId,
    speakers: listSpeakers(hass, entityId, speakerEntityId),
    owned: Boolean(attrs.owned),
    lastError: errorMessage(
      typeof attrs.last_error === "string" ? attrs.last_error : null,
    ),
    lastErrorCode: typeof attrs.last_error === "string" ? attrs.last_error : null,
    favourites,
    volume: resolveVolume(hass, { ...config, entity: entityId }, attrs, attrs.volume_level ?? entity.attributes.volume_level, entity.attributes.supported_features),
    playing,
    buffering,
  };
}

export function viewSignature(view: CardView): string {
  return JSON.stringify({
    entityId: view.entityId,
    state: view.state,
    stationId: view.stationId,
    owned: view.owned,
    lastError: view.lastErrorCode,
    speakerEntityId: view.speakerEntityId,
    speakers: speakerIds(view.speakers),
    volume: view.volume,
    favourites: view.favourites,
    stationArtwork: view.stationArtwork,
  });
}

export function shouldIgnoreTap(
  pendingStation: string | null,
  lastTapAt: number,
  now: number,
  stationId: string,
  playingStationId: string | null,
  playing: boolean,
): boolean {
  if (stationId === pendingStation || (playing && stationId === playingStationId)) {
    return true;
  }
  return Boolean(lastTapAt && now - lastTapAt < TAP_DEBOUNCE_MS && stationId === playingStationId);
}

export function playServiceData(stationId: string, speakerOverride: string): Record<string, string> {
  const data: Record<string, string> = { station_id: stationId };
  if (speakerOverride) {
    data.media_player = speakerOverride;
  }
  return data;
}

export function cardSize(favouriteCount: number, columns: number): number {
  const cols = columns > 0 ? columns : 4;
  const rows = favouriteCount === 0 ? 1 : Math.ceil(favouriteCount / cols);
  return 4 + rows;
}

function emptyView(entityId: string, missingEntity: boolean): CardView {
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
    buffering: false,
  };
}

function readVolume(value: unknown): number | null {
  const level = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(level)) {
    return null;
  }
  return Math.min(1, Math.max(0, level));
}
