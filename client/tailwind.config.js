/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tg: {
          bg: {
            primary: '#212121',
            secondary: '#0f0f0f',
            elevated: '#2b2b2b',
            input: '#2b2b2b',
          },
          accent: '#2AABEE',
          bubble: {
            out: '#2b5278',
            in: '#212121',
          },
          text: {
            primary: '#ffffff',
            secondary: '#aaaaaa',
            hint: '#686c72',
          }
        }
      }
    },
  },
  plugins: [],
}