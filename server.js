// server.js
const express = require("express");
const { chromium } = require("playwright");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/health", (_, res) => res.send("ok"));
app.get("/", (_, res) => res.json({ ok: true, usage: "/scrape?url=<encoded url>" }));

// Support both /scrape and /content for convenience
app.get(["/scrape", "/content"], async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).json({ ok: false, error: "Missing ?url" });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    locale: "en-US",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    ignoreHTTPSErrors: true,
    extraHTT
