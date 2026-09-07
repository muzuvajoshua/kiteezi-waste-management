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
  		},
  		colors: {
  			// The brand scale. Every green in this codebase was a hardcoded
  			// `green-600` literal, so there was no single place to adjust the
  			// palette and no way to tell a brand green from an incidental one
  			// — a success badge and a primary button both said `green-600`
  			// while meaning different things.
  			//
  			// Deliberately NOT wired into the shadcn `--primary` variable:
  			// that is consumed by button/badge/dropdown defaults, and
  			// repointing it would restyle every existing control at once.
  			// This scale is additive, so components adopt it as they are
  			// touched.
  			brand: {
  				50: '#f0f9f1',
  				100: '#dcf0de',
  				200: '#bbe1c1',
  				300: '#8ecb99',
  				400: '#5aad6b',
  				500: '#358f49',
  				600: '#237338',
  				700: '#1c5c2e',
  				800: '#194a27',
  				900: '#153d21',
  				950: '#0a2212',
  			},
  			// Headings and high-contrast surfaces. A near-black with a green
  			// cast rather than pure grey, so dark panels read as part of the
  			// same palette instead of a separate neutral.
  			ink: {
  				700: '#22322a',
  				800: '#18241e',
  				900: '#101a15',
  				950: '#0a110e',
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
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
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
  			sm: 'calc(var(--radius) - 4px)'
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
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
