/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme palette
        'trace-bg-primary': '#1a1a2e',
        'trace-bg-secondary': '#16213e',
        'trace-bg-card': '#1e2a4a',
        'trace-text-primary': '#e2e8f0',
        'trace-text-secondary': '#94a3b8',
        'trace-text-muted': '#64748b',
        'trace-accent': '#38bdf8',
        'trace-border': '#2d3a5c',
      },
    },
  },
  plugins: [],
}
