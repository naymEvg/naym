/********************* Tailwind Config *********************/
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#dcebff',
          200: '#bad7ff',
          300: '#8bbaff',
          400: '#5f9cff',
          500: '#3b82f6',
          600: '#2f6adf',
          700: '#2556b8',
          800: '#1f4793',
          900: '#1c3c78'
        }
      }
    },
  },
  plugins: [],
}