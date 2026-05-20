import React from "react";
import ReactDOM from "react-dom/client";
import "@usace/groundwork/groundwork.css";
import "leaflet/dist/leaflet.css";
import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
