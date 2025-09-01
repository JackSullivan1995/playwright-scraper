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
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    // Use real desktop settings (UA/viewport/etc), locale & timezone
    const context = await browser.newContext({
      ...desktop,
      locale: "en-GB",
      timezoneId: "Europe/London",
    });

    // Slightly more realistic headers
    await context.setExtraHTTPHeaders({
      "Accept-Language": "en-GB,en;q=0.9",
      "Upgrade-Insecure-Requests": "1",
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(90_000);
    page.setDefaultTimeout(90_000);

    // IMPORTANT: do NOT block fonts/images; Cloudflare may require them.
    // (If you later want to speed up, only block 'media' after it's working.)
    // await page.route("**/*", (route) => {
    //   const t = route.request().resourceType();
    //   if (t === "media") return route.abort();
    //   return route.continue();
    // });

    // Navigate + staged waits
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // Let scripts/challenge init
    await page.waitForTimeout(1500);
    try { await page.waitForLoadState("networkidle", { timeout: 15_000 }); } catch {}

    // Retry loop if Cloudflare challenge title shows
    let title = await page.title();
    for (let i = 0; i < 3 && /just a moment|cloudflare/i.test(title); i++) {
      await page.waitForTimeout(4000);
      try { await page.waitForLoadState("networkidle", { timeout: 10_000 }); } catch {}
      title = await page.title();
    }

    // As a last resort, re-navigate once (some challenges finish after a short delay)
    if (/just a moment|cloudflare/i.test(title)) {
      await page.waitForTimeout(2000);
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await page.waitForTimeout(1500);
        try { await page.waitForLoadState("networkidle", { timeout: 10_000 }); } catch {}
        title = await page.title();
      } catch {}
    }

    // Try to ensure page has some meaningful DOM
    try {
      await page.waitForSelector("main, article, h1, .listing, .article-list", { timeout: 15_000 });
    } catch {}

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

