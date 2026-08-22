import React from 'react';
import { MarginChip } from './ui.jsx';

const STOP_REASONS = {
  direct: 'La liaison directe suffit : aucun relais necessaire.',
  atteint: 'Objectif atteint.',
  'plafond-relais':
    'Le nombre maximal de relais est atteint sans que l objectif le soit. Relevez le plafond, ou revoyez les hauteurs d antenne et la puissance.',
  'sans-gain':
    'Ajouter un relais de plus n ameliorerait pas le maillon faible : le terrain ne s y prete pas dans le corridor explore. Elargissez le rayon de recherche.',
  'aucun-candidat':
    'Aucune maille candidate exploitable dans ce bond. Elargissez le rayon, ou desactivez le filtre d accessibilite.',
  'profil-indisponible': 'Profil d altitude indisponible sur ce bond.',
};

const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

/**
 * Chaine TX -> relais... -> RX construite jusqu a ce que la liaison passe.
 *
 * L interet est autant dans le resultat que dans le chemin parcouru : savoir
 * qu il a fallu deux relais, et de combien chacun a releve le maillon faible,
 * dit tout de la difficulte du terrain.
 */
export default function ChainPanel({ chain, onLocate }) {
  if (!chain?.nodes?.length) return null;
  const { nodes, hops, relays, feasible, margin95, target, stopReason, log } = chain;

  const tone = feasible
    ? 'border-emerald-500/40 bg-emerald-500/10'
    : 'border-amber-500/40 bg-amber-500/10';
  const titleTone = feasible ? 'text-emerald-300' : 'text-amber-300';

  const label = (i) =>
    i === 0 ? 'TX' : i === nodes.length - 1 ? 'RX' : `R${i}`;

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border px-3 py-2.5 ${tone}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className={`text-[15px] font-semibold ${titleTone}`}>
            {relays === 0
              ? 'Aucun relais necessaire'
              : relays === 1
                ? `1 relais ${feasible ? 'suffit' : 'ne suffit pas'}`
                : `${relays} relais ${feasible ? 'suffisent' : 'ne suffisent pas'}`}
          </span>
          <span className={`font-mono text-[13px] ${titleTone}`}>
            {margin95 > 0 ? '+' : ''}
            {Number.isFinite(margin95) ? margin95.toFixed(1) : '-'} dB
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-300">
          {STOP_REASONS[stopReason] ?? stopReason} Marge du maillon le plus faible, tenue sur 95 %
          des emplacements, contre un objectif de {target} dB.
        </p>
      </div>

      {/* Le trajet, bond par bond */}
      <div className="overflow-hidden rounded-lg border border-ink-500/70">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-ink-900/60 text-left text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="px-2 py-1.5 font-medium">Bond</th>
              <th className="px-2 py-1.5 text-right font-medium">Distance</th>
              <th className="px-2 py-1.5 text-right font-medium">Vegetation</th>
              <th className="px-2 py-1.5 text-right font-medium">Fresnel</th>
              <th className="px-2 py-1.5 text-right font-medium">Marge 95 %</th>
            </tr>
          </thead>
          <tbody>
            {hops.map((h, i) => (
              <tr key={i} className="border-t border-ink-500/50">
                <td className="px-2 py-1.5 font-mono text-zinc-300">
                  {label(i)} → {label(i + 1)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-zinc-400">
                  {h ? km(h.distM) : '-'}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-zinc-400">
                  {h && h.foliage > 0.5 ? `${h.foliage.toFixed(1)} dB` : '-'}
                </td>
                <td
                  className={`px-2 py-1.5 text-right font-mono ${
                    h && h.clearance >= 0.6 ? 'text-emerald-300' : 'text-amber-300'
                  }`}
                >
                  {h ? `${(h.clearance * 100).toFixed(0)} %` : '-'}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <MarginChip value={h?.margin95} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Les relais eux-memes */}
      {relays > 0 && (
        <div className="space-y-1">
          {nodes.map((n, i) =>
            n.relay ? (
              <button
                key={i}
                type="button"
                onClick={() => onLocate?.(n)}
                className="flex w-full items-center justify-between gap-2 rounded-md border border-ink-500/60 bg-ink-900/40 px-2.5 py-1.5 text-left transition hover:border-ink-500 hover:bg-ink-600/40"
              >
                <span className="flex items-center gap-2">
                  <span className="grid h-5 w-6 place-items-center rounded bg-emerald-600 font-mono text-[10px] font-semibold text-white">
                    {label(i)}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-300">
                    {n.lat.toFixed(5)}, {n.lon.toFixed(5)}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-zinc-500">
                  sol {n.elev?.toFixed(0)} m · mat {n.height} m
                </span>
              </button>
            ) : null
          )}
        </div>
      )}

      {log?.length > 0 && (
        <p className="text-[11px] leading-relaxed text-zinc-500">
          {/* Volontairement numerote par ordre d ajout et non par etiquette :
              un relais insere en premier peut se retrouver etiquete R2 si un
              autre vient ensuite se placer avant lui. */}
          Ordre d ajout :{' '}
          {log
            .map(
              (l, i) =>
                `${i + 1}${i === 0 ? 'er' : 'e'} relais, maillon faible de ` +
                `${l.before.toFixed(1)} a ${l.after.toFixed(1)} dB`
            )
            .join(' ; ')}
          . Les etiquettes R1, R2... suivent l ordre geographique le long du
          trajet, pas cet ordre d ajout.
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-zinc-600">
        Chaque relais est insere dans le bond le plus faible, puis le calcul recommence. Un relais
        qui n ameliorerait pas ce maillon est refuse : la chaine s arrete alors plutot que de
        s allonger sans effet. Les relais sont cherches dans le corridor deja telecharge, donc sans
        requete supplementaire.
      </p>
    </div>
  );
}
