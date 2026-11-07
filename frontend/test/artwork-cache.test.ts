import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearArtworkCache,
  loadArtwork,
  peekArtwork,
  prefetchArtwork,
} from "../src/artwork-cache";

describe("artwork-cache", () => {
  beforeEach(() => {
    clearArtworkCache();
  });

  it("caches successful loads and reuses them", async () => {
    const OriginalImage = globalThis.Image;
    class FakeImage {
      onload: ((ev: Event) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      decoding = "";
      set src(_url: string) {
        queueMicrotask(() => this.onload?.(new Event("load")));
      }
    }
    vi.stubGlobal("Image", FakeImage);

    await loadArtwork("https://cdn.example/a.jpg");
    expect(peekArtwork("https://cdn.example/a.jpg")).toBe("https://cdn.example/a.jpg");

    const second = loadArtwork("https://cdn.example/a.jpg");
    await expect(second).resolves.toBe("https://cdn.example/a.jpg");

    prefetchArtwork(["https://cdn.example/a.jpg", null, "https://cdn.example/b.jpg"]);
    await vi.waitFor(() => {
      expect(peekArtwork("https://cdn.example/b.jpg")).toBe("https://cdn.example/b.jpg");
    });

    vi.stubGlobal("Image", OriginalImage);
  });
});
