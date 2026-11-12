import { useCallback, useEffect, useRef, useState } from "react";
import { useMedia } from "../../media/useMedia";
import { useNow } from "../../../shared/useNow";
import type { PetMood } from "./PixelCat";

const HAPPY_MS = 2600;
/** The cat sleeps from 23.00 to 06.00, unless music wakes it. */
const SLEEP_FROM = 23;
const SLEEP_UNTIL = 6;

/** The cat's mood from the clock and the music, plus a `pet()` to make it happy for a moment. */
export function usePetMood(): { mood: PetMood; pet: () => void } {
  const media = useMedia();
  const now = useNow(60_000);
  const [happy, setHappy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pet = useCallback(() => {
    setHappy(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHappy(false), HAPPY_MS);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const hour = now.getHours();
  const night = hour >= SLEEP_FROM || hour < SLEEP_UNTIL;
  const mood: PetMood = happy ? "happy" : media.active && media.isPlaying ? "dance" : night ? "sleep" : "idle";
  return { mood, pet };
}
