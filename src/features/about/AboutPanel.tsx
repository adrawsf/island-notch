import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import type { TabPanelProps } from "../../app/tabs/types";

export default function AboutPanel(_props: TabPanelProps) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    if (isTauri()) getVersion().then(setVersion).catch(() => setVersion(null));
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <span className="text-lg font-semibold">Island Notch</span>
      <span className="text-xs text-notch-muted">{version ? `Versi ${version}` : "Mode browser"}</span>
    </div>
  );
}
