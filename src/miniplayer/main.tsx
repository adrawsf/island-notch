import React from "react";
import ReactDOM from "react-dom/client";
import { loadSettings } from "../core/settings/settings";
import { MiniPlayer } from "./MiniPlayer";
import { TooltipLayer } from "../shared/ui/TooltipLayer";
import "../styles/index.css";

// Entry for the mini player window (miniplayer.html). Settings are loaded
// first so the theme is right on the first frame.
loadSettings().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <MiniPlayer />
      <TooltipLayer />
    </React.StrictMode>
  );
});
