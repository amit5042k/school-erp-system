// Renders assets/logo.svg into the Android launcher icons and splash screens.
// Needs Playwright with Chromium (npx playwright install chromium, or a system install).
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const root = path.join(__dirname, '..');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const svg = fs.readFileSync(path.join(root, 'assets', 'logo.svg'), 'utf8');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'app.config.json'), 'utf8'));
const theme = cfg.themeColor || '#133b7a';

const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const SPLASH = {
  'drawable': [480, 320],
  'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920],
  'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280],
};

const page = (w, h, body, bg = 'transparent') =>
  `<html><body style="margin:0;width:${w}px;height:${h}px;background:${bg};display:flex;align-items:center;justify-content:center;overflow:hidden">${body}</body></html>`;
const img = (size, extra = '') => svg.replace('<svg ', `<svg width="${size}" height="${size}" style="${extra}" `);

(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage();
  async function render(file, w, h, html, transparent = true) {
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(html);
    await p.screenshot({ path: file, omitBackground: transparent, type: 'png' });
  }
  for (const [d, s] of Object.entries(LAUNCHER)) {
    const dir = path.join(res, `mipmap-${d}`);
    await render(path.join(dir, 'ic_launcher.png'), s, s, page(s, s, img(s)));
    await render(path.join(dir, 'ic_launcher_round.png'), s, s, page(s, s, img(s, 'border-radius:50%')));
    // Adaptive icon foreground: 108dp canvas, artwork inside the 66dp safe zone.
    const f = Math.round(s * 108 / 48);
    const inner = Math.round(f * 0.62);
    await render(path.join(dir, 'ic_launcher_foreground.png'), f, f, page(f, f, img(inner, 'border-radius:22%')));
  }
  for (const [folder, [w, h]] of Object.entries(SPLASH)) {
    const logo = Math.round(Math.min(w, h) * 0.32);
    await render(path.join(res, folder, 'splash.png'), w, h,
      page(w, h, `<div style="text-align:center;font-family:Arial,sans-serif;color:#fff">${img(logo)}<div style="font-size:${Math.round(logo * 0.16)}px;font-weight:700;margin-top:${Math.round(logo * 0.1)}px">${cfg.appName}</div></div>`, theme), false);
  }
  await browser.close();
  console.log('Icons and splash screens written to', res);
})().catch(e => { console.error(e); process.exit(1); });
