import React, { useState } from 'react';
import { MarginChip, Spinner } from './ui.jsx';
import Verdict from './Verdict.jsx';
import { assessLink } from '../lib/radio.js';

const fmtRoad = (r) => {
  if (r === undefined) return '...';
  if (r === null) return '-';
  return r.dist < 1000 ? `${Math.round(r.dist)} m` : `${(r.dist / 1000).toFixed(1)} km`;
};

const clearanceCell = (c) => {
  const pct = c * 100;
  const cls = pct >= 60 ? 'text-emerald-300' : pct >= 0 ? 'text-amber-300' : 'text-rose-300';
  return <span className={`font-mono ${cls}`}>{pct.toFixed(0)} %</span>;
};

export default function ResultsTable({ rows, roads, roadsBusy, selectedIndex, onSelect, onLocate, desiredMargin }) {
  const [expanded, setExpanded] = useState(false);
  if (!rows?.length) return null;
  const shown = expanded ? rows.slice(0, 25) : rows.slice(0, 5);

  return (
    <div>
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="px-1.5 py-2 font-medium">#</th>
              <th className="px-1.5 py-2 font-medium">Verdict</th>
              <th className="px-1.5 py-2 font-medium">Coordonnees</th>
              <th className="px-1.5 py-2 text-right font-medium">Alt.</th>
              <th className="px-1.5 py-2 text-right font-medium">Mat</th>
              <th className="px-1.5 py-2 text-right font-medium">Bond 1</th>
              <th className="px-1.5 py-2 text-right font-medium">Bond 2</th>
              <th className="px-1.5 py-2 text-right font-medium">Globale</th>
              <th className="px-1.5 py-2 text-right font-medium">Fresnel</th>
              <th className="px-1.5 py-2 text-right font-medium">Route</th>
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
              });
              const title =
                `Score de classement : ${r.best.score.toFixed(1)} dB` +
                (penalty > 0.05
                  ? ` (marge ${r.best.margin.toFixed(1)} dB moins ${penalty.toFixed(1)} dB de penalite de degagement)`
                  : ' (aucune penalite de degagement)');
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
                      title="Centrer la carte"
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
        <span>
          Marge globale = min(bond 1, bond 2). Fresnel = degagement minimal des deux bonds. Le classement
          se fait sur la marge <em>penalisee</em> : en dessous de 60 % de degagement, jusqu a 6 dB sont
          retranches au bond concerne. Survolez une ligne pour voir le detail du score.
        </span>
        {rows.length > 5 && (
          <button type="button" className="shrink-0 text-sky-400 hover:text-sky-300" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Voir moins' : `Voir ${Math.min(25, rows.length)} sites`}
          </button>
        )}
      </div>
    </div>
  );
}
