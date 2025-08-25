import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet-defaulticon-compatibility";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.webpack.css";
import "leaflet/dist/leaflet.css";

export default function App() {
  const metersToLat = (m) => m / 111_320;
  const metersToLng = (m, lat) => m / (111_320 * Math.cos((lat * Math.PI) / 180));

  function groupByCoord(properties) {
    const map = new Map();
    for (const p of properties) {
      const key = `${p.latitude},${p.longitude}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.values()];
  }

  function fanOutGroup(group, rMeters = 100) {
    if (group.length === 1) return group;
    const { latitude: lat, longitude: lng } = group[0];
    return group.map((p, i) => {
      const angle = (2 * Math.PI * i) / group.length;
      return {
        ...p,
        latitude: lat + metersToLat(rMeters * Math.cos(angle)),
        longitude: lng + metersToLng(rMeters * Math.sin(angle), lat),
      };
    });
  }

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchUrl, setSearchUrl] = useState("");

  const fetchProperties = async (urlParam) => {
    setLoading(true);
    setError(null);

    const query = urlParam ? `?url=${encodeURIComponent(urlParam)}` : "";
    try {
      const res = await fetch(`/.netlify/functions/getProperties${query}`);
      const data = await res.json();
      if (!data.success) {
        setError(data.message || "Failed to load properties");
        setLoading(false);
        return;
      }

      const rawProps = data.properties || [];

      // Enrich properties with geolocation via separate function
      const geoRes = await fetch(`/.netlify/functions/getPropsLocation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ properties: rawProps }),
      });
      const geoData = await geoRes.json();
      if (geoData.success) {
        setProperties(geoData.properties || []);
      } else {
        // If geolocation fails, fall back to raw properties
        setProperties(rawProps);
      }
    } catch (err) {
      setError(err.message || "Failed to fetch properties");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (searchUrl.trim()) {
      fetchProperties(searchUrl.trim());
    }
  };

  return (
    <div style={{ height: "100vh", position: "relative" }}>
      {/* Search Bar */}
      <div
        style={{
          position: "absolute",
          top: "10px",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 1000,
          background: "white",
          padding: "8px",
          borderRadius: "6px",
          boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          display: "flex",
          gap: "8px",
        }}
      >
        <input
          type="text"
          placeholder="Enter nepremicnine.net search URL"
          value={searchUrl}
          onChange={(e) => setSearchUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSearch();
            }
          }}
          style={{
            padding: "6px",
            border: "1px solid #ccc",
            borderRadius: "4px",
            minWidth: "300px",
          }}
        />
        <button
          onClick={handleSearch}
          style={{
            padding: "6px 12px",
            border: "none",
            borderRadius: "4px",
            backgroundColor: "#1976d2",
            color: "white",
            cursor: "pointer",
          }}
        >
          Search
        </button>
      </div>

      {/* Map */}
      {loading ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
            fontSize: "24px",
            fontWeight: "bold",
            color: "#333",
          }}
        >
          Loading properties...
        </div>
      ) : error ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
            fontSize: "18px",
            color: "#d32f2f",
            textAlign: "center",
            padding: "20px",
          }}
        >
          <div>
            <h2>Error Loading Properties</h2>
            <p>{error}</p>
            <button
              onClick={() => fetchProperties()}
              style={{
                padding: "10px 20px",
                fontSize: "16px",
                backgroundColor: "#1976d2",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        </div>
      ) : (
        <MapContainer center={[46.1512, 14.9955]} zoom={8} style={{ height: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {groupByCoord(properties)
            .flatMap((group) => fanOutGroup(group))
            .map((property) => (
              <Marker
                key={property.id}
                position={[
                  property.latitude ? property.latitude : 46.1512,
                  property.longitude ? property.longitude : 14.9955,
                ]}
              >
                <Popup>
                  <a
                    href={property.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textDecoration: "none", color: "inherit" }}
                  >
                    <b>{property.title}</b>
                    <br />
                    {property.price}
                    {property.image && (
                      <div style={{ marginTop: "8px" }}>
                        <img
                          src={property.image}
                          alt={property.title}
                          style={{
                            maxWidth: "200px",
                            maxHeight: "120px",
                            borderRadius: "6px",
                          }}
                        />
                      </div>
                    )}
                  </a>
                </Popup>
              </Marker>
            ))}
        </MapContainer>
      )}
    </div>
  );
}
