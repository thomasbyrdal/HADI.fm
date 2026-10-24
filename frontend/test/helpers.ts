import type { HassEntity, HomeAssistant } from "../src/types";

export interface MockHass extends HomeAssistant {
  calls: Array<{ domain: string; service: string; data?: Record<string, unknown> }>;
}

export function entity(
  entityId: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HassEntity {
  return { entity_id: entityId, state, attributes };
}

export function radioEntity(overrides: Partial<HassEntity> = {}): HassEntity {
  return entity("media_player.di_fm_radio", "idle", {
    integration: "difm_radio",
    friendly_name: "DI.FM Radio",
    media_title: null,
    volume_level: 0.4,
    supported_features: 4 | 4096 | 512,
    station_id: null,
    network: null,
    owned: false,
    last_error: null,
    speaker_entity_id: "media_player.living_room",
    favourites: [
      {
        id: "1",
        name: "Trance",
        network: "di",
        key: "trance",
        available: true,
        artwork_url: "https://cdn-images.audioaddict.com/trance.png",
        playing: false,
      },
      {
        id: "12",
        name: "Ambient",
        network: "di",
        key: "ambient",
        available: true,
        artwork_url: null,
        playing: false,
      },
      {
        id: "999",
        name: "XChiptunes",
        network: "di",
        key: "chiptunes",
        available: false,
        artwork_url: null,
        playing: false,
      },
    ],
    ...overrides.attributes,
  });
}

export function createHass(
  states: Record<string, HassEntity> = {},
  callImpl?: MockHass["callService"],
): MockHass {
  const calls: MockHass["calls"] = [];
  const hass: MockHass = {
    states: {
      "media_player.living_room": entity("media_player.living_room", "idle", {
        volume_level: 0.4,
        supported_features: 4,
      }),
      ...states,
    },
    calls,
    callService: async (domain, service, data) => {
      calls.push({ domain, service, data });
      if (callImpl) {
        return callImpl(domain, service, data);
      }
      return undefined;
    },
  };
  if (!hass.states["media_player.di_fm_radio"]) {
    hass.states["media_player.di_fm_radio"] = radioEntity();
  }
  return hass;
}
