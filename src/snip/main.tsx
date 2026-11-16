import React from "react";
import ReactDOM from "react-dom/client";
import { SnipApp } from "./SnipApp";
import "../styles/index.css";

// Entry for the OCR overlay window (snip.html).
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SnipApp />
  </React.StrictMode>
);
