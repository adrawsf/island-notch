import { useEffect, useState } from "react";
import { getCompactState, onCompactChange } from "../core/notch/notchBridge";

/** True while a browser sits under the notch (its tab strip would be covered). */
export function useBrowserCompact(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    getCompactState().then(setCompact);
    return onCompactChange(setCompact);
  }, []);
  return compact;
}
