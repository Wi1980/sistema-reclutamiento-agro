/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Azul marino (color primario)
        agro: {
          50:  '#EEF2FF',
          100: '#E0E8FF',
          200: '#C2CFFE',
          300: '#92AAFF',
          400: '#6080F8',
          500: '#3A5AE8',
          600: '#2440C4',
          700: '#1B3A8A',  // azul del logo
          800: '#142D6B',
          900: '#0D1E48',  // sidebar oscuro
          950: '#070F26',
        },
        // Verde bosque — "Norte" (secundario de marca)
        forest: {
          50:  '#F1F8EE',
          100: '#DAEFCE',
          200: '#B4DFA0',
          300: '#86C66A',
          400: '#5CA93A',
          500: '#438A27',
          600: '#346E1E',
          700: '#2D4A1A',  // "Norte" verde exacto del logo
          800: '#1F3413',
          900: '#12200C',
        },
        // Verde lima — uvas del logo (acento fresco)
        lime: {
          50:  '#F8FBE8',
          100: '#EEF6CC',
          200: '#D9EC9A',
          300: '#BCDB5B',
          400: '#A2C830',
          500: '#8CB81A',  // color exacto de las uvas
          600: '#709514',
          700: '#567211',
          800: '#3F550D',
          900: '#2B3A09',
        },
        // Ámbar cálido (alertas, warnings)
        earth: {
          50:  '#fdf8f0',
          100: '#faeeda',
          200: '#f5d9a8',
          300: '#eec06e',
          400: '#e6a33a',
          500: '#d4891e',
          600: '#b86c14',
          700: '#954f13',
          800: '#7a3f16',
          900: '#653516',
          950: '#391a09',
        },
      },
      fontFamily: {
        display: ['Poppins', 'system-ui', 'sans-serif'],
        body:    ['"DM Sans"', 'system-ui', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'monospace'],
        poppins: ['Poppins', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in':    'fadeIn 0.5s ease-out',
        'slide-up':   'slideUp 0.4s ease-out',
        'slide-right':'slideRight 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shake':      'shake 0.4s ease-in-out',
      },
      keyframes: {
        fadeIn:     { '0%': { opacity: '0' },                                          '100%': { opacity: '1' } },
        slideUp:    { '0%': { opacity: '0', transform: 'translateY(16px)' },           '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideRight: { '0%': { opacity: '0', transform: 'translateX(-12px)' },          '100%': { opacity: '1', transform: 'translateX(0)' } },
        shake: {
          '0%':   { transform: 'translateX(0)' },
          '15%':  { transform: 'translateX(-6px)' },
          '30%':  { transform: 'translateX(6px)' },
          '45%':  { transform: 'translateX(-5px)' },
          '60%':  { transform: 'translateX(5px)' },
          '75%':  { transform: 'translateX(-3px)' },
          '90%':  { transform: 'translateX(2px)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
