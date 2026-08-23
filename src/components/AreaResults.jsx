import React, { useState } from 'react';
import { useI18n } from '../lib/i18n.js';

const pct = (f) => `${(f * 100).toFixed(1)} %`;

/** Classement des emplacements par part de zone couverte. */
export default function AreaResults({ result, desiredMargin, onLocate }) {
  const { t, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const nf = (v) => Math.round(v ?? 0).toLocaleString(locale);
  const big = (v) =>
    v >= 1e12 ? `${(v / 1e12).toFixed(1)}e12` : v >= 1e9 ? `${(v / 1e9).toFixed(1)}e9` : nf(v);
  if (!result?.top?.length) return null;

  const rows = expanded ? result.top.slice(0, 30) : result.top.slice(0, 8);
  const best = result.stats?.best;

  return (
    <div className="space-y-3">
      {best && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5">
          <p className="text-[13px] leading-relaxed text-emerald-200">
            {t('area.best', { pct: (best.fraction * 100).toFixed(1), km: best.areaKm2.toFixed(1) })}
          </p>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-zinc-500">
        {t('area.resultsHint', { db: desiredMargin })} {t('area.exactNote')}
      </p>

      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[460px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="px-1.5 py-2 font-medium">{t('area.col.rank')}</th>
              <th className="px-1.5 py-2 font-medium">{t('area.col.coords')}</th>
              <th className="px-1.5 py-2 text-right font-medium">{t('area.col.elev')}</th>
              <th className="px-1.5 py-2 text-right font-medium">{t('area.col.covered')}</th>
              <th className="px-1.5 py-2 text-right font-medium">{t('area.col.areaKm2')}</th>
              <th className="px-1.5 py-2 text-right font-medium">{t('area.col.margin')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.lat}-${r.lon}`} className="border-t border-ink-500/50 transition hover:bg-ink-600/40">
                <td className="px-1.5 py-2">
                  <span
                    className={`inline-grid h-5 w-5 place-items-center rounded-md font-mono text-[10px] font-semibold ${
                      i === 0 ? 'bg-emerald-500 text-white' : 'bg-ink-600 text-zinc-400'
                    }`}
                  >
                    {i + 1}
                  </span>
                </td>
                <td className="px-1.5 py-2">
                  <button
                    type="button"
                    className="font-mono text-[11px] text-zinc-300 underline-offset-2 hover:text-sky-300 hover:underline"
                    onClick={() => onLocate?.(r)}
                  >
                    {r.lat.toFixed(5)}, {r.lon.toFixed(5)}
                  </button>
                </td>
                <td className="px-1.5 py-2 text-right font-mono text-zinc-400">{r.elev.toFixed(0)} m</td>
                <td className="px-1.5 py-2 text-right">
                  {/* La barre rend l ecart entre emplacements lisible d un coup
                      d oeil, ce qu une colonne de pourcentages ne fait pas. */}
                  <span className="flex items-center justify-end gap-1.5">
                    <span className="h-1.5 w-12 overflow-hidden rounded-full bg-ink-600">
                      <span
                        className="block h-full rounded-full bg-emerald-500"
                        style={{ width: `${Math.round(r.fraction * 100)}%` }}
                      />
                    </span>
                    <span className="font-mono text-zinc-200">{pct(r.fraction)}</span>
                  </span>
                </td>
                <td className="px-1.5 py-2 text-right font-mono text-zinc-400">{r.areaKm2.toFixed(1)} km2</td>
                <td className="px-1.5 py-2 text-right font-mono text-zinc-400">
                  {Number.isFinite(r.meanMargin) ? `${r.meanMargin.toFixed(1)} dB` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.top.length > 8 && (
        <button
          type="button"
          className="text-[11px] text-sky-400 hover:text-sky-300"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? t('results.seeLess') : t('results.seeMore', { n: Math.min(30, result.top.length) })}
        </button>
      )}

      {result.stats && (
        <p className="text-[11px] leading-relaxed text-zinc-600">
          {t('area.stats2', {
            candidates: nf(result.stats.candidates),
            targets: nf(result.stats.targets),
            sweeps: nf(result.stats.sweeps),
            samples: big(result.stats.sweeps * (result.stats.nAz || 0)),
            msSweep: nf(result.stats.msCoarse + result.stats.msRefine),
            exactCandidates: nf(result.stats.exactCandidates),
            exactLinks: big(result.stats.exactLinks),
            msExact: nf(result.stats.msExact),
            brute: big(result.stats.bruteLinks),
          })}
        </p>
      )}
    </div>
  );
}
