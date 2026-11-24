"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Info } from "@phosphor-icons/react/dist/ssr";

const MAX_WIDTH = 270;
const GAP = 8;

/**
 * An ⓘ next to a label, with its explanation in a small dark tooltip — so a
 * settings page shows its fields, not paragraphs of help. Opens on hover and
 * keyboard focus; a tap pins it open on phones (no hover there) until the next
 * tap, a tap elsewhere or Escape. Positioned against the viewport, so a card's
 * edge never clips it.
 */
export function InfoTip({
  label,
  icon = <Info size={16} />,
  className = "text-text-faint hover:text-text aria-expanded:text-text",
  children,
}: {
  label: string;
  /** Replaces the ⓘ, e.g. a warning sign. */
  icon?: ReactNode;
  /** The trigger's colors. */
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const open = hovered || focused || pinned;

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !tipRef.current) return;
    const anchor = buttonRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    const left = Math.min(
      Math.max(GAP, anchor.left + anchor.width / 2 - 20),
      window.innerWidth - tip.width - GAP,
    );
    const below = anchor.bottom + GAP;
    const top =
      below + tip.height > window.innerHeight - GAP ? anchor.top - tip.height - GAP : below;
    setPosition({ left, top });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function close() {
      setPinned(false);
      setHovered(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (!buttonRef.current?.contains(e.target as Node)) close();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        close();
        buttonRef.current?.blur();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setPinned(false);
        }}
        // Inside a clickable row, a tap on the tip must not also open the row.
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (pinned) e.currentTarget.blur();
          setPinned(!pinned);
        }}
        className={`inline-flex size-5.5 shrink-0 items-center justify-center rounded-md outline-none transition-colors hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary/40 ${className}`}
      >
        {icon}
      </button>
      {open && (
        <span
          ref={tipRef}
          id={id}
          role="tooltip"
          style={{
            maxWidth: MAX_WIDTH,
            left: position?.left ?? -9999,
            top: position?.top ?? -9999,
          }}
          className="pointer-events-none fixed z-60 rounded-[10px] bg-popover border border-border-strong px-2.5 py-2 text-left text-[12px] leading-relaxed font-normal text-white"
        >
          {children}
        </span>
      )}
    </>
  );
}
