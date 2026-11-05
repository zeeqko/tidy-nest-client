// Vite config for the e2e dev server only (started by global-setup.ts on
// :15173). It reuses the app's vite.config.ts unchanged except for:
//  - a separate optimizer cache, so it never rewrites node_modules/.vite that
//    the developer's own dev server on :5173 may be using;
//  - no vite-plugin-pwa: its dev mode regenerates dev-dist/sw.js (shared with
//    the developer's server) and the service worker is blocked in the tests
//    anyway (`serviceWorkers: 'block'`).
// The /api and /uploads proxy target comes from E2E_API_TARGET (see
// vite.config.ts), which global-setup.ts sets to the e2e backend on :18080.
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginOption, UserConfig } from "vite";
import baseConfig from "../vite.config";

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function withoutPwa(plugins: PluginOption[] | undefined): PluginOption[] {
  return (plugins ?? []).flat(Infinity as 1).filter((plugin) => {
    const name = plugin && typeof plugin === "object" && "name" in plugin ? String(plugin.name) : "";
    return !name.startsWith("vite-plugin-pwa");
  }) as PluginOption[];
}

const base = baseConfig as UserConfig;

export default {
  ...base,
  root: clientDir,
  cacheDir: path.join(clientDir, "node_modules/.vite-e2e"),
  plugins: withoutPwa(base.plugins),
  server: {
    ...base.server,
    port: 15173,
    strictPort: true,
    // Don't watch e2e artefacts written during the run.
    watch: { ignored: ["**/e2e/**", "**/test-results/**", "**/playwright-report/**"] },
  },
} satisfies UserConfig;
