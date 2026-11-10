import React from "react";
import ReactDOM from "react-dom/client";
import { loadSettings } from "../core/settings/settings";
import { SettingsApp } from "./SettingsApp";
import { TooltipLayer } from "../shared/ui/TooltipLayer";
import "../styles/index.css";

// Entry for the settings window (settings.html). Settings are loaded first so
// the theme and every control are right on the first frame.
loadSettings().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <SettingsApp />
      <TooltipLayer />
    </React.StrictMode>
  );
});
