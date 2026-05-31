import { html, raw } from 'hono/html';
import type { HtmlEscapedString } from 'hono/utils/html';
import { barClass, fmtDuration, fmtTime, type StatusData } from '../shared';

/** Rich layout CSS. Tokens (var(--…)) come from the theme's :root block. */
const RICH_STYLE = `
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { background: var(--bg-0); }
  .root {
    min-height: 100vh; position: relative;
    font-family: var(--font-head); color: var(--text);
    background:
      radial-gradient(1100px 600px at 80% -10%, color-mix(in srgb, var(--accent) 9%, transparent), transparent 60%),
      linear-gradient(180deg, var(--bg-1), var(--bg-0) 40%);
    -webkit-font-smoothing: antialiased;
    --pad: 22px; --gap: 14px; --maxw: 880px;
  }
  .bg-grid {
    position: fixed; inset: 0; pointer-events: none; z-index: 0;
    background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px);
    background-size: 48px 48px; mask-image: linear-gradient(180deg, #000, transparent 70%);
  }
  .num { font-family: var(--font-mono); font-feature-settings: "tnum" 1; }

  .hd {
    position: sticky; top: 0; z-index: 20;
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px clamp(16px, 4vw, 40px);
    backdrop-filter: blur(12px);
    background: color-mix(in srgb, var(--bg-0) 72%, transparent);
    border-bottom: 1px solid var(--border);
  }
  .hd-brand { display: flex; align-items: center; gap: 10px; }
  .hd-logo { font-family: var(--font-mono); font-weight: 700; font-size: 15px; letter-spacing: 0.02em;
             color: var(--bg-0); background: var(--accent); padding: 3px 8px; border-radius: 7px; }
  .hd-sep { color: var(--faint); }
  .hd-title { font-weight: 600; font-size: 15px; letter-spacing: -0.01em; }
  .hd-live { display: flex; align-items: center; gap: 8px; }
  .hd-live-txt { font-family: var(--font-mono); font-size: 12px; color: var(--dim); }
  .live-dot { width: 8px; height: 8px; border-radius: 50%; position: relative; }
  .live-dot.ok { background: var(--up); }
  .live-dot.bad { background: var(--down); }
  .live-dot::after { content: ''; position: absolute; inset: -4px; border-radius: 50%;
                     background: inherit; opacity: 0.5; animation: ping 1.8s ease-out infinite; }
  @keyframes ping { 0% { transform: scale(0.6); opacity: 0.6; } 80%, 100% { transform: scale(2.2); opacity: 0; } }

  .wrap { position: relative; z-index: 1; max-width: var(--maxw); margin: 0 auto; padding: clamp(20px, 4vw, 40px) clamp(16px, 4vw, 40px) 40px; }

  .hero { margin-bottom: 30px; }
  .hero-card { border: 1px solid var(--border); border-radius: 18px; padding: 26px var(--pad);
               background: linear-gradient(180deg, var(--up-soft), transparent), var(--panel);
               position: relative; overflow: hidden; }
  .hero-card.bad { background: linear-gradient(180deg, var(--down-soft), transparent), var(--panel); }
  .hero-status { display: flex; align-items: center; gap: 18px; }
  .hero-pulse { position: relative; width: 16px; height: 16px; flex: none; }
  .hero-pulse-core { position: absolute; inset: 0; border-radius: 50%; background: var(--up); box-shadow: 0 0 16px var(--up); }
  .hero-card.bad .hero-pulse-core { background: var(--down); box-shadow: 0 0 16px var(--down); }
  .hero-pulse::after { content: ''; position: absolute; inset: 0; border-radius: 50%; background: var(--up); opacity: 0.45; animation: ping 2s ease-out infinite; }
  .hero-card.bad .hero-pulse::after { background: var(--down); }
  .hero-verdict { font-size: clamp(26px, 4.4vw, 38px); font-weight: 600; letter-spacing: -0.025em; line-height: 1.05; }
  .hero-sub { margin-top: 7px; font-family: var(--font-mono); font-size: 12.5px; color: var(--dim); }

  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--gap); margin-top: var(--gap); }
  @media (max-width: 640px) { .tiles { grid-template-columns: repeat(2, 1fr); } .bars { gap: 1px; } }
  .tile { border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; background: var(--tile-bg); }
  .tile-label { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--faint); }
  .tile-value { margin-top: 9px; font-size: 27px; font-weight: 600; letter-spacing: -0.02em; display: flex; align-items: baseline; gap: 3px; }
  .tile-value.ok { color: var(--up); } .tile-value.bad { color: var(--down); }
  .tile-suffix { font-family: var(--font-mono); font-size: 14px; color: var(--faint); font-weight: 500; }

  .sec { margin-bottom: 34px; }
  .sec-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 14px; }
  .sec-title { font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: var(--dim); margin: 0; }
  .sec-count { font-family: var(--font-mono); font-size: 12px; color: var(--faint); }
  .mlist { display: flex; flex-direction: column; gap: var(--gap); }

  .mcard { border: 1px solid var(--border); border-radius: 16px; padding: var(--pad);
           background: var(--panel); box-shadow: var(--shadow); transition: border-color .2s; }
  .mcard:hover { border-color: var(--border-2); }
  .mcard-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .mcard-id { display: flex; align-items: center; gap: 13px; min-width: 0; }
  .sdot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
  .sdot.up { background: var(--up); box-shadow: 0 0 10px var(--up); }
  .sdot.down { background: var(--down); box-shadow: 0 0 10px var(--down); }
  .sdot.unknown { background: var(--unknown); }
  .mcard-name { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; }
  .mcard-url { font-family: var(--font-mono); font-size: 12px; color: var(--dim); margin-top: 2px; word-break: break-all; }
  .mcard-right { display: flex; align-items: center; gap: 16px; flex: none; }
  .mcard-uptime { text-align: right; }
  .mcard-uptime .num { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; }
  .mcard-uptime .pct { font-family: var(--font-mono); font-size: 13px; color: var(--faint); margin-left: 1px; }
  .mcard-uptime-lbl { font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--faint); margin-top: 1px; }
  .pill { font-family: var(--font-mono); font-size: 11px; font-weight: 600; letter-spacing: 0.06em; padding: 5px 11px; border-radius: 999px; white-space: nowrap; border: 1px solid transparent; }
  .pill.up { color: var(--up); background: var(--up-soft); border-color: color-mix(in srgb, var(--up) 30%, transparent); }
  .pill.down { color: var(--down); background: var(--down-soft); border-color: color-mix(in srgb, var(--down) 30%, transparent); }
  .pill.unknown { color: var(--dim); background: color-mix(in srgb, var(--unknown) 16%, transparent); border-color: var(--border-2); }

  .bars { display: flex; gap: 3px; height: 38px; margin: 18px 0 16px; align-items: flex-end; }
  /* min-width:0 で90セルが必ず親幅に収まる(モバイルでのはみ出し防止) */
  .bar-wrap { flex: 1 1 0; min-width: 0; position: relative; display: flex; align-items: flex-end; height: 100%; }
  .bar { flex: 1; height: 100%; border-radius: 3px; background: var(--bar-empty); transition: filter .15s; }
  .bar.ok { background: linear-gradient(180deg, color-mix(in srgb, var(--up) 80%, #fff), var(--up)); }
  .bar.warn { background: linear-gradient(180deg, color-mix(in srgb, var(--warn) 80%, #fff), var(--warn)); }
  .bar.bad { background: linear-gradient(180deg, color-mix(in srgb, var(--down) 82%, #fff), var(--down)); }
  .bar-wrap:hover .bar { filter: brightness(1.25); }
  .tip { position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%);
         background: var(--tip-bg); border: 1px solid var(--border-2); color: var(--text);
         padding: 9px 11px; border-radius: 10px; min-width: 140px;
         box-shadow: var(--shadow); opacity: 0; visibility: hidden; transition: opacity .14s; z-index: 10; pointer-events: none; }
  .bar-wrap:hover .tip { opacity: 1; visibility: visible; }
  .tip::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%); border: 6px solid transparent; border-top-color: var(--tip-bg); }
  .tip-day { display: block; font-family: var(--font-mono); font-size: 11px; color: var(--faint); margin-bottom: 6px; }
  .tip-row { display: flex; justify-content: space-between; gap: 18px; font-size: 12px; line-height: 1.7; }
  .tip-row .k { color: var(--dim); } .tip-row .v { font-family: var(--font-mono); }

  .mcard-foot { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .chip { font-family: var(--font-mono); font-size: 11.5px; color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 4px 9px; background: var(--tile-bg); }
  .chip-k { color: var(--faint); margin-right: 4px; }
  .chip.ghost { margin-left: auto; border-style: dashed; color: var(--dim); }

  .empty { border: 1px dashed var(--border-2); border-radius: 14px; padding: 24px; text-align: center; color: var(--dim); font-family: var(--font-mono); font-size: 13px; }
  .timeline { display: flex; flex-direction: column; }
  .tl-item { display: flex; gap: 16px; padding-left: 4px; position: relative; }
  .tl-item:not(:last-child) .tl-body { border-left: 1px solid var(--border); margin-left: -1px; }
  .tl-dot { width: 11px; height: 11px; border-radius: 50%; flex: none; margin-top: 4px; background: var(--unknown); border: 2px solid var(--bg-0); outline: 1px solid var(--border-2); position: relative; z-index: 1; }
  .tl-item.resolved .tl-dot { background: var(--up); }
  .tl-item.ongoing .tl-dot { background: var(--down); box-shadow: 0 0 10px var(--down); }
  .tl-body { padding: 0 0 22px 20px; margin-left: 5px; flex: 1; }
  .tl-head { display: flex; align-items: center; gap: 10px; }
  .tl-name { font-weight: 600; font-size: 15px; }
  .tl-badge { font-family: var(--font-mono); font-size: 11px; padding: 3px 9px; border-radius: 999px; background: var(--tile-bg); border: 1px solid var(--border); color: var(--dim); }
  .tl-badge.live { color: var(--down); background: var(--down-soft); border-color: color-mix(in srgb, var(--down) 30%, transparent); }
  .tl-meta { margin-top: 5px; display: flex; flex-wrap: wrap; gap: 6px 14px; font-family: var(--font-mono); font-size: 12px; }
  .tl-cause { color: var(--text); } .tl-time { color: var(--faint); }

  .ft { font-family: var(--font-mono); font-size: 11.5px; color: var(--faint); text-align: center; padding: 20px 0 8px; border-top: 1px solid var(--border); margin-top: 8px; }

  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
`;

