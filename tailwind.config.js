/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta Oficial Global Futsal Stats
        // navy/silver usan variables CSS: cambian de valor en tema claro (html.light)
        // manteniendo la opacidad de cada uso (bg-navy/40, text-silver/70, ...).
        navy: {
          DEFAULT: 'rgb(var(--c-navy) / <alpha-value>)',
          light: 'rgb(var(--c-navy-light) / <alpha-value>)',
          dark: 'rgb(var(--c-navy-dark) / <alpha-value>)'
        },
        silver: {
          DEFAULT: 'rgb(var(--c-silver) / <alpha-value>)',
          dim: 'rgb(var(--c-silver-dim) / <alpha-value>)',
        },
        orange: {
          DEFAULT: 'rgb(var(--c-orange) / <alpha-value>)',  // Naranja Energía (claro: ámbar oscuro legible)
          hover: 'rgb(var(--c-orange-hover) / <alpha-value>)',
          neon: 'rgb(var(--c-orange-neon) / <alpha-value>)'  // Naranja Neón brillante
        },
        red: {
          DEFAULT: 'rgb(var(--c-red) / <alpha-value>)', // Rojo Análisis (Alertas)
        },
        purple: {
          DEFAULT: '#6A3FA0', // Púrpura Datos (Gráficos/Filtros)
          light: '#8E44AD'
        },
        accent: {
          blue: 'rgb(var(--c-accent-blue) / <alpha-value>)',   // Azul Eléctrico (claro: azul accesible)
          green: 'rgb(var(--c-accent-green) / <alpha-value>)'  // Verde Azulado brillante
        },
        // Estados (variables: legibles en ambos temas)
        success: 'rgb(var(--c-success) / <alpha-value>)',
        warning: 'rgb(var(--c-warning) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"Inter"', '"Segoe UI"', 'sans-serif'],
        display: ['"Outfit"', 'sans-serif'],
      },
      boxShadow: {
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        'glass-hover': '0 8px 32px 0 rgba(242, 140, 40, 0.15)',
        'neon-orange': '0 0 15px rgba(242, 140, 40, 0.4)',
        'neon-blue': '0 0 15px rgba(0, 210, 255, 0.4)',
      }
    },
  },
  plugins: [],
}