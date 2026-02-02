import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
  	extend: {
  		colors: {
  			viber: {
  				purple: '#7360F2',
  				'purple-dark': '#665DC1',
  				'purple-light': '#9B8FFF',
  				'purple-bg': '#F5F3FF',
  				online: '#10B981'
  			},
  			status: {
  				online: '#10B981',
  				away: '#F59E0B',
  				offline: '#6B7280',
  				error: '#EF4444',
  				success: '#10B981'
  			},
  			message: {
  				sent: '#9CA3AF',
  				delivered: '#9CA3AF',
  				read: '#7360F2'
  			},
  			gray: {
  				'50': '#F9FAFB',
  				'100': '#F3F4F6',
  				'200': '#E5E7EB',
  				'400': '#9CA3AF',
  				'600': '#4B5563',
  				'900': '#111827'
  			},
  			dark: {
  				bg: '#0F0F0F',
  				surface: '#1C1C1E',
  				border: '#38383A',
  				text: '#FFFFFF',
  				'text-secondary': '#98989D',
  				'sent-bubble': '#7360F2',
  				'received-bubble': '#2C2C2E'
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
  		fontSize: {
  			xs: '11px',
  			sm: '13px',
  			base: '15px',
  			lg: '17px',
  			xl: '20px'
  		},
  		spacing: {
  			xs: '4px',
  			sm: '8px',
  			md: '12px',
  			lg: '16px',
  			xl: '24px',
  			'2xl': '32px'
  		},
  		borderRadius: {
  			sm: 'calc(var(--radius) - 4px)',
  			md: 'calc(var(--radius) - 2px)',
  			lg: 'var(--radius)',
  			full: '9999px'
  		},
  		boxShadow: {
  			sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
  			md: '0 4px 6px rgba(0, 0, 0, 0.1)',
  			lg: '0 10px 15px rgba(0, 0, 0, 0.1)'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
