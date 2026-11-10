import React from "react";
import ReactDOM from "react-dom/client";
import { loadSettings } from "../core/settings/settings";
import { TeleprompterReader } from "./TeleprompterReader";
import { TooltipLayer } from "../shared/ui/TooltipLayer";
import "../styles/index.css";

// Entry for the teleprompter window (teleprompter.html).
loadSettings().finally(() => {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <TeleprompterReader />
      <TooltipLayer />
    </React.StrictMode>
  );
});
