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
          hover: '#d97b1f'
        },
        red: {
          DEFAULT: '#E04B3F', // Rojo Análisis (Alertas)
        },
        purple: {
          DEFAULT: '#6A3FA0', // Púrpura Datos (Gráficos/Filtros)
        },
        // Estados
        success: '#2ECC71',
        warning: '#F1C40F',
      },
      fontFamily: {
        // Segoe UI Variable (Nativa Windows 11) como pide el manual
        sans: ['"Segoe UI Variable"', '"Segoe UI"', 'Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}