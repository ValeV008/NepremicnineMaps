import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

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
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  try {
    const url =
      "https://www.nepremicnine.net/oglasi-oddaja/gorenjska/kranj/stanovanje/1-sobno,15-sobno,2-sobno,25-sobno,3-sobno,35-sobno,4-sobno,45-sobno,5-in-vecsobno,drugo-36,apartma/cena-do-600-eur-na-mesec/?nadst[0]=vsa&nadst[1]=vsa";

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
      // For local development, try to use system Chrome or fallback to mock data
      try {
        // Try to find Chrome in common locations
        const chromePaths = [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          process.env.CHROME_EXECUTABLE_PATH,
        ].filter(Boolean);

        let executablePath = null;
        for (const path of chromePaths) {
          try {
            const fs = await import("fs");
            if (fs.existsSync(path)) {
              executablePath = path;
              break;
            }
          } catch (e) {
            // Continue to next path
          }
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
          if (text) {
            details.push(text);
          }
        });

        // Extract seller/agency
        const sellerElement = box.querySelector(".property-btn span");
        const seller = sellerElement
          ? sellerElement.textContent.trim()
          : "No seller info";

        // Extract image
        const imgElement = box.querySelector('img[src*="nepremicnine.net"]');
        const image = imgElement ? imgElement.src : "No image";

        properties.push({
          id: index + 1,
          title: title,
          price: price,
          link: link,
          description: description,
          propertyType: propertyType,
          details: details,
          seller: seller,
          image: image,
          scrapedAt: new Date().toISOString(),
        });
      });

      return properties;
    });

    await browser.close();

    // Return the properties as JSON
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        count: properties.length,
        properties: properties,
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
