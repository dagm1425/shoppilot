import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      borderRadius: {
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
        auth: 'var(--auth-panel-radius)',
        pill: 'var(--auth-pill-radius)',
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',
        border: 'hsl(var(--border))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        primary: 'hsl(var(--primary))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        danger: 'hsl(var(--danger))',
        auth: {
          bg: 'hsl(var(--auth-bg))',
          panel: 'hsl(var(--auth-panel))',
          ink: 'hsl(var(--auth-ink))',
          muted: 'hsl(var(--auth-muted))',
          line: 'hsl(var(--auth-line))',
          focus: 'hsl(var(--auth-focus))',
          button: 'hsl(var(--auth-button))',
          'button-foreground': 'hsl(var(--auth-button-foreground))',
        },
      },
      fontFamily: {
        'auth-heading': ['var(--font-montserrat)', 'system-ui', 'sans-serif'],
        'auth-body': ['var(--font-roboto)', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        auth: 'var(--auth-card-max-width)',
      },
      height: {
        'auth-input': 'var(--auth-input-height)',
      },
      boxShadow: {
        auth: 'var(--auth-shadow)',
      },
      backgroundImage: {
        'auth-radial': 'radial-gradient(circle at top right, hsl(var(--auth-panel)) 0%, hsl(var(--auth-bg)) 55%)',
      },
      spacing: {
        4.5: 'var(--space-4-5)',
      },
      borderWidth: {
        auth: '1px',
      },
    },
  },
  plugins: [],
};

export default config;
