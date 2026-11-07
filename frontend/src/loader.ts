/**
 * Tiny Lovelace resource entry. Waits for Home Assistant's scoped custom-element
 * registry, then loads the real card bundle so define() lands in the registry
 * Lovelace actually uses. Avoids intermittent "Configuration error".
 */

const BUNDLE_NAME = "difm-radio-card.bundle.js";

function bundleUrl(): string {
  // Preserve the loader's ?v= cache-buster on the sibling bundle URL.
  return new URL(`./${BUNDLE_NAME}`, import.meta.url).href;
}

function whenFrontendReady(): Promise<void> {
  if (customElements.get("home-assistant")) {
    return Promise.resolve();
  }
  return Promise.race([
    customElements.whenDefined("home-assistant").then(() => undefined),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, 10_000);
    }),
  ]);
}

async function boot(): Promise<void> {
  await whenFrontendReady();
  // Dynamic import after HA boot so define() uses the scoped registry.
  await import(/* webpackIgnore: true */ bundleUrl());
}

void boot().catch((err) => {
  console.error("[DI.FM Radio] Failed to load card bundle", err);
});
