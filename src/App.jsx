import React from "react";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export default function App() {
  return (
    <div style={{ height: "100vh" }}>
      <MapContainer
        center={[46.1512, 14.9955]}
        zoom={9}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
      </MapContainer>
    </div>
  );
  // const [properties, setProperties] = useState([]);
  // const [loading, setLoading] = useState(true);
  // const [error, setError] = useState(null);

  // useEffect(() => {
  //   setLoading(true);
  //   setError(null);

  //   fetch("/.netlify/functions/getProperties")
  //     .then((res) => res.json())
  //     .then((data) => {
  //       if (data.success) {
  //         setProperties(data.properties);
  //       } else {
  //         setError(data.message || "Failed to load properties");
  //       }
  //     })
  //     .catch((err) => {
  //       setError(err.message || "Failed to fetch properties");
  //     })
  //     .finally(() => {
  //       setLoading(false);
  //     });
  // }, []);

  // // Show loading state
  // if (loading) {
  //   return (
  //     <div
  //       style={{
  //         display: "flex",
  //         justifyContent: "center",
  //         alignItems: "center",
  //         height: "100vh",
  //         fontSize: "24px",
  //         fontWeight: "bold",
  //         color: "#333",
  //       }}
  //     >
  //       Loading properties...
  //     </div>
  //   );
  // }

  // // Show error state
  // if (error) {
  //   return (
  //     <div
  //       style={{
  //         display: "flex",
  //         justifyContent: "center",
  //         alignItems: "center",
  //         height: "100vh",
  //         fontSize: "18px",
  //         color: "#d32f2f",
  //         textAlign: "center",
  //         padding: "20px",
  //       }}
  //     >
  //       <div>
  //         <h2>Error Loading Properties</h2>
  //         <p>{error}</p>
  //         <button
  //           onClick={() => window.location.reload()}
  //           style={{
  //             padding: "10px 20px",
  //             fontSize: "16px",
  //             backgroundColor: "#1976d2",
  //             color: "white",
  //             border: "none",
  //             borderRadius: "4px",
  //             cursor: "pointer",
  //           }}
  //         >
  //           Retry
  //         </button>
  //       </div>
  //     </div>
  //   );
  // }

  // return (
  //   <MapContainer center={[45.0, 15.0]} zoom={6} style={{ height: "100vh" }}>
  //     <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
  //     {properties.map((property) => (
  //       <Marker key={property.id} position={[property.latitude, property.longitude]}>
  //         <Popup>
  //           <b>{property.title}</b>
  //           <br />
  //           {property.price}
  //         </Popup>
  //       </Marker>
  //     ))}
  //   </MapContainer>
  // );
}
