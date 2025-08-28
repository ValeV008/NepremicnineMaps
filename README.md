## NepremicnineMaps

Interactive map viewer for listings scraped from nepremicnine.net using Netlify Functions and Puppeteer.

### Features

- Scrapes listings server-side from a nepremicnine.net results URL
- Extracts: title, town, price, link, type, image, url
- Geocodes towns via OpenStreetMap Nominatim (separate function)
- Displays markers on a Leaflet map with a popup for each listing
- Blocks common ad/analytics hosts during scraping to speed up loads

### Tech Stack

- Frontend: React, Leaflet (react-leaflet)
- Serverless: Netlify Functions
- Scraper: Puppeteer (local) or ZenRows remote browser (serverless)

### Requirements

- Node.js 22 (set via netlify.toml)
- Netlify CLI (for local dev): `npm i -g netlify-cli`

### Environment Variables

Create a `.env` file in the project root (not committed). The scraper reads these via `dotenv`.

- ZENROW_URL: WebSocket endpoint to a ZenRows browser session (recommended for Netlify/serverless)
  - Example: `wss://<your-zenrows-endpoint>`
- CHROME_EXECUTABLE_PATH: Path to local Chrome/Chromium (used when running locally without ZenRows)
  - Example (Windows): `C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe`
- NOMINATIM_USER_AGENT (optional): Custom UA for Nominatim requests
- NOMINATIM_CONTACT_EMAIL (optional): Contact email for Nominatim

Notes:

- On Netlify, prefer setting `ZENROW_URL` as an environment variable in the site settings.
- When `CHROME_EXECUTABLE_PATH` is absent, the function assumes serverless/remote browser mode.

### Getting Started (Local)

1. Install dependencies

```bash
npm install
```

2. Create `.env` and set either `ZENROW_URL` or `CHROME_EXECUTABLE_PATH` as described above

3. Start Netlify dev (proxies functions and serves React app)

```bash
netlify dev
```

App: `http://localhost:8888`

### Usage

In the app UI, paste a nepremicnine.net search URL and click Search. The flow:

1. Client calls `/.netlify/functions/getProperties?url=<encoded listings url>`
2. Function launches browser, loads page, waits for listings, scrapes the fields
3. Client calls `/.netlify/functions/getPropsLocation` with scraped items to geocode towns
4. Map renders markers; popup shows Title, Type, Price, Image, and links to the listing

### Netlify Functions

#### getProperties

Path: `netlify/functions/getProperties.js`

Input:

- GET with query param `url` (required): a nepremicnine.net result page

Output:

```json
{
  "success": true,
  "properties": [
    {
      "id": 1,
      "title": "…",
      "town": "…",
      "price": "…",
      "link": "…",
      "type": "…",
      "image": "…",
      "url": "…"
    }
  ]
}
```

#### getPropsLocation

Path: `netlify/functions/getPropsLocation.js`

Input:

- POST body: `{ properties: Array<{ town: string, ... }> }`

Output:

```json
{
  "success": true,
  "properties": [
    {
      "town": "Kranj",
      "latitude": 46.24,
      "longitude": 14.36,
      "…": "other fields from getProperties"
    }
  ]
}
```

### Cloudflare Challenge Considerations

- The nepremicnine.net site can show Cloudflare Turnstile/challenges. The function keeps an explicit `waitForSelector(".property-box")` to avoid relying solely on network idleness.

### Development Tips

- If local Chrome is used, ensure `CHROME_EXECUTABLE_PATH` is correct
- If using ZenRows, ensure `ZENROW_URL` is valid and reachable
- Logs from functions are visible in the Netlify dev console and production logs

### Deploy

Push to your connected repository; Netlify will build and deploy. Set environment variables (`ZENROW_URL`, optional Nominatim vars) in the site settings.

### License

MIT
