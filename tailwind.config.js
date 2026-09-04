/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta Oficial Global Futsal Stats
        navy: {
          DEFAULT: '#0B1F3B', // Azul Marino Profundo (Fondo principal)
          light: '#16294a',   // Un poco más claro para filas alternas o hovers
          dark: '#050f1e'     // Más oscuro para bordes
        },
        silver: {
          DEFAULT: '#C9CED6', // Plateado Metálico (Textos)
          dim: '#9ca3af',     // Plateado apagado (Textos secundarios)
        },
        orange: {
          DEFAULT: '#F28C28', // Naranja Energía (Botones principales)
          hover: '#d97b1f',
          neon: '#FF9F43'     // Naranja Neón brillante
        },
        red: {
          DEFAULT: '#E04B3F', // Rojo Análisis (Alertas)
        },
        purple: {
          DEFAULT: '#6A3FA0', // Púrpura Datos (Gráficos/Filtros)
          light: '#8E44AD'
        },
        accent: {
          blue: '#00D2FF',    // Azul Eléctrico
          green: '#00F2FE'    // Verde Azulado brillante
        },
        // Estados
        success: '#2ECC71',
        warning: '#F1C40F',
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