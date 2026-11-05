import { useEffect, useState, type RefObject } from "react";

// Inactivity affects only fullscreen playback; paused/error states stay operable.
export default function useFullscreenControls(
  shell: RefObject<HTMLDivElement | null>,
  fullscreen: boolean,
  paused: boolean,
  ready: boolean,
  error: string,
) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const element = shell.current;
    setVisible(true);
    if (!element || !fullscreen || paused || !ready || error) return;
    let timer: ReturnType<typeof setTimeout>;
    let keyboard = false;
    let pointerPressed = false;
    function wake(event?: Event) {
      clearTimeout(timer);
      setVisible(true);
      if (event?.type === "keydown") keyboard = true;
      if (event?.type.startsWith("pointer")) keyboard = false;
      if (event?.type === "pointerdown") pointerPressed = true;
      if (event?.type === "pointerup" || event?.type === "pointercancel")
        pointerPressed = false;
      if (
        event?.type === "focusin" &&
        document.activeElement?.matches(":focus-visible")
      )
        keyboard = true;
      timer = setTimeout(() => {
        const controls = element!.querySelector(".player-controls");
        if (
          pointerPressed ||
          controls?.matches(":hover") ||
          (keyboard && controls?.contains(document.activeElement))
        ) {
          wake();
          return;
        }
        setVisible(false);
      }, 2600);
    }
    element.addEventListener("pointermove", wake);
    element.addEventListener("pointerdown", wake);
    element.addEventListener("focusin", wake);
    element.addEventListener("focusout", wake);
    document.addEventListener("keydown", wake);
    document.addEventListener("pointerup", wake);
    document.addEventListener("pointercancel", wake);
    wake();
    return () => {
      clearTimeout(timer);
      element.removeEventListener("pointermove", wake);
      element.removeEventListener("pointerdown", wake);
      element.removeEventListener("focusin", wake);
      element.removeEventListener("focusout", wake);
      document.removeEventListener("keydown", wake);
      document.removeEventListener("pointerup", wake);
      document.removeEventListener("pointercancel", wake);
    };
  }, [shell, fullscreen, paused, ready, error]);
  return !fullscreen || paused || Boolean(error) || !ready || visible;
}
