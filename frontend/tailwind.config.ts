import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Cormorant Garamond"', '"Instrument Serif"', 'Georgia', 'serif'],
        sans: ['"Geist"', 'Inter', 'system-ui', 'sans-serif'],
      },
      // Fibonacci spacing scale (px). Use sparingly — most rhythm comes
      // from raw clamp() in the components for true fluid scaling.
      spacing: {
        '0.8': '8px',
        '1.3': '13px',
        '2.1': '21px',
        '3.4': '34px',
        '5.5': '55px',
        '8.9': '89px',
        '13.6': '144px',
        '23.3': '233px',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
export default config;
