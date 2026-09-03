/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm neutral foundation — deliberately warmer than the generic
        // AI "cream" (#F4F1EA) to give the brand its own skin tone.
        ivory: '#F7F3EC',
        cream: '#FBF8F3',
        sand: '#ECE3D5',
        linen: '#F1E9DD',
        nude: '#E4D3C3',
        taupe: '#B9A88F',
        mocha: '#8B7358',
        espresso: '#4C3E32',
        ink: '#211B15',
        noir: '#17120E',
        // Dusty rose accent — used with great restraint.
        rose: '#C79A90',
        'rose-soft': '#E9D6CF',
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'Cormorant', 'Georgia', 'Times', 'serif'],
        sans: ['Jost', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      letterSpacing: {
        label: '0.24em',
        wide2: '0.3em',
        tightish: '-0.01em',
      },
      fontSize: {
        '10xl': ['9rem', { lineHeight: '0.92' }],
        '11xl': ['12rem', { lineHeight: '0.9' }],
      },
      maxWidth: {
        container: '1600px',
        prose2: '68ch',
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
        section: '7.5rem',
      },
      boxShadow: {
        soft: '0 18px 60px -28px rgba(33,27,21,0.28)',
        lift: '0 30px 80px -32px rgba(33,27,21,0.32)',
        'inner-hair': 'inset 0 -1px 0 0 rgba(33,27,21,0.08)',
      },
      transitionTimingFunction: {
        soft: 'cubic-bezier(0.22, 1, 0.36, 1)',
        editorial: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        400: '400ms',
        600: '600ms',
        800: '800ms',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        sheen: {
          '0%': { transform: 'translateX(-120%) skewX(-12deg)' },
          '100%': { transform: 'translateX(220%) skewX(-12deg)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        marquee: 'marquee 42s linear infinite',
        sheen: 'sheen 6.5s ease-in-out infinite',
        'fade-in': 'fade-in 0.8s ease forwards',
      },
    },
  },
  plugins: [],
};
