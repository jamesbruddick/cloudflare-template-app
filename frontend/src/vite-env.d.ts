/// <reference types="vite/client" />

/**
 * The commit this bundle was built from, injected by `define` in vite.config.ts. `commit` is empty when the
 * build ran outside a git checkout.
 */
declare const __BUILD_VERSION__: { commit: string; dirty: boolean };
