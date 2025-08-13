import puppeteer from "puppeteer";
import fs from "fs";

(async () => {
  const url =
    "https://www.nepremicnine.net/oglasi-oddaja/gorenjska/kranj/stanovanje/1-sobno,15-sobno,2-sobno,25-sobno,3-sobno,35-sobno,4-sobno,45-sobno,5-in-vecsobno,drugo-36,apartma/cena-do-600-eur-na-mesec/?nadst[0]=vsa&nadst[1]=vsa";

  // Launch browser
  const browser = await puppeteer.launch({
    headless: false, // Set to true for production
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  // Set user agent to look more like a real browser
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  // Set viewport
  await page.setViewport({ width: 1920, height: 1080 });

  console.log("Navigating to page...");
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
        index: index + 1,
        title: title,
        price: price,
        link: link,
        description: description,
        propertyType: propertyType,
        details: details,
        seller: seller,
        image: image,
      });
    });

    return properties;
  });

  console.log(`Found ${properties.length} properties`);

  if (properties.length > 0) {
    console.log("\n=== PROPERTY DETAILS ===");
    properties.forEach((prop) => {
      console.log(`\n${prop.index}. ${prop.title}`);
      console.log(`   Price: ${prop.price}`);
      console.log(`   Type: ${prop.propertyType}`);
      console.log(`   Seller: ${prop.seller}`);
      console.log(`   Description: ${prop.description}`);
      console.log(`   Details: ${prop.details.join(", ")}`);
      console.log(`   Link: ${prop.link}`);
      console.log(`   Image: ${prop.image}`);
    });

    // Save to JSON file for easier inspection
    fs.writeFileSync("properties-final.json", JSON.stringify(properties, null, 2));
    console.log("\n✅ Properties saved to properties-final.json");

    // Also save a summary
    const summary = properties.map((p) => ({
      title: p.title,
      price: p.price,
      type: p.propertyType,
      seller: p.seller,
      link: p.link,
    }));

    fs.writeFileSync("properties-summary.json", JSON.stringify(summary, null, 2));
    console.log("✅ Summary saved to properties-summary.json");
  } else {
    console.log("❌ No properties found");
  }

  await browser.close();
})();
