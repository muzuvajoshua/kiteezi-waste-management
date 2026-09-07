import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		// Inter, exposed by app/layout.tsx. Without this, `font-sans` resolves
  		// to Tailwind's own stack and disagrees with the body font.
  		fontFamily: {
  			sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
  			// Headings. Heavy geometric sans, per the reference.
  			display: ['var(--font-display)', 'var(--font-sans)', 'sans-serif'],
  			// Section eyebrows only — never a whole sentence.
  			script: ['var(--font-script)', 'cursive'],
  		},
  		// A display scale, because the reference's headings are far larger and
  		// tighter than Tailwind's defaults allow without fighting them. Each
  		// pairs a size with the leading and tracking it needs: big type wants
  		// tight leading and negative tracking, and the two have to move
  		// together or the heading looks either loose or cramped.
  		fontSize: {
  			'display-sm': ['2rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
  			'display-md': ['2.75rem', { lineHeight: '1.05', letterSpacing: '-0.025em' }],
  			'display-lg': ['3.5rem', { lineHeight: '1.02', letterSpacing: '-0.03em' }],
  			'display-xl': ['4.5rem', { lineHeight: '0.98', letterSpacing: '-0.035em' }],
  		},
  		colors: {
  			// Measured from the reference walkthrough, not guessed. The whole
  			// scale is rebuilt around hue ~150 (emerald); the previous one sat
  			// at ~133 (yellow-green), which was most of why this site did not
  			// feel like the reference.
  			//
  			// 700 is the measured mid-green #017f42, 950 the measured dark
  			// surface #001c09, and 300 the measured bright lime #5eeda5.
  			brand: {
  				50: '#eefdf5',
  				100: '#d5f9e5',
  				200: '#a9f1c9',
  				300: '#5eeda5',
  				400: '#2ed484',
  				500: '#11b869',
  				600: '#039a56',
  				700: '#017f42',
  				800: '#016436',
  				900: '#02482a',
  				950: '#001c09',
  			},
  			// The accent, and the reason the palette reads as warm rather than
  			// clinical. 500 is the measured #ff8700. Used for one thing at a
  			// time — a primary action, an active nav item, an eyebrow — never
  			// as a fill for large areas.
  			accent: {
  				50: '#fff6e8',
  				100: '#ffe8c6',
  				200: '#ffd08a',
  				300: '#ffb04d',
  				400: '#ff9a1f',
  				500: '#ff8700',
  				600: '#e06c00',
  				700: '#b35200',
  				800: '#8a3f00',
  				900: '#6b3200',
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			// The warm ground. Cream rather than white, which is what stops the
  			// light sections reading as a blank browser page.
  			cream: {
  				50: '#fdfcf8',
  				100: '#f9f7f1',
  				200: '#f2eee3',
  				300: '#e8e3d4',
  				400: '#d9d2be',
  			},
  			// Dark surfaces: header, footer, hero scrim, feature bands. A
  			// near-black with a strong green cast, so a dark panel reads as
  			// part of the palette rather than a separate neutral.
  			ink: {
  				600: '#0a4526',
  				700: '#06331b',
  				800: '#032411',
  				900: '#001c09',
  				950: '#001206',
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)',
  			// Cards in the reference are rounded well past Tailwind's `2xl`.
  			card: '1.5rem',
  			panel: '2rem',
  		},
  		// The vertical rhythm between bands. Named so a section cannot be
  		// spaced by an arbitrary number that drifts from its neighbours.
  		spacing: {
  			band: '5.5rem',
  			'band-lg': '7.5rem',
  		},
  		// The hero's recycling loop. Declared here rather than in a <style>
  		// tag so the `motion-reduce:animate-none` variant can switch them off,
  		// which an inline keyframe cannot.
  		//
  		// `loop-turn` rotates the whole mark. The arrows are three-fold
  		// symmetric, so 120° is a complete cycle and it repeats seamlessly —
  		// the earlier version travelled a dash pattern along each arm, which
  		// is what made the arrows dotted.
  		//
  		// The `-open` and `-unfold` pair run once, when the ball is pressed:
  		// the paper opens toward the viewer and the loop releases it, and the
  		// sign-in card takes its place. `forwards` matters — without it both
  		// snap back to their starting frame just before the card appears.
  		keyframes: {
  			'loop-turn': {
  				to: { transform: 'rotate(120deg)' },
  			},
  			'paper-bob': {
  				'0%, 100%': { transform: 'translateY(0)' },
  				'50%': { transform: 'translateY(-9px)' },
  			},
  			'ball-unfold': {
  				'0%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
  				'100%': { transform: 'scale(7) rotate(-25deg)', opacity: '0' },
  			},
  			'loop-open': {
  				'0%': { transform: 'scale(1)', opacity: '1' },
  				'100%': { transform: 'scale(1.7)', opacity: '0' },
  			},
  			// Scroll reveal. Deliberately small — a 12px rise and a fade, not
  			// a slide across the viewport. The reference does this on section
  			// entry and it is the one place the effect earns its keep; used on
  			// every card it would read as the generic template it usually is.
  			reveal: {
  				'0%': { opacity: '0', transform: 'translateY(12px)' },
  				'100%': { opacity: '1', transform: 'translateY(0)' },
  			},
  			// The page-transition loader: an arc of dots that spins.
  			'dot-spin': {
  				to: { transform: 'rotate(360deg)' },
  			},
  			// The sign-in card arriving where the paper was.
  			'card-open': {
  				'0%': { transform: 'scale(0.94)', opacity: '0' },
  				'100%': { transform: 'scale(1)', opacity: '1' },
  			},
  		},
  		animation: {
  			'loop-turn': 'loop-turn 14s linear infinite',
  			'paper-bob': 'paper-bob 9s ease-in-out infinite',
  			'ball-unfold': 'ball-unfold 520ms cubic-bezier(0.4, 0, 0.9, 0.3) forwards',
  			'loop-open': 'loop-open 520ms ease-out forwards',
  			'card-open': 'card-open 260ms ease-out',
  			reveal: 'reveal 620ms cubic-bezier(0.16, 1, 0.3, 1) both',
  			'dot-spin': 'dot-spin 1.1s linear infinite',
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
