import { NotchShell } from "./NotchShell";
import { useShellSync } from "./useShellSync";

export function App() {
  useShellSync();
  return <NotchShell />;
}
