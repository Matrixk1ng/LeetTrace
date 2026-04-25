import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'LeetTrace',
  version: '0.1.0',
  permissions: ['sidePanel', 'activeTab', 'tabs', 'storage'],
  host_permissions: ['https://leetcode.com/*'],
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
  ],
  action: {
    default_title: 'LeetTrace',
  },
})