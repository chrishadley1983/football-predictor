// Oddschecker scraper: winner / to-qualify / niche markets for groups A-L.
// Requires headed Chrome (Cloudflare blocks headless). Writes cache/oddschecker.json
// incrementally so a crash loses nothing. Usage:
//   node fetch_oddschecker.js [markets-csv] [groups]   e.g. node fetch_oddschecker.js winner,to-qualify abcdef
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'cache', 'oddschecker.json');
const MARKETS = (process.argv[2] || 'winner,to-qualify,to-finish-2nd,straight-forecast,group-exact-finish-order').split(',');
const GROUPS = (process.argv[3] || 'abcdefghijkl').split('');
const MAX_AGE_MIN = Number(process.env.OC_MAX_AGE_MIN || 0); // 0 = always refetch
const WAIT_MS = Number(process.env.OC_WAIT_MS || 6500);
const SKIP_NONEMPTY = !!process.env.OC_ONLY_EMPTY; // retry mode: only re-scrape empty pages

function fracToDec(s) {
  if (!s) return null;
  s = s.replace(/\s+/g, '');
  if (!s || s === '-' || s === 'SP') return null;
  if (/^evens?$/i.test(s) || /^evs$/i.test(s)) return 2.0;
  if (s.includes('/')) {
    const [n, d] = s.split('/').map(Number);
    return d && !isNaN(n) ? n / d + 1 : null;
  }
  const n = Number(s);
  return isNaN(n) ? null : n + 1; // bare numbers are fractional
}

function load() {
  try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { return { markets: {}, fetched: {} }; }
}
function save(db) {
  db.fetched_at = new Date().toISOString();
  fs.writeFileSync(OUT, JSON.stringify(db, null, 1));
}

(async () => {
  const db = load();
  const browser = await chromium.launch({
    headless: false, channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 }, locale: 'en-GB', timezoneId: 'Europe/London',
  });
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  const page = await ctx.newPage();

  await page.goto('https://www.oddschecker.com/football/world-cup',
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(6000);
  for (const sel of ['#onetrust-accept-btn-handler', 'button:has-text("Accept All")']) {
    try {
      const b = page.locator(sel).first();
      if (await b.isVisible({ timeout: 1500 })) { await b.click(); await page.waitForTimeout(1200); break; }
    } catch (e) { }
  }
  console.log('warmed up:', await page.title());

  let okCount = 0, failCount = 0;
  for (const mkt of MARKETS) {
    db.markets[mkt] = db.markets[mkt] || {};
    for (const g of GROUPS) {
      const key = `${mkt}/${g}`;
      const prev = db.fetched[key];
      if (MAX_AGE_MIN > 0 && prev && (Date.now() - Date.parse(prev)) < MAX_AGE_MIN * 60000) {
        console.log(key, 'fresh, skipping'); continue;
      }
      if (SKIP_NONEMPTY && (db.markets[mkt][g.toUpperCase()] || []).length > 0) {
        console.log(key, 'has data, skipping (only-empty mode)'); continue;
      }
      const url = `https://www.oddschecker.com/football/world-cup/group-${g}/${mkt}`;
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded', timeout: 60000,
          referer: 'https://www.oddschecker.com/football/world-cup',
        });
        await page.waitForTimeout(WAIT_MS);
        let title = await page.title();
        if (/just a moment/i.test(title)) { await page.waitForTimeout(15000); title = await page.title(); }
        const rows = await page.evaluate(() => {
          const out = [];
          document.querySelectorAll('tr').forEach(tr => {
            const cells = Array.from(tr.querySelectorAll('td,th')).map(c => {
              const bk = c.getAttribute('data-bk') || '';
              const txt = (c.innerText || '').trim().replace(/\n/g, '/');
              return bk ? bk + ':' + txt : txt;
            });
            if (cells.length > 2) out.push(cells);
          });
          return out;
        });
        const sels = [];
        for (const cells of rows) {
          const name = cells[0];
          if (!name || name.length > 90 ||
            /quickbet|sort|sign up|special|sportsbook|bet slip|view all|odds$/i.test(name)) continue;
          const prices = {};
          for (const c of cells.slice(1)) {
            const m = c.match(/^([A-Z0-9]+):(.*)$/);
            if (!m) continue;
            const d = fracToDec(m[2]);
            if (d && d >= 1.001 && d < 5001) prices[m[1]] = Math.round(d * 1000) / 1000;
          }
          if (Object.keys(prices).length >= 2) sels.push({ name, prices });
        }
        db.markets[mkt][g.toUpperCase()] = sels;
        db.fetched[key] = new Date().toISOString();
        save(db);
        okCount++;
        console.log(key, '->', sels.length, 'selections');
      } catch (e) {
        failCount++;
        console.error(key, 'FAILED:', e.message.slice(0, 120));
      }
    }
  }
  await browser.close();
  console.log(`DONE ok=${okCount} failed=${failCount}`);
  process.exit(failCount > okCount ? 1 : 0);
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
