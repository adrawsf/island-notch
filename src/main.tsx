import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { loadSettings } from "./core/settings/settings";
import { ErrorBoundary } from "./shared/ui/ErrorBoundary";
import "./styles/index.css";

const root = document.getElementById("root") as HTMLElement;

/**
 * Last-resort message for failures before React renders anything (the window
 * is transparent, so otherwise the notch would just silently vanish).
 */
function showStartupProblem(message: string) {
  if (root.childElementCount > 0) return;
  root.innerHTML = "";
  const box = document.createElement("div");
  box.style.cssText =
    "margin:8px auto;max-width:560px;padding:10px 14px;border-radius:14px;background:rgba(16,16,20,.94);color:#fff;font:11px/1.4 ui-monospace,monospace;white-space:pre-wrap";
  box.textContent = `Island Notch error\n${message}`;
  root.appendChild(box);
}

window.addEventListener("error", (e) => showStartupProblem(String(e.error?.stack ?? e.message)));
window.addEventListener("unhandledrejection", (e) => showStartupProblem(String(e.reason?.stack ?? e.reason)));
const stuck = setTimeout(() => showStartupProblem("Startup macet: pengaturan tidak selesai dimuat."), 5000);

// Settings are loaded before the first render so no component ever sees a
// half-initialised value.
loadSettings().finally(() => {
  clearTimeout(stuck);
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
});
