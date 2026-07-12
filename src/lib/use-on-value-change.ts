"use client";

import { useState } from "react";

/**
 * Runs adjust during render when value differs from the previous render's
 * (React's "adjust state when a prop changes" pattern; an effect-based reset
 * trips react-hooks/set-state-in-effect). Records the new value before
 * calling adjust, so the re-render it triggers can't loop. adjust may only
 * set state owned by the calling component.
 */
export function useOnValueChange<T>(value: T, adjust: (prev: T) => void) {
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    adjust(prev);
  }
}
