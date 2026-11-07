/** Register a custom element against whatever registry HA currently exposes. */

export function defineCardElement(name: string, constructor: CustomElementConstructor): void {
  try {
    if (!customElements.get(name)) {
      customElements.define(name, constructor);
    }
  } catch {
    // Already defined in this registry, or a double-load race.
  }
}

/**
 * After HA's scoped custom-element registry is installed, re-define if the
 * earlier define landed in the native registry and is invisible to Lovelace.
 */
export function ensureDefinedAfterFrontend(
  name: string,
  constructor: CustomElementConstructor,
): void {
  const retry = () => {
    try {
      if (!customElements.get(name)) {
        customElements.define(name, constructor);
      }
    } catch {
      // Ignore — element may already exist under another registry view.
    }
    rebuildFailedCards(name);
  };

  if (customElements.get("home-assistant")) {
    retry();
    return;
  }

  void customElements.whenDefined("home-assistant").then(retry);
  window.setTimeout(retry, 2500);
}

/** Ask Lovelace to rebuild cards that failed with "Custom element doesn't exist". */
export function rebuildFailedCards(tagName: string): void {
  const visit = (root: Document | ShadowRoot | Element) => {
    const nodes =
      "querySelectorAll" in root
        ? root.querySelectorAll("*")
        : ([] as unknown as NodeListOf<Element>);
    for (const node of Array.from(nodes)) {
      if (node.shadowRoot) {
        visit(node.shadowRoot);
      }
      const config = (node as HTMLElement & { config?: { type?: string } }).config;
      const type = typeof config?.type === "string" ? config.type : "";
      if (type === tagName || type === `custom:${tagName}`) {
        node.dispatchEvent(
          new Event("ll-rebuild", { bubbles: true, composed: true }),
        );
      }
      // Error placeholders created by create-element-base often expose _config.
      const internal = (node as HTMLElement & { _config?: { type?: string } })._config;
      const internalType = typeof internal?.type === "string" ? internal.type : "";
      if (internalType === tagName || internalType === `custom:${tagName}`) {
        node.dispatchEvent(
          new Event("ll-rebuild", { bubbles: true, composed: true }),
        );
      }
    }
  };

  window.setTimeout(() => {
    try {
      visit(document);
    } catch {
      // Best-effort heal only.
    }
  }, 100);
}
