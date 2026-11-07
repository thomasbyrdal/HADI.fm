// src/loader.ts
var BUNDLE_NAME = "difm-radio-card.bundle.js";
function bundleUrl() {
  return new URL(`./${BUNDLE_NAME}`, import.meta.url).href;
}
function whenFrontendReady() {
  if (customElements.get("home-assistant")) {
    return Promise.resolve();
  }
  return Promise.race([
    customElements.whenDefined("home-assistant").then(() => void 0),
    new Promise((resolve) => {
      window.setTimeout(resolve, 1e4);
    })
  ]);
}
async function boot() {
  await whenFrontendReady();
  await import(
    /* webpackIgnore: true */
    bundleUrl()
  );
}
void boot().catch((err) => {
  console.error("[DI.FM Radio] Failed to load card bundle", err);
});
