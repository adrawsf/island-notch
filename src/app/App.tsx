import { NotchShell } from "./NotchShell";
import { useShellSync } from "./useShellSync";
import { TooltipLayer } from "../shared/ui/TooltipLayer";
import { startAmbienceController } from "../features/pomodoro/ambience/ambience";

// Focus ambience follows the pomodoro timer, which lives in this window.
startAmbienceController();

export function App() {
  useShellSync();
  return (
    <>
      <NotchShell />
      <TooltipLayer />
    </>
  );
}
