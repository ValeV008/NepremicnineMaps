//import puppeteer from "puppeteer-extra";
//import StealthPlugin from "puppeteer-extra-plugin-stealth";
import puppeteer from "puppeteer-core";
//import chromium from "@sparticuz/chromium";
import dotenv from "dotenv";

dotenv.config();

// Enable stealth evasions to reduce automation signals
puppeteer.use(StealthPlugin());

/** ---------- Debug helpers ---------- */
const now = () => Date.now();
const dur = (t0) => `${now() - t0}ms`;

export const handler = async (event, context) => {
  const tStart = now();
  const log = (msg) => console.log(`${msg}`);

  // Enable CORS for web requests
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    log("OPTIONS preflight");
    return { statusCode: 200, headers, body: "" };
  }

  try {
    log(`handler: start; context.fnName=${context?.functionName || "n/a"}`);
    const { url } = event.queryStringParameters || {};
    log(`handler: query.url="${url}"`);

    if (!url) {
      log("handler: MISSING url parameter");
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Missing required query parameter: url",
          message: "Missing required query parameter: url",
          properties: [],
        }),
      };
    }

    // Detect Netlify Lambda
    const isNetlify = !process.env.CHROME_EXECUTABLE_PATH;
    log(
      `Environment check: isNetlify=${isNetlify}, CHROME_EXECUTABLE_PATH=${process.env.CHROME_EXECUTABLE_PATH}`
    );

    let browser;
    try {
      const tLaunch = now();
      if (isNetlify) {
        log("puppeteer.launch: Netlify/Chromium branch");
        // browser = await puppeteer.launch({
        //   args: [
        //     ...chromium.args,
        //     "--disable-dev-shm-usage",
        //     "--no-sandbox",
        //     "--disable-setuid-sandbox",
        //   ],
        //   executablePath: await chromium.executablePath(),
        //   headless: false,
        //   ignoreHTTPSErrors: true,
        // });
        browser = await puppeteer.connect({
          browserWSEndpoint: `wss://production-ams.browserless.io/?token=2SvprjVRTXlgATk25737bfcc3a676141b7c450b30b257e53d`,
          args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-setuid-sandbox"],
        });
      } else {
        log(
          `puppeteer.launch: Local branch; executable=${process.env.CHROME_EXECUTABLE_PATH}`
        );
        browser = await puppeteer.launch({
          executablePath: process.env.CHROME_EXECUTABLE_PATH,
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
      }
      log(`puppeteer.launch: done in ${dur(tLaunch)}`);
    } catch (e) {
      log(`puppeteer.launch: ERROR ${e?.message}`);
      throw e;
    }

    let properties = [];
    try {
      const tPage = now();
      const page = await browser.newPage();
      log(`page.newPage: ok in ${dur(tPage)}`);

      // Pipe page console/errors for visibility
      // Track only navigation requests/responses (to reduce noise)
      page.on("request", (req) => {
        if (req.isNavigationRequest()) {
          log(`nav.request: ${req.method()} ${req.url()}`);
        }
      });
      page.on("response", (res) => {
        try {
          const req = res.request();
          if (req.isNavigationRequest()) {
            log(`nav.response: ${res.status()} ${req.url()}`);
          }
        } catch (_) {}
      });
      page.on("requestfailed", (req) => {
        if (req.isNavigationRequest()) {
          log(`nav.requestfailed: ${req.failure()?.errorText} ${req.url()}`);
        }
      });

      // Frame lifecycle breadcrumbs
      page.on("domcontentloaded", () => log("event: domcontentloaded"));
      page.on("load", () => log("event: load"));
      page.on("framenavigated", (fr) => {
        if (fr === page.mainFrame()) log(`event: framenavigated -> ${fr.url()}`);
      });

      // --- Fingerprinting & anti-automation leaks ---
      // Use a UA aligned to Chrome 138 (matches our Chromium bundle)
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"
      );
      await page.emulateTimezone("Europe/Ljubljana");
      await page.setViewport({
        width: Math.floor(1024 + Math.random() * 100),
        height: Math.floor(768 + Math.random() * 100),
      });
      log("UA/viewport/timezone set");

      if (!isNetlify) {
        await page.setRequestInterception(true);
        page.on("request", (req) => {
          const url = req.url();
          // block only the known troublemakers
          if (
            url.includes("nepremicnine.click/www/delivery/") ||
            url.includes("asyncjs.php") ||
            url.includes("ajs.php")
          ) {
            return req.abort();
          }
          // allow everything else without delay
          return req.continue();
        });
      }

      // sanity navigation
      // try {
      //   const tSanity = Date.now();
      //   log(`sanity.goto: https://example.com`);
      //   await page.goto("https://example.com", {
      //     waitUntil: "domcontentloaded",
      //     timeout: 8000,
      //   });
      //   log(`sanity.goto: ok in ${Date.now() - tSanity}ms`);
      // } catch (e) {
      //   log(`sanity.goto: ERROR ${e.message}`);
      // }

      // Navigate
      const tGoto = now();
      log(`page.goto: start -> ${url}`);
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
      } catch (navErr) {
        log(`page.goto: ERROR ${navErr?.message}`);
        throw navErr;
      }
      log(`page.goto: done in ${dur(tGoto)}`);

      // Wait for the listing container
      const tWait = now();
      try {
        await page.waitForSelector(".property-box", { timeout: 10000 });
        log(`waitForSelector(".property-box"): ok in ${dur(tWait)}`);
      } catch (waitErr) {
        log(`waitForSelector(".property-box"): TIMEOUT/ERROR ${waitErr?.message}`);
        throw waitErr;
      }

      const tEval = now();
      log("page.evaluate: start scrape");
      properties = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll(".property-box").forEach((box, index) => {
          const title = box.querySelector("h2")?.textContent.trim() || "No title";
          const town = title === "No title" ? "No town" : title;

          const urlEl = box.querySelector("a.url-title-d");
          const url = urlEl ? urlEl.href : "No url-title-d";

          const price = box.querySelector("h6")?.textContent.trim() || "No price";
          const link =
            box.querySelector('a[href*="/oglasi-oddaja/"]')?.href || "No link";

          let image = "No image";
          const imgElement = box.querySelector(".property-image img");
          if (imgElement) {
            let src =
              imgElement.getAttribute("data-src") || imgElement.getAttribute("src");
            if (!src) {
              const srcset =
                imgElement.getAttribute("data-srcset") ||
                imgElement.getAttribute("srcset");
              if (srcset) {
                const first = srcset.split(",")[0].trim().split(/\s+/)[0];
                if (first) src = first;
              }
            }
            if (src) {
              image = src.startsWith("http")
                ? src
                : new URL(src, document.baseURI).href;
            }
          }

          out.push({
            id: index + 1,
            title,
            town,
            price,
            link,
            image,
            url,
          });
        });
        return out;
      });
      log(`page.evaluate: scraped count=${properties.length} in ${dur(tEval)}`);
    } catch (scrapeErr) {
      log(`SCRAPE BLOCK ERROR: ${scrapeErr?.message}`);
      // Always try to close the browser on scrape error
      try {
        for (const page of await browser.pages()) {
          await page.close();
        }
        log("browser.close after scrape error: ok");
      } catch (e) {
        log(`browser.close after scrape error: ERROR ${e?.message}`);
      }
      throw scrapeErr;
    }

    // Close browser (normal path)
    const tClose = now();
    try {
      for (const page of await browser.pages()) {
        await page.close();
      }
      log(`browser.close: ok in ${dur(tClose)}`);
    } catch (closeErr) {
      log(`browser.close: ERROR ${closeErr?.message}`);
    }

    // --- Return scraped properties only (no geolocation here) ---
    const tEnd = dur(tStart);
    log(`handler: success; total=${tEnd}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        properties,
      }),
    };
  } catch (error) {
    console.error(`FATAL: ${error?.message}`);
    return {
      statusCode: 200, // keep your current behavior
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: "Failed to scrape properties",
        properties: [],
      }),
    };
  }
};
