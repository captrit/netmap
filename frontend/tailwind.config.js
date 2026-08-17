/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#000000',
        surface: {
          50: '#171717',
          100: '#0a0a0a',
          200: '#121212',
          300: '#1e1e1e',
          400: '#262626',
          500: '#333333',
        },
        border: {
          subtle: 'rgba(255, 255, 255, 0.08)',
          glow: 'rgba(255, 255, 255, 0.18)',
        },
        accent: {
          blue: '#0070f3',
          purple: '#7928ca',
          cyan: '#00dfd8',
          green: '#00df72',
          amber: '#f5a623',
          rose: '#ff0080',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite alternate',
        'scan-line': 'scanLine 2.5s linear infinite',
      },
      keyframes: {
        glowPulse: {
          '0%': { boxShadow: '0 0 15px rgba(0, 112, 243, 0.2), 0 0 30px rgba(0, 112, 243, 0.1)' },
          '100%': { boxShadow: '0 0 25px rgba(0, 223, 216, 0.4), 0 0 50px rgba(0, 223, 216, 0.2)' },
        },
        scanLine: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(1000%)' },
        },
      },
    },
  },
  plugins: [],
};
