// server.js
const express = require('express');
const { chromium } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------- Health endpoints (Render expects /health) ---------- */
const health = (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).send('ok');
};
app.get('/health', health);
app.head('/health', (_req, res) => res.sendStatus(200)); // fast HEAD for probes

// keep your original too (harmless)
app.get('/healthz', health);
app.head('/healthz', (_req, res) => res.sendStatus(200));

// optional: simple root for quick manual checks
app.get('/', (_req, res) => res.status(200).send('up'));

/* ---------- Fast fetch path (no browser) ---------- */
app.get('/fetch', async (req, res) => {
  const raw = req.query.url || req.query.u;
  if (!raw) return res.status(400).json({ error: 'Missing ?url=' });

  let target;
  try { target = new URL(raw).toString(); }
  catch { return res.status(400).json({ error: 'Invalid URL' }); }

  try {
    const r = await fetch(target, {
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9'
      }
    });
    const text = await r.text();
    res.set('Content-Type', 'text/html; charset=utf-8').status(200).send(text);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

/* ---------- Full Playwright path (for tougher pages/CF) ---------- */
app.get('/scrape', async (req, res) => {
  const raw = req.query.url || req.query.u;
  if (!raw) return res.status(400).json({ error: 'Missing ?url=' });

  let target;
  try { target = new URL(raw).toString(); }
  catch { return res.status(400).json({ error: 'Invalid URL' }); }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36',
      locale: 'en-US'
    });
    const page = await context.newPage();

    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    const html = await page.content();

    res.set('Content-Type', 'text/html; charset=utf-8').status(200).send(html);

    await context.close();
  } catch (err) {
    res.status(502).json({ error: err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

app.listen(PORT, () => console.log(`listening on ${PORT}`));
