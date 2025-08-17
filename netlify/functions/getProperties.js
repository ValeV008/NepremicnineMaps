import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import dotenv from "dotenv";

dotenv.config();

/** ---------- Debug helpers ---------- */
const now = () => Date.now();
const dur = (t0) => `${now() - t0}ms`;
const newReqId = () =>
  `${Math.floor(Math.random() * 1e6).toString(16)}-${Date.now().toString(36)}`;

/**
 * --- Simple in-memory cache (persists while the function instance is warm) ---
 * Key: town string
 * Value: { lat: number|null, lon: number|null }
 */
const GEO_CACHE = new Map();

/**
 * Geocode a town name to { lat, lon } using Nominatim (OpenStreetMap).
 * Adds ", Slovenia" to bias results. Adjust if your listings span other countries.
 */
async function geocodeTown(townRaw, log) {
  const t0 = now();
  const town = (townRaw || "").trim();
  if (!town || town === "No town") {
    log(`geocodeTown: skip empty/no-town in ${dur(t0)}`);
    return { lat: null, lon: null };
  }

  if (GEO_CACHE.has(town)) {
    log(`geocodeTown: cache hit for "${town}" in ${dur(t0)}`);
    return GEO_CACHE.get(town);
  }

  const userAgent =
    process.env.NOMINATIM_USER_AGENT ||
    `PropertyMap/1.0 (${
      process.env.NOMINATIM_CONTACT_EMAIL || "kragelj.valentin.com"
    })`;

  async function queryNominatim(query, label) {
    const qStart = now();
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
      query
    )}`;
    log(`geocodeTown: fetch [${label}] url="${url}"`);
    const res = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        Accept: "application/json",
      },
    });
    log(`geocodeTown: response [${label}] status=${res.status} in ${dur(qStart)}`);
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    return res.json();
  }

  try {
    let data = await queryNominatim(town, "plain");
    if (!Array.isArray(data) || data.length === 0) {
      log(`geocodeTown: empty for "${town}", trying with ", Slovenia"`);
      data = await queryNominatim(`${town}, Slovenia`, "with-slovenia");
    }
    if (!Array.isArray(data) || data.length === 0) {
      // progressively strip trailing ", part"
      let townToTry = town;
      while (!Array.isArray(data) || data.length === 0) {
        const lastCommaIndex = townToTry.lastIndexOf(",");
        if (lastCommaIndex === -1) break;
        townToTry = townToTry.slice(0, lastCommaIndex);
        log(`geocodeTown: fallback progressive "${townToTry}"`);
        data = await queryNominatim(townToTry, "progressive");
      }
    }

    const result =
      Array.isArray(data) &&
      data.length > 0 &&
      data[0].lat != null &&
      data[0].lon != null &&
      !isNaN(parseFloat(data[0].lat)) &&
      !isNaN(parseFloat(data[0].lon))
        ? { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) }
        : { lat: null, lon: null };

    GEO_CACHE.set(town, result);
    log(`geocodeTown: resolved "${town}" => ${JSON.stringify(result)} in ${dur(t0)}`);
    return result;
  } catch (err) {
    log(`geocodeTown: ERROR for "${town}": ${err?.message}`);
    const fallback = { lat: null, lon: null };
    GEO_CACHE.set(town, fallback);
    return fallback;
  }
}

export const handler = async (event, context) => {
  const reqId = newReqId();
  const tStart = now();
  const log = (msg) => console.log(`[req:${reqId}] ${msg}`);

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
    const isNetlify = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
    log(
      `Environment check: isNetlify=${isNetlify}, CHROME_EXECUTABLE_PATH=${process.env.CHROME_EXECUTABLE_PATH}`
    );

    let browser;
    try {
      const tLaunch = now();
      if (isNetlify) {
        log("puppeteer.launch: Netlify/Chromium branch");
        browser = await puppeteer.launch({
          args: [
            ...chromium.args,
            "--disable-dev-shm-usage",
            "--no-sandbox",
            "--disable-setuid-sandbox",
          ],
          defaultViewport: chromium.defaultViewport,
          executablePath: await chromium.executablePath(),
          headless: chromium.headless,
          ignoreHTTPSErrors: true,
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
      page.on("console", (m) => log(`page.console[${m.type()}]: ${m.text()}`));
      page.on("pageerror", (err) => log(`page.pageerror: ${err?.message}`));
      page.on("error", (err) => log(`page.error: ${err?.message}`));

      // abort unneeded requests
      await page.setRequestInterception(true);
      page.on("request", (req) => {
        const type = req.resourceType();
        if (["image", "stylesheet", "font"].includes(type)) {
          req.abort();
        } else {
          req.continue();
        }
      });
      log("request interception enabled");

      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );
      await page.setViewport({ width: 1920, height: 1080 });
      log("UA and viewport set");

      // Navigate
      const tGoto = now();
      log(`page.goto: start -> ${url}`);
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      } catch (navErr) {
        log(`page.goto: ERROR ${navErr?.message}`);
        throw navErr;
      }
      log(`page.goto: done in ${dur(tGoto)}`);

      // Wait for the listing container
      const tWait = now();
      try {
        await page.waitForSelector(".property-box", { timeout: 5000 });
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

      // Optionally log a couple of sample items (trim fields to keep logs short)
      if (properties.length > 0) {
        const sample = properties.slice(0, 2).map((p) => ({
          id: p.id,
          title: (p.title || "").slice(0, 60),
          price: p.price,
          town: (p.town || "").slice(0, 60),
        }));
        log(`page.evaluate: sample=${JSON.stringify(sample)}`);
      }
    } catch (scrapeErr) {
      log(`SCRAPE BLOCK ERROR: ${scrapeErr?.message}`);
      // Always try to close the browser on scrape error
      try {
        await browser.close();
        log("browser.close after scrape error: ok");
      } catch (e) {
        log(`browser.close after scrape error: ERROR ${e?.message}`);
      }
      throw scrapeErr;
    }

    // Close browser (normal path)
    const tClose = now();
    try {
      await browser.close();
      log(`browser.close: ok in ${dur(tClose)}`);
    } catch (closeErr) {
      log(`browser.close: ERROR ${closeErr?.message}`);
    }

    // --- Geocode unique towns and attach latitude/longitude ---
    const tGeo = now();
    const uniqueTowns = [
      ...new Set(
        properties.map((p) => (p.town || "").trim()).filter((t) => t && t !== "No town")
      ),
    ];
    log(`geocoding: uniqueTowns=${uniqueTowns.length}`);

    const townCoordMap = {};
    const chunkSize = 5;
    for (let i = 0; i < uniqueTowns.length; i += chunkSize) {
      const chunk = uniqueTowns.slice(i, i + chunkSize);
      log(
        `geocoding: chunk [${i}..${i + chunk.length - 1}] -> ${JSON.stringify(chunk)}`
      );
      const results = await Promise.all(chunk.map((t) => geocodeTown(t, log)));
      chunk.forEach((town, idx) => {
        townCoordMap[town] = results[idx];
      });
    }
    log(`geocoding: done in ${dur(tGeo)}`);

    const tMap = now();
    const propertiesWithCoords = properties.map((p) => {
      const coords = townCoordMap[(p.town || "").trim()] || {};
      return {
        ...p,
        latitude: coords.lat ?? null,
        longitude: coords.lon ?? null,
      };
    });
    log(`map props+coords: count=${propertiesWithCoords.length} in ${dur(tMap)}`);

    const tEnd = dur(tStart);
    log(`handler: success; total=${tEnd}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        properties: propertiesWithCoords,
      }),
    };
  } catch (error) {
    console.error(`[req:${reqId}] FATAL: ${error?.message}`);
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
