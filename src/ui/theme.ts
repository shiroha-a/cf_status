/**
 * Theme registry for the status page.
 *
 * A theme is a set of CSS custom properties (design tokens) emitted into a
 * `:root` block. The status page CSS references these via `var(--…)`, so
 * swapping a theme re-skins the whole page without touching markup.
 *
 * Tokens are lifted from the hc design system (colors_and_type.css). The active
 * theme is chosen by the `THEME` env var (site-wide) or `?theme=` query
 * (per-request preview); unknown names fall back to `default`.
 *
 * To add your own theme: add an entry to `themes` below, spreading
 * `defaultTokens` and overriding only what you want.
 */

interface Theme {
  /** Value for the CSS `color-scheme` property (e.g. 'light dark', 'dark'). */
  colorScheme: string;
  /** CSS custom property name (without `--`) -> value. */
  tokens: Record<string, string>;
}

/** Default tokens — the canonical hc look (traffic-light over neutral). */
const defaultTokens: Record<string, string> = {
  // status colors
  'status-up': '#43a047',
  'status-down': '#e53935',
  'status-warn': '#fb8c00',
  'status-unknown': '#9e9e9e',
  // summary banner (tinted)
  'summary-ok-bg': '#e6f4ea',
  'summary-ok-fg': '#1e4620',
  'summary-bad-bg': '#fce8e6',
  'summary-bad-fg': '#5f1411',
  // neutrals (translucent grey)
  border: '#8883',
  'fg-muted': '#8889',
  'bar-empty': '#8883',
  // tooltip
  'tip-bg': '#1e1e1eee',
  'tip-fg': '#ffffff',
  'tip-key': '#aaaaaa',
  'tip-shadow': '0 2px 8px #0006',
  'badge-fg': '#ffffff',
  // typography
  'font-sans': 'system-ui, sans-serif',
  'fs-h1': '1.5rem',
  'fs-base': '1rem',
  'fs-card': '0.9rem',
  'fs-meta': '0.85rem',
  'fs-badge': '0.8rem',
  'fs-tip': '0.75rem',
  'fs-foot': '0.8rem',
  'fw-normal': '400',
  'fw-bold': '600',
  'lh-base': '1.5',
  'lh-tip': '1.4',
  // shape & spacing
  'radius-card': '8px',
  'radius-pill': '999px',
  'radius-bar': '2px',
  'radius-tip': '6px',
  'gap-bars': '2px',
  'bar-height': '26px',
  'bar-min-w': '2px',
  'pad-card': '0.75rem 1rem',
  'pad-badge': '0.15rem 0.6rem',
  'pad-cell': '0.35rem 0.5rem',
  'page-max': '820px',
};

export const themes: Record<string, Theme> = {
  default: { colorScheme: 'light dark', tokens: defaultTokens },

  // ----- Sample theme. Edit or delete freely; add your own the same way. -----
  // 境界とメタ文字を濃くして可読性を上げた高コントラスト例
  'high-contrast': {
    colorScheme: 'light dark',
    tokens: {
      ...defaultTokens,
      border: '#666',
      'fg-muted': '#555',
      'summary-ok-bg': '#1b5e20',
      'summary-ok-fg': '#ffffff',
      'summary-bad-bg': '#b71c1c',
      'summary-bad-fg': '#ffffff',
    },
  },
};

/** Render the chosen theme as a `:root { … }` CSS block. Falls back to default. */
export function themeToCss(name: string): string {
  const theme = themes[name] ?? themes.default;
  // themes.default は必ず存在するため non-null
  const t = theme as Theme;
  const lines = Object.entries(t.tokens).map(([k, v]) => `  --${k}: ${v};`);
  return `:root {\n  color-scheme: ${t.colorScheme};\n${lines.join('\n')}\n}`;
}
