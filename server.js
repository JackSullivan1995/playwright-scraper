// server.js
const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright'); // 1.45.x in the base image

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

// Fast, no-browser fallback (sometimes enough for Google News gLinks)
app.get('/fetch', async (req, res) => {
  const raw = req.query.url || req.query.u;
  if (!raw) return res.status(400).json({ error: 'Missing ?url=' });
  let target;
  try { target = new URL(raw).toString(); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  try {
    const r = await fetch(target, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36' }
    });
    const text = await r.text();
    res.set('Content-Type', 'text/html; charset=utf-8').status(200).send(text);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Full Playwright path for tougher pages / Cloudflare
app.get('/scrape', async (req, res) => {
  const raw = req.query.url || req.query.u;
  if (!raw) return res.status(400).json({ error: 'Missing ?url=' });

  let target;
  try { target = new URL(raw).toString(); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36'
    });
    const page = await context.newPage();

    const resp = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
