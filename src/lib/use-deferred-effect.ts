"use client";

import { useEffect, type DependencyList } from "react";

/**
 * useEffect whose callback runs a tick after commit, so state sets inside it
 * don't trip react-hooks/set-state-in-effect. May return a cleanup function.
 */
export function useDeferredEffect(effect: () => void | (() => void), deps: DependencyList) {
  useEffect(() => {
    let cleanup: void | (() => void);
    const t = setTimeout(() => {
      cleanup = effect();
    }, 0);
    return () => {
      clearTimeout(t);
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
