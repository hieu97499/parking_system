/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15,23,42,0.04), 0 4px 16px -4px rgba(15,23,42,0.06)',
        soft: '0 8px 24px -12px rgba(37,99,235,0.25)',
      },
    },
  },
  plugins: [],
}
