import dotenv from "dotenv";

dotenv.config();

// Debug helpers
const now = () => Date.now();
const dur = (t0) => `${now() - t0}ms`;

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
export async function geocodeTown(townRaw, log) {
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

/**
 * Given a list of properties with a `town` field, geocode unique towns
 * and attach `latitude`/`longitude` to each property. Returns a new array.
 */
export async function geocodeTownsAndAttach(properties, log) {
  const tGeo = now();
  const uniqueTowns = [
    ...new Set(
      (properties || [])
        .map((p) => (p.town || "").trim())
        .filter((t) => t && t !== "No town")
    ),
  ];
  log(`geocoding: uniqueTowns=${uniqueTowns.length}`);

  const townCoordMap = {};
  const chunkSize = 5;
  for (let i = 0; i < uniqueTowns.length; i += chunkSize) {
    const chunk = uniqueTowns.slice(i, i + chunkSize);
    log(`geocoding: chunk [${i}..${i + chunk.length - 1}] -> ${JSON.stringify(chunk)}`);
    const results = await Promise.all(chunk.map((t) => geocodeTown(t, log)));
    chunk.forEach((town, idx) => {
      townCoordMap[town] = results[idx];
    });
  }
  log(`geocoding: done in ${dur(tGeo)}`);

  const tMap = now();
  const propertiesWithCoords = (properties || []).map((p) => {
    const coords = townCoordMap[(p.town || "").trim()] || {};
    return {
      ...p,
      latitude: coords.lat ?? null,
      longitude: coords.lon ?? null,
    };
  });
  log(`map props+coords: count=${propertiesWithCoords.length} in ${dur(tMap)}`);
  return propertiesWithCoords;
}

/**
 * Netlify Function handler to geocode.
 * Accepts only POST with JSON body: { properties: Array<{ town: string, ... }> }
 */
export const handler = async (event) => {
  const log = (msg) => console.log(`${msg}`);

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ success: false, error: "Method not allowed" }),
      };
    }

    const body = event.body ? JSON.parse(event.body) : {};
    const { properties } = body || {};
    if (!Array.isArray(properties)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: "Provide 'properties' array in request",
        }),
      };
    }

    const out = await geocodeTownsAndAttach(properties, log);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, properties: out }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        error: err?.message || "Failed to geocode",
      }),
    };
  }
};
