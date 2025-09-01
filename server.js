// server.js
import express from "express";
import { chromium, devices } from "playwright";

const app = express();
const desktop = devices["Desktop Chrome"]; // realistic desktop profile

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/scrape", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing ?url=" });

  let browser;
  const started = Date.now();

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled"
      ],
    });

    // Make the context look like a real desktop Chrome, keep JS/cookies on
    const context = await browser.newContext({
      ...desktop,
      locale: "en-GB",
      timezoneId: "Europe/London",
      ignoreHTTPSErrors: true,
      bypassCSP: true,            // don’t block third-party scripts like Turnstile
      javaScriptEnabled: true,
      acceptDownloads: false,
    });

    // Subtle anti-bot hardening (harmless)
    await context.addInitScript(() => {
      // navigator.webdriver -> undefined
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      // languages
      Object.defineProperty(navigator, "languages", { get: () => ["en-GB", "en"] });
      // plugins length > 0
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
    });

    await context.setExtraHTTPHeaders({
      "Accept-Language": "en-GB,en;q=0.9",
      "Upgrade-Insecure-Requests": "1",
      "DNT": "1",
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(90_000);
    page.setDefaultTimeout(90_000);

    // DO NOT block fonts/images — Cloudflare/Turnstile may need them

    // 1) Warm the root domain first (lets CF set cookies/challenge once)
    try {
      await page.goto("https://www.hrgrapevine.com/", { waitUntil: "domcontentloaded", timeout: 60_000 });
      // Small settle time + best-effort idle
      await page.waitForTimeout(1500);
      try { await page.waitForLoadState("networkidle", { timeout: 10_000 }); } catch {}
    } catch {}

    // Helper: wait until the title is no longer the challenge title
    async function waitUntilNotChallenge(p, maxMs = 30000) {
      const start = Date.now();
      let title = await p.title();
      while (/just a moment/i.test(title) && Date.now() - start < maxMs) {
        await p.waitForTimeout(3000);
        try { await p.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
        title = await p.title();
      }
      return title;
    }

    // 2) Go to the requested page
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    let title = await waitUntilNotChallenge(page, 40_000);

    // 3) If still on challenge, try one reload (some CF flows finish on reload)
    if (/just a moment/i.test(title)) {
      await page.waitForTimeout(2000);
      try {
        await page.reload({ waitUntil: "domcontentloaded", timeout: 60_000 });
        title = await waitUntilNotChallenge(page, 20_000);
      } catch {}
    }

    // 4) As a last resort, re-visit root once more, then back to target
    if (/just a moment/i.test(title)) {
      try {
        await page.goto("https://www.hrgrapevine.com/", { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForTimeout(1500);
        try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        title = await waitUntilNotChallenge(page, 20_000);
      } catch {}
    }

    // Try ensuring some content exists (best-effort)
    try { await page.waitForSelector("main, article, h1, .listing, .article-list", { timeout: 15000 }); } catch {}

    const finalUrl = page.url();
    const html = await page.content();

    res.json({
      ok: true,
      url,
      finalUrl,
      title,
      html,
      html_len: html.length,
      timingMs: Date.now() - started,
      ua: desktop.userAgent,
    });

    await context.close();
    await browser.close();
  } catch (err) {
    if (browser) try { await browser.close(); } catch {}
    res.status(500).json({ ok: false, error: String(err), timingMs: Date.now() - started });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server listening on", PORT);
});
