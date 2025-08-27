// src/hooks/useLang.ts
import { useEffect, useState } from "react";
import type { Lang } from "@/i18n";

const KEY = "lang";

export function useLang(defaultLang: Lang = "en") {
  const get = () => {
    const saved = localStorage.getItem(KEY);
    if (saved === "en" || saved === "es") return saved as Lang;
    return defaultLang;
  };

  const [lang, setLang] = useState<Lang>(defaultLang);

  useEffect(() => {
    // hidrata tras montar (evita server/client mismatch en deploy)
    setLang(get());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (lang) localStorage.setItem(KEY, lang);
  }, [lang]);

  return { lang, setLang };
}
