import React from 'react';
import { useI18n } from '../lib/i18n.js';

/**
 * Avertissement sur les limites du modele. Toujours visible sous forme
 * condensee, depliable pour le detail : c est une information de securite,
 * pas une notification a masquer definitivement.
 */
export default function Disclaimer({ open, onToggle }) {
  const { t, tn } = useI18n();
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-100/90">
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-2 text-left">
        <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18.4A2 2 0 0 0 3.5 21.4h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="flex-1">
          <b>{t('disclaimer.title')}</b>{' '}
          {!open && <span className="text-amber-100/70">{t('disclaimer.collapsedHint')}</span>}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5 border-t border-amber-500/25 pt-2 text-amber-100/80">
          <p>
            {tn('disclaimer.p1', {
              veg: <b>{t('disclaimer.vegetation')}</b>,
              bat: <b>{t('disclaimer.buildings')}</b>,
            })}
          </p>
          <p className="pt-1">{t('disclaimer.remain')}</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>{tn('disclaimer.li1', { h: <b>{t('disclaimer.coverHeights')}</b> })}</li>
            <li>{tn('disclaimer.li2', { c: <b>{t('disclaimer.osmCompleteness')}</b> })}</li>
            <li>{tn('disclaimer.li3', { n: <b>{t('disclaimer.rfNoise')}</b> })}</li>
            <li>{tn('disclaimer.li4', { r: <b>{t('disclaimer.groundReflections')}</b> })}</li>
            <li>{tn('disclaimer.li5', { v: <b>{t('disclaimer.timeVariability')}</b> })}</li>
          </ul>
          <p className="pt-1">{tn('disclaimer.footer', { test: <b>{t('disclaimer.groundTest')}</b> })}</p>
        </div>
      )}
    </div>
  );
}
