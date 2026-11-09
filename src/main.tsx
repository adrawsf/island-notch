import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { loadSettings } from "./core/settings/settings";
import "./styles/index.css";

// Settings are loaded before the first render so no component ever sees a
// half-initialised value.
loadSettings().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
