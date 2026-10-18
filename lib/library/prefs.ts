"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Weergavevoorkeuren per browser (kolommen, breedtes, dichtheid). Alleen gemak: als
 * localStorage niet werkt, gelden de standaardwaarden.
 */
const PREFIX = "referentie:pref:";
const EVENT = "referentie-pref";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** Geparste waarden per ruwe string, zodat een voorkeur steeds hetzelfde object teruggeeft. */
const parsed = new Map<string, unknown>();

function parse(raw: string): unknown {
  if (!parsed.has(raw)) {
    try {
      parsed.set(raw, JSON.parse(raw));
    } catch {
      parsed.set(raw, undefined);
    }
  }
  return parsed.get(raw);
}

/** Geef als `fallback` een constante mee (geen nieuwe array of object per render). */
export function usePref<T>(key: string, fallback: T): [T, (value: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const value = raw === null ? fallback : ((parse(raw) as T | undefined) ?? fallback);

  const set = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(next));
      } catch {
        /* privévenster of geblokkeerde opslag */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return [value, set];
}
