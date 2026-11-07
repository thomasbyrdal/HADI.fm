/** In-memory artwork URL cache so grid re-renders reuse warm browser loads. */

const ready = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

export function peekArtwork(url: string): string | null {
  return ready.get(url) ?? null;
}

export function loadArtwork(url: string): Promise<string> {
  const cached = ready.get(url);
  if (cached) {
    return Promise.resolve(cached);
  }
  const pending = inflight.get(url);
  if (pending) {
    return pending;
  }

  const task = new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      ready.set(url, url);
      inflight.delete(url);
      resolve(url);
    };
    img.onerror = () => {
      inflight.delete(url);
      reject(new Error(`Failed to load artwork: ${url}`));
    };
    img.src = url;
  });

  inflight.set(url, task);
  return task;
}

export function prefetchArtwork(urls: Iterable<string | null | undefined>): void {
  const seen = new Set<string>();
  for (const raw of urls) {
    if (!raw || seen.has(raw) || ready.has(raw) || inflight.has(raw)) {
      continue;
    }
    seen.add(raw);
    void loadArtwork(raw).catch(() => {
      // Keep placeholders for failed URLs; caller hydrates what succeeds.
    });
  }
}

/** Test helper. */
export function clearArtworkCache(): void {
  ready.clear();
  inflight.clear();
}
