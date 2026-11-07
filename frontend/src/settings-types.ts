export const SETTINGS_ELEMENT = "difm-radio-settings";
export const WS_GET_CONFIG = "difm_radio/get_config";
export const WS_SET_CONFIG = "difm_radio/set_config";
export const GRID_COLUMNS = 5;
export const GRID_VISIBLE_ROWS = 5;

export interface MediaPlayerOption {
  entity_id: string;
  name: string;
}

export interface QualityOption {
  value: string;
  label: string;
}

export interface NetworkOption {
  key: string;
  name: string;
}

export interface StationOption {
  id: string;
  name: string;
  network: string;
  key: string;
  artwork_url: string | null;
  available: boolean;
}

export interface SettingsConfig {
  default_media_player: string | null;
  stream_quality: string;
  listen_key: string;
  qualities: QualityOption[];
  media_players: MediaPlayerOption[];
  networks: NetworkOption[];
  stations: StationOption[];
  favourites: StationOption[];
}

export interface HomeAssistant {
  states: Record<string, { entity_id: string; state: string; attributes: Record<string, unknown> }>;
  callWS: <T>(msg: Record<string, unknown>) => Promise<T>;
  localize?: (key: string, ...args: unknown[]) => string;
}

export interface PanelInfo {
  config?: Record<string, unknown>;
}
