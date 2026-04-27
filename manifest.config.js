import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'LeetTrace',
  version: '0.1.0',
  permissions: ['sidePanel', 'activeTab', 'tabs', 'storage', 'offscreen'],
  host_permissions: ['https://leetcode.com/*'],
  // Pyodide uses WebAssembly.instantiateStreaming, which requires
  // 'wasm-unsafe-eval' in script-src. This token is allowed by Chrome MV3
  // (unlike remote origins); no other deviations from the default CSP.
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
  content_scripts: [
    {
      matches: ['https://leetcode.com/problems/*'],
      js: ['src/content/index.ts'],
      css: ['src/content/styles.css'],
      run_at: 'document_idle',
    },
  ],
  side_panel: {
    default_path: 'index.html',
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  web_accessible_resources: [
    {
      resources: ['monaco-bridge.js'],
      matches: ['https://leetcode.com/*'],
    },
    {
      // Pyodide is loaded as ESM by the offscreen document via
      // chrome.runtime.getURL('pyodide/...'). Same-origin extension fetches
      // don't strictly need WAR, but listing them keeps it explicit and lets
      // future contexts (e.g. a debug page) load them too.
      resources: ['pyodide/*'],
      matches: ['<all_urls>'],
    },
  ],
  action: {
    default_title: 'LeetTrace',
  },
})
