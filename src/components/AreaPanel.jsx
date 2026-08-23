import React from 'react';
import { Field, NumberInput, Banner, Spinner } from './ui.jsx';
import { useI18n } from '../lib/i18n.js';
import { zoneMetrics, estimateArea } from '../lib/area.js';

/** Au-dela, le balayage quadratique cesse d etre interactif. */
export const MAX_LINKS = 4_000_000;
const WARN_LINKS = 600_000;

/**
 * Recherche du meilleur emplacement de relais pour couvrir une zone.
 *
 * Le cout est quadratique : emplacements testes x points de test. Il est donc
 * affiche avant de lancer, et bride au-dela d un seuil - un calcul qui gele
 * l onglet pendant dix minutes serait pire qu un refus.
 */
export default function AreaPanel({
  area,
  onChange,
  picking,
  onPickToggle,
  onClear,
  onRun,
  busy,
  progress,
  demEstimate,
  disabled,
}) {
  const { t, locale } = useI18n();
  const set = (patch) => onChange({ ...area, ...patch });
  const zone = area.zone;
  const m = zoneMetrics(zone);
  const est = estimateArea(zone, area.candidateStep, area.testStep);
  const tooHeavy = est.links > MAX_LINKS;
  const heavy = !tooHeavy && est.links > WARN_LINKS;
  const nf = (v) => v.toLocaleString(locale);

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-zinc-500">{t('area.intro')}</p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onPickToggle}
          className={picking ? 'btn border-sky-500 bg-sky-600 text-white' : 'btn-ghost'}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="4" y="4" width="16" height="16" rx="1.5" strokeDasharray="3 2.5" />
          </svg>
          {picking ? t('area.cancel') : zone ? t('area.redefine') : t('area.define')}
        </button>
        {zone && !picking && (
          <button type="button" className="btn-ghost" onClick={onClear}>
            {t('area.clear')}
          </button>
        )}
      </div>

      {picking && <p className="text-[11px] text-sky-300/80">{t('area.pickHint')}</p>}

      <div className="rounded-lg border border-ink-500/70 bg-ink-900/50 px-2.5 py-2 text-[11px] leading-relaxed">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">{t('area.size')}</span>
          <span className="font-mono text-zinc-300">
            {zone
              ? t('area.sizeValue', {
                  w: (m.widthM / 1000).toFixed(2),
                  h: (m.heightM / 1000).toFixed(2),
                  a: m.areaKm2.toFixed(1),
                })
              : t('area.noZone')}
          </span>
        </div>
      </div>

      <Field label={t('area.relayHeight')}>
        <NumberInput value={area.relayHeight} onChange={(v) => set({ relayHeight: v })} min={0} max={120} suffix="m" />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label={t('area.candidateStep')}>
          <NumberInput
            value={area.candidateStep}
            onChange={(v) => set({ candidateStep: v })}
            min={50}
            max={5000}
            step="50"
            suffix="m"
          />
        </Field>
        <Field label={t('area.testStep')}>
          <NumberInput
            value={area.testStep}
            onChange={(v) => set({ testStep: v })}
            min={50}
            max={5000}
            step="50"
            suffix="m"
          />
        </Field>
      </div>
      <p className="-mt-1 text-[11px] leading-snug text-zinc-600">{t('area.candidateStepHint')}</p>

      <Field label={t('area.gridStep')} hint={t('area.testStepHint')}>
        <NumberInput value={area.gridStep} onChange={(v) => set({ gridStep: v })} min={20} max={500} step="10" suffix="m" />
      </Field>

      {zone && (
        <div className="rounded-lg border border-ink-500/70 bg-ink-900/50 px-2.5 py-2 text-[11px] leading-relaxed">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">{t('area.candidates')}</span>
            <span className="font-mono text-zinc-300">{nf(est.candidates)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">{t('area.targets')}</span>
            <span className="font-mono text-zinc-300">{nf(est.targets)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">{t('area.links')}</span>
            <span className={`font-mono ${tooHeavy ? 'text-rose-300' : heavy ? 'text-amber-300' : 'text-zinc-300'}`}>
              {nf(est.links)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-zinc-500">{t('area.demPoints')}</span>
            <span className="font-mono text-zinc-300">
              {demEstimate?.points != null ? nf(demEstimate.points) : '-'}
              {demEstimate?.requests != null ? ` (${nf(demEstimate.requests)} req.)` : ''}
            </span>
          </div>
        </div>
      )}

      {tooHeavy && <Banner tone="error" title={t('area.tooHeavyTitle')}>{t('area.tooHeavyMsg', { n: nf(est.links) })}</Banner>}
      {heavy && <Banner tone="warn">{t('area.heavyWarn', { n: nf(est.links) })}</Banner>}

      <button
        type="button"
        className="btn-primary w-full"
        onClick={onRun}
        disabled={busy || disabled || !zone || tooHeavy}
      >
        {busy ? (
          <>
            <Spinner className="h-3.5 w-3.5" />
            {progress?.total
              ? `${Math.round((progress.done / progress.total) * 100)} %`
              : t('area.running')}
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            {t('area.run')}
          </>
        )}
      </button>

      <p className="text-[11px] leading-relaxed text-zinc-600">{t('area.footer')}</p>
    </div>
  );
}
