/**
 * Theme registry for the status page.
 *
 * A theme bundles three things:
 *  - `layout`: which page structure to render ('classic' = the minimal original,
 *    'rich' = the redesigned dashboard with hero, tiles, glow).
 *  - `colorScheme`: value for the CSS `color-scheme` property.
 *  - `tokens`: CSS custom properties emitted into a `:root` block. The layout's
 *    CSS references these via `var(--…)`, so a theme re-skins (and re-structures)
 *    the page without per-call code changes.
 *
 * The active theme is chosen by the `THEME` env var (site-wide) or `?theme=`
 * query (per-request preview); unknown names fall back to `default`.
 *
 * To add your own theme: add an entry to `themes`, pick a `layout`, and spread
 * the matching token base (`classicTokens` or `richTokens`), overriding what you
 * want. A theme's tokens must match the variables its layout's CSS uses.
 */

export type Layout = 'classic' | 'rich';

export interface Theme {
  layout: Layout;
  /** Value for the CSS `color-scheme` property (e.g. 'light dark', 'dark'). */
  colorScheme: string;
  /** CSS custom property name (without `--`) -> value. */
  tokens: Record<string, string>;
}

/** Tokens for the classic layout — the canonical hc look (traffic-light over neutral). */
const classicTokens: Record<string, string> = {
  'status-up': '#43a047',
  'status-down': '#e53935',
  'status-warn': '#fb8c00',
  'status-unknown': '#9e9e9e',
  'summary-ok-bg': '#e6f4ea',
  'summary-ok-fg': '#1e4620',
  'summary-bad-bg': '#fce8e6',
  'summary-bad-fg': '#5f1411',
  border: '#8883',
  'fg-muted': '#8889',
  'bar-empty': '#8883',
  'tip-bg': '#1e1e1eee',
  'tip-fg': '#ffffff',
  'tip-key': '#aaaaaa',
  'tip-shadow': '0 2px 8px #0006',
  'badge-fg': '#ffffff',
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

/** Tokens for the rich layout — the redesigned dark dashboard (system fonts). */
const richTokens: Record<string, string> = {
  'bg-0': '#0a0c10',
  'bg-1': '#0e1117',
  grid: 'rgba(255,255,255,0.025)',
  panel: 'rgba(255,255,255,0.025)',
  'panel-solid': '#13161d',
  border: 'rgba(255,255,255,0.08)',
  'border-2': 'rgba(255,255,255,0.14)',
  text: '#e9edf3',
  dim: '#9aa4b3',
  faint: '#646d7d',
  up: '#34d399',
  down: '#fb5664',
  warn: '#fbbf24',
  unknown: '#5b6472',
  'up-soft': 'rgba(52,211,153,0.14)',
  'down-soft': 'rgba(251,86,100,0.14)',
  'bar-empty': 'rgba(255,255,255,0.07)',
  'tip-bg': '#171b22',
  shadow: '0 10px 30px -8px rgba(0,0,0,0.6)',
  'tile-bg': 'rgba(255,255,255,0.02)',
  accent: '#38bdf8',
  // system-uiで代用(外部Webフォントは読み込まない)
  'font-head': 'system-ui, sans-serif',
  'font-mono': 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

export const themes: Record<string, Theme> = {
  default: { layout: 'classic', colorScheme: 'light dark', tokens: classicTokens },

  // 配色・境界・メタ文字を濃くした高コントラスト例(classic)
  'high-contrast': {
    layout: 'classic',
    colorScheme: 'light dark',
    tokens: {
      ...classicTokens,
      border: '#666',
      'fg-muted': '#555',
      'summary-ok-bg': '#1b5e20',
      'summary-ok-fg': '#ffffff',
      'summary-bad-bg': '#b71c1c',
      'summary-bad-fg': '#ffffff',
    },
  },

  // リデザイン(ダークなダッシュボード, rich レイアウト)
  midnight: { layout: 'rich', colorScheme: 'dark', tokens: richTokens },
};

/** Resolve a theme by name, falling back to `default` for unknown names. */
export function resolveTheme(name: string): Theme {
  return themes[name] ?? (themes.default as Theme);
}

/** Render a theme's tokens as a `:root { … }` CSS block. */
export function themeToCss(theme: Theme): string {
  const lines = Object.entries(theme.tokens).map(([k, v]) => `  --${k}: ${v};`);
  return `:root {\n  color-scheme: ${theme.colorScheme};\n${lines.join('\n')}\n}`;
}
