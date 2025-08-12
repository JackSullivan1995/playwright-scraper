import express from "express";
import { chromium } from "playwright";

const app = express();

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/scrape", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing ?url=" });

  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      locale: "en-GB",
      timezoneId: "Europe/London",
    });

    const page = await context.newPage();
    page.setDefaultNavigationTimeout(90_000);
    page.setDefaultTimeout(90_000);

    // Speed up & reduce flakiness: skip heavy assets
    await page.route("**/*", (route) => {
      const t = route.request().resourceType();
      if (t === "image" || t === "font" || t === "media") return route.abort();
      return route.continue();
    });

    // Use a more forgiving wait condition
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // Give CF / dynamic scripts a moment
    await page.waitForTimeout(2000);

    // If we hit a CF interstitial, wait again briefly
    let title = await page.title();
    if (/just a moment|cloudflare/i.test(title)) {
      await page.waitForTimeout(4000);
      try { await page.waitForLoadState("networkidle", { timeout: 10_000 }); } catch {}
      title = await page.title();
    }

    // Try to ensure some meaningful content exists
    try { await page.waitForSelector("h1, main, article", { timeout: 15_000 }); } catch {}

    const html = await page.content();
    res.json({ url, title, html });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server listening on", PORT);
});
