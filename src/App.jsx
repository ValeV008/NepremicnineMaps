import React from "react";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet-defaulticon-compatibility";
import "leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.webpack.css";
import "leaflet/dist/leaflet.css";

export default function App() {
  // Helpers to offset markers a small distance (in meters → degrees)
  const metersToLat = (m) => m / 111_320;
  const metersToLng = (m, lat) => m / (111_320 * Math.cos((lat * Math.PI) / 180));

  // Group properties by identical coordinates
  function groupByCoord(properties) {
    const map = new Map();
    for (const p of properties) {
      const key = `${p.latitude},${p.longitude}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.values()];
  }

  // Spread duplicates in a circle
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch("/.netlify/functions/getProperties")
      .then((res) => {
        return res.json();
      })
      .then((data) => {
        if (data.success) {
          setProperties(data.properties);
        } else {
          setError(data.message || "Failed to load properties");
        }
      })
      .catch((err) => {
        setError(err.message || "Failed to fetch properties");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Show loading state
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          fontSize: "24px",
          fontWeight: "bold",
          color: "#333",
        }}
      >
        Loading properties...
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
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
            onClick={() => window.location.reload()}
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
    );
  }

  return (
    <MapContainer center={[46.1512, 14.9955]} zoom={8} style={{ height: "100vh" }}>
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
  );
}
