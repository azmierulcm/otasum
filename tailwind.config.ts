import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          coral: '#FF5A5F',
          navy: '#1B2B5E',
          teal: '#00A699',
          orange: '#FC642D',
          dark: '#484848',
          mid: '#767676',
        },
        module: {
          ofp: '#1B2B5E',
          wx: '#0EA5E9',
          notam: '#D97706',
          ws: '#FC642D',
          edto: '#00A699',
          fuel: '#FF5A5F',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'Menlo', 'monospace'],
      },
      keyframes: {
        shimmer: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(350%)' },
        },
        'progress-pop': {
          '0%':   { opacity: '1', transform: 'scaleY(1)' },
          '80%':  { opacity: '1', transform: 'scaleY(1)' },
          '100%': { opacity: '0', transform: 'scaleY(0)' },
        },
        fly: {
          '0%': { transform: 'translateX(-80px) translateY(8px)', opacity: '0' },
          '8%': { opacity: '1' },
          '92%': { opacity: '1' },
          '100%': { transform: 'translateX(calc(100% + 80px)) translateY(-8px)', opacity: '0' },
        },
        'pulse-ring': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.8' },
          '50%': { transform: 'scale(1.15)', opacity: '0.4' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        fly: 'fly 2.8s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.4s ease-out forwards',
        'slide-up': 'slide-up 0.5s ease-out forwards',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
        'progress-pop': 'progress-pop 0.6s ease-out forwards',
      },
      boxShadow: {
        airbnb: '0 6px 20px rgba(0,0,0,0.12)',
        card: '0 2px 8px rgba(0,0,0,0.08)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.14)',
      },
    },
  },
  plugins: [],
};

export default config;
