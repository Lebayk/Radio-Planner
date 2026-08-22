import React from 'react';
import { MarginChip } from './ui.jsx';
import { bearing, formatBearing } from '../lib/geo.js';
import { useI18n } from '../lib/i18n.js';

const STOP_REASON_KEYS = {
  direct: 'chain.stop.direct',
  atteint: 'chain.stop.atteint',
  'plafond-relais': 'chain.stop.plafond',
  'sans-gain': 'chain.stop.sansGain',
  'aucun-candidat': 'chain.stop.aucunCandidat',
  'profil-indisponible': 'chain.stop.profilIndisponible',
};

const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

/**
 * Chaine TX -> relais... -> RX construite jusqu a ce que la liaison passe.
 *
 * L interet est autant dans le resultat que dans le chemin parcouru : savoir
 * qu il a fallu deux relais, et de combien chacun a releve le maillon faible,
 * dit tout de la difficulte du terrain.
 */
/** Suffixe ordinal : "1er/2e/3e..." en francais, "1st/2nd/3rd/4th..." en anglais. */
function ordinal(n, lang) {
  if (lang !== 'en') return n === 1 ? 'er' : 'e';
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

export default function ChainPanel({ chain, onLocate }) {
  const { t, lang } = useI18n();
  if (!chain?.nodes?.length) return null;
  const { nodes, hops, relays, feasible, margin95, target, stopReason, log } = chain;

  const tone = feasible
    ? 'border-emerald-500/40 bg-emerald-500/10'
    : 'border-amber-500/40 bg-amber-500/10';
  const titleTone = feasible ? 'text-emerald-300' : 'text-amber-300';

  const label = (i) =>
    i === 0 ? 'TX' : i === nodes.length - 1 ? 'RX' : t('chain.relay', { n: i });

  // Cap exact a viser depuis chaque extremite : TX ne regarde qu en avant
  // (vers le premier noeud du trajet), RX qu en arriere (vers le dernier).
  // Calcule sur le grand cercle, pas une simple reciproque a 180 deg.
  const capTx = nodes.length > 1 ? bearing(nodes[0], nodes[1]) : NaN;
  const capRx = nodes.length > 1 ? bearing(nodes[nodes.length - 1], nodes[nodes.length - 2]) : NaN;

  const stopMsg = t(STOP_REASON_KEYS[stopReason] ?? stopReason);
  const verb =
    relays === 1
      ? t(feasible ? 'chain.verb.sufficesYes' : 'chain.verb.sufficesNo')
      : t(feasible ? 'chain.verb.sufficeYes' : 'chain.verb.sufficeNo');

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border px-3 py-2.5 ${tone}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className={`text-[15px] font-semibold ${titleTone}`}>
            {relays === 0 ? t('chain.noneNeeded') : t(relays === 1 ? 'chain.oneSuffices' : 'chain.nSuffice', { n: relays, verb })}
          </span>
          <span className={`font-mono text-[13px] ${titleTone}`}>
            {margin95 > 0 ? '+' : ''}
            {Number.isFinite(margin95) ? margin95.toFixed(1) : '-'} dB
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-zinc-300">
          {stopMsg}
          {t('chain.reasonSuffix', { target })}
        </p>
      </div>

      {(Number.isFinite(capTx) || Number.isFinite(capRx)) && (
        <div className="flex flex-wrap gap-2">
          {Number.isFinite(capTx) && (
            <div className="flex flex-1 items-center justify-between rounded-lg border border-ink-500/70 bg-ink-900/50 px-2.5 py-2">
              <span className="text-[11px] text-zinc-500">{t('chain.capTx')}</span>
              <span className="font-mono text-[13px] font-semibold text-zinc-200">{formatBearing(capTx)}</span>
            </div>
          )}
          {Number.isFinite(capRx) && (
            <div className="flex flex-1 items-center justify-between rounded-lg border border-ink-500/70 bg-ink-900/50 px-2.5 py-2">
              <span className="text-[11px] text-zinc-500">{t('chain.capRx')}</span>
              <span className="font-mono text-[13px] font-semibold text-zinc-200">{formatBearing(capRx)}</span>
            </div>
          )}
        </div>
      )}

      {/* Le trajet, bond par bond */}
      <div className="overflow-hidden rounded-lg border border-ink-500/70">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="bg-ink-900/60 text-left text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="px-2 py-1.5 font-medium">{t('chain.col.hop')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('chain.col.cap')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('chain.col.distance')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('chain.col.vegetation')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('chain.col.fresnel')}</th>
              <th className="px-2 py-1.5 text-right font-medium">{t('chain.col.margin95')}</th>
            </tr>
          </thead>
          <tbody>
            {hops.map((h, i) => (
              <tr key={i} className="border-t border-ink-500/50">
                <td className="px-2 py-1.5 font-mono text-zinc-300">
                  {label(i)} → {label(i + 1)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-zinc-400" title={t('chain.hopCapTitle')}>
                  {formatBearing(bearing(nodes[i], nodes[i + 1]))}
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

      {/* Les relais eux-memes. Un relais dirige a besoin des deux caps : vers
          le noeud precedent et vers le suivant. */}
      {relays > 0 && (
        <div className="space-y-1">
          {nodes.map((n, i) =>
            n.relay ? (
              <button
                key={i}
                type="button"
                onClick={() => onLocate?.(n)}
                className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md border border-ink-500/60 bg-ink-900/40 px-2.5 py-1.5 text-left transition hover:border-ink-500 hover:bg-ink-600/40"
              >
                <span className="flex items-center gap-2">
                  <span className="grid h-5 w-6 place-items-center rounded bg-emerald-600 font-mono text-[10px] font-semibold text-white">
                    {label(i)}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-300">
                    {n.lat.toFixed(5)}, {n.lon.toFixed(5)}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500">
                    {t('chain.node.ground', { elev: n.elev?.toFixed(0), mast: n.height })}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-zinc-500">
                  {t('chain.node.caps', {
                    back: formatBearing(bearing(n, nodes[i - 1])),
                    fwd: formatBearing(bearing(n, nodes[i + 1])),
                  })}
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
          {t('chain.addOrder')}
          {log
            .map((l, i) =>
              t('chain.addOrderItem', {
                i: i + 1,
                ord: ordinal(i + 1, lang),
                before: l.before.toFixed(1),
                after: l.after.toFixed(1),
              })
            )
            .join(' ; ')}
          {t('chain.addOrderSuffix')}
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-zinc-600">{t('chain.footer')}</p>
    </div>
  );
}
