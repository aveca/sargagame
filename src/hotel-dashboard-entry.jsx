import React from "react";
import { createRoot } from "react-dom/client";
import HotelDashboard from "./HotelDashboard.jsx";

const root = document.getElementById("hotel-root");
if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <HotelDashboard />
    </React.StrictMode>
  );
}
