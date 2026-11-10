import { Bell } from "lucide-react";
import type { NotchToast } from "../core/toast/toastQueue";

interface NotchToastViewProps {
  toast: NotchToast;
  onDismiss: () => void;
}

/** A toast inside the collapsed notch. Clicking dismisses it. */
export function NotchToastView({ toast, onDismiss }: NotchToastViewProps) {
  return (
    <button
      type="button"
      onClick={onDismiss}
      className="flex min-w-[240px] max-w-[360px] items-center gap-3 py-2.5 pl-2.5 pr-5 text-left"
      aria-label={`Tutup notifikasi: ${toast.title}`}
    >
      <span className="glass-button flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-notch-accent">
        <Bell size={15} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold leading-tight">{toast.title}</span>
        {toast.body && <span className="block truncate text-xs leading-tight text-notch-muted">{toast.body}</span>}
      </span>
    </button>
  );
}
