import { useEffect } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { showToast } from "../../core/toast/toastQueue";
import { useSettings } from "../../core/settings/useSettings";
import type { Brief } from "./sysmonBridge";

const POLL_MS = 5000;
/** CPU/RAM must stay at or above this for 30 s (the backend's sustained window). */
const HIGH = 90;
/** ...and drop below this before it can alert again. */
const RESET = 75;

/** Toasts for a CPU or memory that stays maxed out, and for a low battery. Notch window only. */
export function useSystemAlerts() {
  const { systemAlerts, batteryLowPercent } = useSettings();

  useEffect(() => {
    if (!systemAlerts || !isTauri()) return;
    let cpuAlerted = false;
    let ramAlerted = false;
    let batteryAlerted = false;

    const check = async () => {
      const b = await invoke<Brief>("sysmon_brief").catch(() => null);
      if (!b) return;

      if (!cpuAlerted && b.cpuSustained !== null && b.cpuSustained >= HIGH) {
        cpuAlerted = true;
        showToast({ title: "CPU hampir penuh", body: "Di atas 90% selama 30 detik. Cek tab Sistem.", durationMs: 6000 });
      } else if (b.current.cpu < RESET) {
        cpuAlerted = false;
      }

      if (!ramAlerted && b.ramSustained !== null && b.ramSustained >= HIGH) {
        ramAlerted = true;
        showToast({ title: "Memori hampir penuh", body: "Di atas 90% selama 30 detik. Cek tab Sistem.", durationMs: 6000 });
      } else if (b.current.ram < RESET) {
        ramAlerted = false;
      }

      const battery = b.battery;
      if (battery) {
        const draining = !battery.plugged && !battery.charging;
        if (!batteryAlerted && draining && battery.percent <= batteryLowPercent) {
          batteryAlerted = true;
          showToast({ title: `Baterai tinggal ${battery.percent}%`, body: "Sambungkan charger.", durationMs: 6000 });
        } else if (!draining || battery.percent > batteryLowPercent + 5) {
          batteryAlerted = false;
        }
      }
    };

    check();
    const t = setInterval(check, POLL_MS);
    return () => clearInterval(t);
  }, [systemAlerts, batteryLowPercent]);
}
