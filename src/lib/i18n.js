// Couche React du systeme de traduction FR/EN : contexte, hook, et les deux
// fonctions de rendu `t()` / `tn()`. Le dictionnaire lui-meme et `tFor()` (la
// version sans contexte React, utilisee par les modules purs comme radio.js
// qui sont aussi charges dans le Web Worker) vivent dans `strings.js` - les
// separer evite d embarquer React dans le bundle du worker.
//
// `t(key, vars)` retourne une chaine simple, avec interpolation `{{var}}`.
// `tn(key, vars)` fait la meme chose mais retourne un tableau de noeuds React :
// les valeurs de `vars` peuvent alors etre du JSX (ex. un nombre en gras), ce
// qui evite de casser la mise en forme des phrases composees d une langue a
// l autre (ordre des mots different entre francais et anglais).

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { detectLang, localeFor, tFor } from './strings.js';

export { detectLang, localeFor, tFor };

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectLang);

  const setLang = useCallback((l) => {
    setLangState(l);
    try {
      localStorage.setItem('relay-lang', l);
    } catch {
      /* localStorage indisponible : la preference ne survivra pas au rechargement. */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((key, vars) => tFor(lang, key, vars), [lang]);

  const tn = useCallback(
    (key, vars) => {
      const template = tFor(lang, key);
      const parts = template.split(/(\{\{\w+\}\})/g);
      return parts.map((part, i) => {
        const m = part.match(/^\{\{(\w+)\}\}$/);
        if (m) return React.createElement(React.Fragment, { key: i }, vars?.[m[1]]);
        return part;
      });
    },
    [lang]
  );

  const value = useMemo(
    () => ({ lang, setLang, t, tn, locale: localeFor(lang) }),
    [lang, setLang, t, tn]
  );

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
