import { handler } from "./netlify/functions/getProperties.js";

// Test the function
async function testFunction() {
  console.log("Testing getProperties serverless function...");

  try {
    const result = await handler({ httpMethod: "GET" }, {});

    console.log("Status Code:", result.statusCode);
    console.log("Headers:", result.headers);

    const body = JSON.parse(result.body);
    console.log("Success:", body.success);
    console.log("Property Count:", body.count);
    console.log("Scraped At:", body.scrapedAt);

    if (body.properties && body.properties.length > 0) {
      console.log("\nFirst Property:");
      console.log("- Title:", body.properties[0].title);
      console.log("- Price:", body.properties[0].price);
      console.log("- Type:", body.properties[0].propertyType);
      console.log("- Seller:", body.properties[0].seller);
    }
  } catch (error) {
    console.error("Error testing function:", error);
  }
}

testFunction();
