export const CARD_TYPE = "custom:difm-radio-card";
export const DOMAIN = "difm_radio";
export const PLAY_STATION = "play_station";
export const STOP = "stop";
export const VOLUME_SET = 4;
export const TAP_DEBOUNCE_MS = 400;

export interface CardConfig {
  type?: string;
  entity?: string;
  media_player?: string;
  title?: string;
  columns?: number;
  show_names?: boolean;
  show_service_labels?: boolean;
  show_volume?: boolean;
}

export interface NormalizedConfig {
  type: string;
  entity: string;
  media_player: string;
  title: string;
  columns: number;
  show_names: boolean;
  show_service_labels: boolean;
  show_volume: boolean;
}

export interface FavouriteTile {
  id: string;
  name: string;
  network: string;
  key: string;
  available: boolean;
  artwork_url: string | null;
  playing: boolean;
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  callService: (domain: string, service: string, data?: Record<string, unknown>) => Promise<unknown> | unknown;
}

export interface VolumeInfo {
  level: number | null;
  entityId: string | null;
  supported: boolean;
}

export interface SpeakerChoice {
  id: string;
  name: string;
}

export interface CardView {
  entityId: string;
  available: boolean;
  missingEntity: boolean;
  state: string;
  stationId: string | null;
  stationName: string | null;
  stationArtwork: string | null;
  network: string | null;
  networkLabel: string | null;
  speakerEntityId: string | null;
  speakers: SpeakerChoice[];
  owned: boolean;
  lastError: string | null;
  lastErrorCode: string | null;
  favourites: FavouriteTile[];
  volume: VolumeInfo;
  playing: boolean;
  buffering: boolean;
}
