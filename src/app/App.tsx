import { NotchShell } from "./NotchShell";
import { useShellSync } from "./useShellSync";
import { TooltipLayer } from "../shared/ui/TooltipLayer";
import { startAmbienceController } from "../features/pomodoro/ambience/ambience";
import { startChimeController } from "../features/home/chime";

// Focus ambience follows the pomodoro timer, which lives in this window.
startAmbienceController();
// The hourly chime plays from here too (one window, so it never doubles up).
startChimeController();

export function App() {
  useShellSync();
  return (
    <>
      <NotchShell />
      <TooltipLayer />
    </>
  );
}
