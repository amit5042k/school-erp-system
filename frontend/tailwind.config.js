/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          500: '#1a5aa8',
          600: '#134a8e',
          700: '#0f3c75',
          800: '#0c305d',
        },
        accent: { 500: '#f4a100', 600: '#d88a00' },
      },
      fontFamily: {
        sans: ['Segoe UI', 'Arial', 'Helvetica', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
