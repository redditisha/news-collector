"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { TitleMode } from "@/lib/types";

interface Ctx {
  mode: TitleMode;
  setMode: (m: TitleMode) => void;
}

const TitleModeContext = createContext<Ctx>({ mode: "en", setMode: () => {} });

export function useTitleMode() {
  return useContext(TitleModeContext);
}

const STORAGE_KEY = "news_title_mode";

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<TitleMode>("en");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "original") setModeState(stored);
    } catch {
      /* localStorage may be unavailable */
    }
  }, []);

  const setMode = (m: TitleMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  };

  return <TitleModeContext.Provider value={{ mode, setMode }}>{children}</TitleModeContext.Provider>;
}
