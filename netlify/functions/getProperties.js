import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

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
async function geocodeTown(townRaw) {
  const town = (townRaw || "").trim();
  if (!town || town === "No town") {
    return { lat: null, lon: null };
  }

  // Return from cache if available
  if (GEO_CACHE.has(town)) return GEO_CACHE.get(town);

  // Nominatim requires a descriptive User-Agent with contact info
  const userAgent =
    process.env.NOMINATIM_USER_AGENT ||
    `PropertyMap/1.0 (${
      process.env.NOMINATIM_CONTACT_EMAIL || "kragelj.valentin.com"
    })`;

  async function queryNominatim(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
      query
    )}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    return res.json();
  }

  try {
    // First try without ", Slovenia"
    let data = await queryNominatim(town);

    // If no results, try with ", Slovenia"
    if (!Array.isArray(data) || data.length === 0) {
      data = await queryNominatim(`${town}, Slovenia`);
    }

    // if no results, try until last comma (without ", Slovenia")
    if (!Array.isArray(data) || data.length === 0) {
      let townToTry = town;
      while (!Array.isArray(data) || data.length === 0) {
        const lastCommaIndex = townToTry.lastIndexOf(",");
        if (lastCommaIndex === -1) break; // No more parts to try
        townToTry = townToTry.slice(0, lastCommaIndex);
        data = await queryNominatim(townToTry);
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
    return result;
  } catch (err) {
    console.error("Geocoding error for town:", town, err);
    const fallback = { lat: null, lon: null };
    GEO_CACHE.set(town, fallback);
    return fallback;
  }
}

export const handler = async (event, context) => {
  // Enable CORS for web requests
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const { url } = event.queryStringParameters;

    // Check if we're in Netlify environment or local development
    const isNetlify = process.env.NETLIFY === "true";
    console.log("Environment check:", { isNetlify, NETLIFY: process.env.NETLIFY });
    console.log("CHROME_EXECUTABLE_PATH:", process.env.CHROME_EXECUTABLE_PATH);

    let browser;

    if (isNetlify) {
      // Use @sparticuz/chromium for Netlify
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
      });
    } else {
      // For local development, try to use system Chrome or fail clearly
      try {
        const chromePaths = [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          process.env.CHROME_EXECUTABLE_PATH,
        ].filter(Boolean);

        let executablePath = null;
        try {
          const fs = await import("fs");
          for (const p of chromePaths) {
            if (p && fs.existsSync(p)) {
              executablePath = p;
              break;
            }
          }
        } catch (_) {
          // ignore
        }

        if (executablePath) {
          console.log("Using Chrome at:", executablePath);
          browser = await puppeteer.launch({
            executablePath,
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
          });
        } else {
          throw new Error("Chrome not found");
        }
      } catch (error) {
        console.log("Chrome not available locally, throwing error");
        throw new Error("Chrome browser not available for local development");
      }
    }

    const page = await browser.newPage();

    // Set user agent to look more like a real browser
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate to page
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait a bit for any dynamic content to load
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Extract properties using the correct selectors
    const properties = await page.evaluate(() => {
      const properties = [];

      // Find all property boxes
      const propertyBoxes = document.querySelectorAll(".property-box");

      propertyBoxes.forEach((box, index) => {
        // Extract title
        const titleElement = box.querySelector("h2");
        const title = titleElement ? titleElement.textContent.trim() : "No title";

        // Heuristic: if you later identify a dedicated location element, replace this.
        const town = title === "No title" ? "No town" : title;

        // Extract URL
        const urlElement = box.querySelector("a.url-title-d");
        const url = urlElement ? urlElement.href : "No url-title-d";

        // Extract price
        const priceElement = box.querySelector("h6");
        const price = priceElement ? priceElement.textContent.trim() : "No price";

        // Extract link
        const linkElement = box.querySelector('a[href*="/oglasi-oddaja/"]');
        const link = linkElement ? linkElement.href : "No link";

        // Extract description
        const descElement = box.querySelector('p[itemprop="description"]');
        const description = descElement
          ? descElement.textContent.trim()
          : "No description";

        // Extract property type
        const typeElement = box.querySelector(".tipi");
        const propertyType = typeElement ? typeElement.textContent.trim() : "No type";

        // Extract details from the ul list
        const detailsList = box.querySelectorAll(
          'ul[itemprop="disambiguatingDescription"] li'
        );
        const details = [];
        detailsList.forEach((li) => {
          const text = li.textContent.trim();
          if (text) details.push(text);
        });

        // Extract seller/agency
        const sellerElement = box.querySelector(".property-btn span");
        const seller = sellerElement
          ? sellerElement.textContent.trim()
          : "No seller info";

        // Extract image
        const imgElement = box.querySelector(".property-image img");
        let image = "No image";
        if (imgElement) {
          // 1) Prefer lazy-loaded source
          let src =
            imgElement.getAttribute("data-src") || imgElement.getAttribute("src");

          // 2) Fallback to srcset/data-srcset (take the first URL)
          if (!src) {
            const srcset =
              imgElement.getAttribute("data-srcset") ||
              imgElement.getAttribute("srcset");
            if (srcset) {
              // srcset format: "url1 320w, url2 640w, ..."
              const first = srcset.split(",")[0].trim().split(/\s+/)[0];
              if (first) src = first;
            }
          }

          // 3) Make absolute if needed
          if (src) {
            image = src.startsWith("http") ? src : new URL(src, document.baseURI).href;
          }
        }

        properties.push({
          id: index + 1,
          title: title,
          town: town,
          price: price,
          link: link,
          description: description,
          propertyType: propertyType,
          details: details,
          seller: seller,
          image: image,
          url: url,
          scrapedAt: new Date().toISOString(),
        });
      });

      return properties;
    });

    await browser.close();

    // --- Geocode unique towns and attach latitude/longitude ---
    const uniqueTowns = [
      ...new Set(
        properties.map((p) => (p.town || "").trim()).filter((t) => t && t !== "No town")
      ),
    ];

    // Geocode sequentially (safer for rate-limited free service)
    const townCoordMap = {};
    for (const t of uniqueTowns) {
      const { lat, lon } = await geocodeTown(t);
      townCoordMap[t] = { lat, lon };
    }

    const propertiesWithCoords = properties.map((p) => {
      const key = (p.town || "").trim();
      const coords = key ? townCoordMap[key] : null;
      return {
        ...p,
        latitude: coords?.lat ?? null,
        longitude: coords?.lon ?? null,
      };
    });

    // Return the properties as JSON
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        count: propertiesWithCoords.length,
        properties: propertiesWithCoords,
        scrapedAt: new Date().toISOString(),
        source: "nepremicnine.net",
      }),
    };
  } catch (error) {
    console.error("Error scraping properties:", error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: "Failed to scrape properties",
      }),
    };
  }
};