/** HH:mm:ss in the given time zone (for the header live indicator). */
function fmtClock(unix: number, tz: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(unix * 1000));
}

/** Render the rich redesigned dashboard. `themeCss` is a `:root{…}` block. */
export function renderRich(
  data: StatusData,
  tz: string,
  themeCss: string,
): HtmlEscapedString | Promise<HtmlEscapedString> {
  const total = data.monitors.length;
  const up = data.monitors.filter((m) => m.status === 'up').length;
  const known90 = data.monitors.filter((m) => m.uptime90d != null);
  const uptime90d =
    known90.length > 0
      ? (known90.reduce((a, m) => a + (m.uptime90d ?? 0), 0) / known90.length).toFixed(2)
      : '-';
  const knownRt = data.monitors.filter((m) => m.avgRtMs != null);
  const avgRt =
    knownRt.length > 0
      ? Math.round(knownRt.reduce((a, m) => a + (m.avgRtMs ?? 0), 0) / knownRt.length)
      : 0;
  const open = data.incidents.filter((i) => i.resolvedAt == null).length;

  const verdict =
    total === 0
      ? 'No monitors configured'
      : data.allOperational
        ? 'All Systems Operational'
        : 'Some Systems Are Down';
  const heroBad = total > 0 && !data.allOperational;

  const tile = (label: string, value: string, suffix: string, tone: string) => html`
    <div class="tile">
      <div class="tile-label">${label}</div>
      <div class="tile-value ${tone}">
        <span class="num">${value}</span>${suffix ? html`<span class="tile-suffix">${suffix}</span>` : ''}
      </div>
    </div>`;

  const cards = data.monitors.map(
    (m) => html`
      <article class="mcard">
        <div class="mcard-top">
          <div class="mcard-id">
            <span class="sdot ${m.status}"></span>
            <div>
              <div class="mcard-name">${m.name}</div>
              <div class="mcard-url">${m.url}</div>
            </div>
          </div>
          <div class="mcard-right">
            <div class="mcard-uptime">
              <span class="num">${m.uptime90d == null ? '-' : m.uptime90d.toFixed(2)}</span><span class="pct">%</span>
              <div class="mcard-uptime-lbl">90-day</div>
            </div>
            <span class="pill ${m.status}">${m.status.toUpperCase()}</span>
          </div>
        </div>
        <div class="bars">
          ${m.bars.map(
            (b) => html`<div class="bar-wrap">
              <span class="bar ${barClass(b.uptime)}"></span>
              <span class="tip">
                <span class="tip-day">${b.day}</span>
                ${
                  b.uptime == null
                    ? raw('<span class="tip-row"><span class="k">No data</span></span>')
                    : html`<span class="tip-row"><span class="k">Uptime</span><span class="v">${b.uptime.toFixed(2)}%</span></span>
                        <span class="tip-row"><span class="k">Checks</span><span class="v">${b.okCount}/${b.total}</span></span>
                        <span class="tip-row"><span class="k">Avg RT</span><span class="v">${b.avgRt == null ? '-' : `${b.avgRt}ms`}</span></span>`
                }
              </span>
            </div>`,
          )}
        </div>
        <div class="mcard-foot">
          <span class="chip"><span class="chip-k">avg</span> ${m.avgRtMs == null ? '-' : `${m.avgRtMs}ms`}</span>
          <span class="chip"><span class="chip-k">region</span> ${m.lastColo ?? '-'}</span>
          ${
            m.colos24h.length > 1
              ? html`<span class="chip"><span class="chip-k">24h colos</span> ${m.colos24h.join(', ')}</span>`
              : ''
          }
          <span class="chip ghost">${m.uptime24h == null ? 'no data yet' : `${m.uptime24h.toFixed(2)}% · 24h`}</span>
        </div>
      </article>`,
  );

  const incidents =
    data.incidents.length === 0
      ? html`<div class="empty">No incidents recorded. Smooth sailing.</div>`
      : html`<div class="timeline">
          ${data.incidents.map((i) => {
            const ongoing = i.resolvedAt == null;
            const tail =
              i.resolvedAt == null
                ? ''
                : raw(
                    ` &rarr; ${fmtClock(i.resolvedAt, tz)} · ${fmtDuration(i.resolvedAt - i.startedAt)}`,
                  );
            return html`
              <div class="tl-item ${ongoing ? 'ongoing' : 'resolved'}">
                <span class="tl-dot"></span>
                <div class="tl-body">
                  <div class="tl-head">
                    <span class="tl-name">${i.name}</span>
                    ${ongoing ? html`<span class="tl-badge live">ongoing</span>` : html`<span class="tl-badge">resolved</span>`}
                  </div>
                  <div class="tl-meta">
                    <span class="tl-cause">${i.cause ?? '-'}</span>
                    <span class="tl-time">${fmtTime(i.startedAt, tz)}${tail}</span>
                  </div>
                </div>
              </div>`;
          })}
        </div>`;

  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta http-equiv="refresh" content="60" />
        <title>hc — Service Status</title>
        <style>
          ${raw(themeCss)}
          ${raw(RICH_STYLE)}
        </style>
      </head>
      <body>
        <div class="root" data-theme="dark" data-glow="on">
          <div class="bg-grid"></div>
          <header class="hd">
            <div class="hd-brand">
              <span class="hd-logo">hc</span>
              <span class="hd-sep">/</span>
              <span class="hd-title">Service Status</span>
            </div>
            <div class="hd-live">
              <span class="live-dot ${data.allOperational ? 'ok' : 'bad'}"></span>
              <span class="hd-live-txt">Live · updated ${fmtClock(data.generatedAt, tz)}</span>
            </div>
          </header>
          <main class="wrap">
            <section class="hero">
              <div class="hero-card ${heroBad ? 'bad' : 'ok'}">
                <div class="hero-status">
                  <span class="hero-pulse"><span class="hero-pulse-core"></span></span>
                  <div>
                    <div class="hero-verdict">${verdict}</div>
                    <div class="hero-sub">Monitoring ${total} endpoints · refreshes every 60s</div>
                  </div>
                </div>
              </div>
              <div class="tiles">
                ${tile('Uptime · 90d', uptime90d, '%', 'ok')}
                ${tile('Avg response', String(avgRt), 'ms', '')}
                ${tile('Operational', `${up}/${total}`, '', '')}
                ${tile('Open incidents', String(open), '', open > 0 ? 'bad' : 'ok')}
              </div>
            </section>
            <section class="sec">
              <div class="sec-head">
                <h2 class="sec-title">Monitors</h2>
                <span class="sec-count">${total} endpoints</span>
              </div>
              <div class="mlist">${cards}</div>
            </section>
            <section class="sec">
              <div class="sec-head"><h2 class="sec-title">Recent Incidents</h2></div>
              ${incidents}
            </section>
            <footer class="ft">
              Generated ${fmtTime(data.generatedAt, tz)} · times shown in ${tz} · auto-refresh every 60s
            </footer>
          </main>
        </div>
      </body>
    </html>`;
}
