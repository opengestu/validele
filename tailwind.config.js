module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,vue}',
    './public/index.html'
  ],
  theme: {
    extend: {
      colors: {
        primary: 'hsl(var(--primary) / <alpha-value>)',
        'primary-foreground': 'hsl(var(--primary-foreground) / <alpha-value>)',
        card: 'hsl(var(--card) / <alpha-value>)',
        'card-foreground': 'hsl(var(--card-foreground) / <alpha-value>)',
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        accent: 'hsl(var(--accent) / <alpha-value>)',
        success: 'hsl(var(--success) / <alpha-value>)',
        'success-foreground': 'hsl(var(--success-foreground) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        'muted-foreground': 'hsl(var(--muted-foreground) / <alpha-value>)',
        danger: 'hsl(var(--danger) / <alpha-value>)',
        info: 'hsl(var(--info) / <alpha-value>)',
        muted: 'hsl(var(--muted) / <alpha-value>)',
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
        'validel-vendor': 'hsl(var(--validel-vendor) / <alpha-value>)',
        'validel-vendor-foreground': 'hsl(var(--validel-vendor-foreground) / <alpha-value>)',
        'validel-buyer': 'hsl(var(--validel-buyer) / <alpha-value>)',
        'validel-buyer-foreground': 'hsl(var(--validel-buyer-foreground) / <alpha-value>)',
        'validel-delivery': 'hsl(var(--validel-delivery) / <alpha-value>)',
        'validel-delivery-foreground': 'hsl(var(--validel-delivery-foreground) / <alpha-value>)'
      },
      borderRadius: {
        'lg-custom': 'var(--radius)'
      }
    }
  },
  plugins: []
};
