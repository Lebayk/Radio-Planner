import React, { useState } from 'react';
import { MarginChip, Spinner } from './ui.jsx';
import Verdict from './Verdict.jsx';
import { assessLink } from '../lib/radio.js';
import { useI18n } from '../lib/i18n.js';

const clearanceCell = (c) => {
  const pct = c * 100;
  const cls = pct >= 60 ? 'text-emerald-300' : pct >= 0 ? 'text-amber-300' : 'text-rose-300';
  return <span className={`font-mono ${cls}`}>{pct.toFixed(0)} %</span>;
};

export default function ResultsTable({ rows, roads, roadsBusy, selectedIndex, onSelect, onLocate, desiredMargin }) {
  const { t, lang } = useI18n();
  const [expanded, setExpanded] = useState(false);
  if (!rows?.length) return null;
  const shown = expanded ? rows.slice(0, 25) : rows.slice(0, 5);

  const fmtRoad = (r) => {
    if (r === undefined) return '...';
    if (r === null) return '-';
    return r.dist < 1000 ? `${Math.round(r.dist)} m` : `${(r.dist / 1000).toFixed(1)} km`;
  };

  return (
    <div>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="px-1.5 py-2 font-medium">{t('results.col.n')}</th>
              <th className="px-1.5 py-2 font-medium">{t('results.col.verdict')}</th>
              <th className="px-1.5 py-2 font-medium">{t('results.col.coords')}</th>
              <th className="px-1.5 py-2 text-right font-medium">{t('results.col.alt')}</th>
              <th className="px-1.5 py-2 text-right font-medium">{t('results.col.mast')}</th>
              <th className="px-1.5 py-2 text-right font-medium">{t('results.col.hop1')}</th>
              <th className="px-1.5 py-2 text-right font-medium">{t('results.col.hop2')}</th>
              <th className="px-1.5 py-2 text-right font-medium">{t('results.col.overall')}</th>
              <th className="px-1.5 py-2 text-right font-medium">{t('results.col.fresnel')}</th>
              <th className="px-1.5 py-2 text-right font-medium">{t('results.col.road')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const active = i === selectedIndex;
              // Le classement se fait sur la marge penalisee, pas sur la marge
              // brute : sans cette explication l ordre des lignes parait
              // arbitraire quand deux sites affichent la meme marge.
              const penalty = r.best.margin - r.best.score;
              const v = assessLink({
                margin: r.best.margin,
                margin95: r.best.margin95,
                clearance: Math.min(r.best.c1, r.best.c2),
                desiredMargin,
                foliage: r.best.foliage,
                lang,
              });
              const title = t('results.rowTitle', {
                score: r.best.score.toFixed(1),
                penalty:
                  penalty > 0.05
                    ? t('results.rowTitle.penalty', { margin: r.best.margin.toFixed(1), penalty: penalty.toFixed(1) })
                    : t('results.rowTitle.noPenalty'),
              });
              return (
                <tr
                  key={`${r.lat}-${r.lon}`}
                  onClick={() => onSelect(i)}
                  title={title}
                  className={`cursor-pointer border-t border-ink-500/50 transition ${
                    active ? 'bg-sky-500/10' : 'hover:bg-ink-600/50'
                  }`}
                >
                  <td className="px-1.5 py-2">
                    <span
                      className={`inline-grid h-5 w-5 place-items-center rounded-md font-mono text-[10px] font-semibold ${
                        active ? 'bg-sky-500 text-white' : 'bg-ink-600 text-zinc-400'
                      }`}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-1.5 py-2">
                    <Verdict verdict={v} compact />
                  </td>
                  <td className="px-1.5 py-2">
                    <button
                      type="button"
                      className="font-mono text-[11px] text-zinc-300 underline-offset-2 hover:text-sky-300 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLocate(r);
                      }}
                      title={t('results.centerMap')}
                    >
                      {r.lat.toFixed(5)}, {r.lon.toFixed(5)}
                    </button>
                  </td>
                  <td className="px-1.5 py-2 text-right font-mono text-zinc-400">{r.elev.toFixed(0)} m</td>
                  <td className="px-1.5 py-2 text-right font-mono text-zinc-400">{r.best.h} m</td>
                  <td className="px-1.5 py-2 text-right">
                    <MarginChip value={r.best.m1} />
                  </td>
                  <td className="px-1.5 py-2 text-right">
                    <MarginChip value={r.best.m2} />
                  </td>
                  <td className="px-1.5 py-2 text-right">
                    <MarginChip value={r.best.margin} />
                  </td>
                  <td className="px-1.5 py-2 text-right">{clearanceCell(Math.min(r.best.c1, r.best.c2))}</td>
                  <td className="px-1.5 py-2 text-right font-mono text-zinc-400">
                    {roadsBusy && roads?.[i] === undefined ? (
                      <Spinner className="ml-auto h-3 w-3 text-zinc-600" />
                    ) : (
                      fmtRoad(roads?.[i])
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500">
        <span>{t('results.footer')}</span>
        {rows.length > 5 && (
          <button type="button" className="shrink-0 text-sky-400 hover:text-sky-300" onClick={() => setExpanded((v) => !v)}>
            {expanded ? t('results.seeLess') : t('results.seeMore', { n: Math.min(25, rows.length) })}
          </button>
        )}
      </div>
    </div>
  );
}
