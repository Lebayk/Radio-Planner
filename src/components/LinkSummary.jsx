import React from 'react';
import { MarginChip } from './ui.jsx';
import Verdict from './Verdict.jsx';
import { PRESET_BY_ID, assessLink } from '../lib/radio.js';
import { bearing, formatBearing } from '../lib/geo.js';

const Row = ({ label, a, b, mono = true }) => (
  <tr className="border-t border-ink-500/40">
    <td className="py-1.5 pr-2 text-[11px] text-zinc-500">{label}</td>
    <td className={`py-1.5 text-right text-[12px] text-zinc-300 ${mono ? 'font-mono' : ''}`}>{a}</td>
    <td className={`py-1.5 pl-3 text-right text-[12px] text-zinc-300 ${mono ? 'font-mono' : ''}`}>{b}</td>
  </tr>
);

const d = (v, n = 1, u = '') => (Number.isFinite(v) ? `${v.toFixed(n)}${u}` : '-');

export default function LinkSummary({ result, radio, direct, tx, rx, relay }) {
  if (!result) return null;
  const { hop1, hop2 } = result;
  const sens = PRESET_BY_ID[radio.preset].sens;
  // Cap exact a viser depuis chaque extremite, calcule sur le grand cercle
  // (pas une approximation planaire) : c est ce que l on lit sur une boussole
  // en se tenant a TX ou a RX.
  const capTx = tx && relay ? bearing(tx, relay) : NaN;
  const capRx = rx && relay ? bearing(rx, relay) : NaN;
  const verdict = assessLink({
    margin: result.margin,
    margin95: result.margin95,
    clearance: result.clearance,
    desiredMargin: radio.desiredMargin,
    foliage: result.foliage,
    sigma: Math.max(hop1.sigma ?? 0, hop2.sigma ?? 0),
  });
  const directVerdict = direct
    ? assessLink({
        margin: direct.margin,
        margin95: direct.margin95,
        clearance: direct.clearance,
        desiredMargin: radio.desiredMargin,
        foliage: direct.foliage,
        sigma: direct.sigma,
      })
    : null;

  return (
    <div className="space-y-3">
      <Verdict verdict={verdict} />

      {(Number.isFinite(capTx) || Number.isFinite(capRx)) && (
        <div className="flex flex-wrap gap-2">
          {Number.isFinite(capTx) && (
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-ink-500/70 bg-ink-900/50 px-2.5 py-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-sky-400" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3" strokeLinecap="round" />
                <path d="M12 12l4-6-6 4z" fill="currentColor" stroke="none" />
              </svg>
              <span className="text-[11px] leading-tight text-zinc-500">
                Cap antenne TX
                <br />
                <span className="font-mono text-[13px] font-semibold text-zinc-200">{formatBearing(capTx)}</span>
              </span>
            </div>
          )}
          {Number.isFinite(capRx) && (
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-ink-500/70 bg-ink-900/50 px-2.5 py-2">
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-sky-400" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3" strokeLinecap="round" />
                <path d="M12 12l4-6-6 4z" fill="currentColor" stroke="none" />
              </svg>
              <span className="text-[11px] leading-tight text-zinc-500">
                Cap antenne RX
                <br />
                <span className="font-mono text-[13px] font-semibold text-zinc-200">{formatBearing(capRx)}</span>
              </span>
            </div>
          )}
        </div>
      )}
      {(Number.isFinite(capTx) || Number.isFinite(capRx)) && (
        <p className="-mt-1 px-0.5 text-[10px] leading-relaxed text-zinc-600">
          Cap geographique (nord vrai), calcule sur le grand cercle. Une boussole magnetique lit le
          nord magnetique : corrigez de la declinaison locale, ou visez avec le mode « nord vrai »
          d un GPS ou d une boussole de telephone.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 text-[11px] text-zinc-500">
        <span>
          Antenne relais : <span className="font-mono text-zinc-300">{result.height} m</span>
        </span>
        <span>
          Degagement minimal :{' '}
          <span className={`font-mono ${result.clearance >= 0.6 ? 'text-emerald-300' : 'text-amber-300'}`}>
            {(result.clearance * 100).toFixed(0)} %
          </span>
        </span>
        <span>
          Objectif : <span className="font-mono text-zinc-300">{radio.desiredMargin} dB</span>
        </span>
      </div>

      <table className="w-full">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-zinc-500">
            <th />
            <th className="pb-1 text-right font-medium">Bond 1 (TX-REL)</th>
            <th className="pb-1 pl-3 text-right font-medium">Bond 2 (REL-RX)</th>
          </tr>
        </thead>
        <tbody>
          <Row label="Distance" a={d(hop1.distM / 1000, 2, ' km')} b={d(hop2.distM / 1000, 2, ' km')} />
          <Row label="Perte espace libre" a={d(hop1.fspl, 1, ' dB')} b={d(hop2.fspl, 1, ' dB')} />
          <Row label="Diffraction J(v)" a={d(hop1.diffraction, 1, ' dB')} b={d(hop2.diffraction, 1, ' dB')} />
          <Row
            label="Vegetation traversee"
            a={hop1.foliageDepth > 0 ? `${d(hop1.foliage, 1, ' dB')} / ${Math.round(hop1.foliageDepth)} m` : '-'}
            b={hop2.foliageDepth > 0 ? `${d(hop2.foliage, 1, ' dB')} / ${Math.round(hop2.foliageDepth)} m` : '-'}
          />
          <Row label="Parametre v" a={d(hop1.v, 2)} b={d(hop2.v, 2)} />
          <Row label="RSSI estime" a={d(hop1.rssi, 1, ' dBm')} b={d(hop2.rssi, 1, ' dBm')} />
          <Row label="Fresnel degagee" a={d(hop1.clearance * 100, 0, ' %')} b={d(hop2.clearance * 100, 0, ' %')} />
          <Row label="Marge a 95 %" a={d(hop1.margin95, 1, ' dB')} b={d(hop2.margin95, 1, ' dB')} />
          <tr className="border-t border-ink-500/40">
            <td className="py-1.5 pr-2 text-[11px] text-zinc-500">Marge mediane</td>
            <td className="py-1.5 text-right">
              <MarginChip value={hop1.margin} />
            </td>
            <td className="py-1.5 pl-3 text-right">
              <MarginChip value={hop2.margin} />
            </td>
          </tr>
        </tbody>
      </table>

      <p className="text-[11px] leading-relaxed text-zinc-500">
        Sensibilite du preset {radio.preset} : <span className="font-mono">{sens} dBm</span>. Les altitudes
        d antenne sont comptees au-dessus du sol. La marge a 95 % retranche la dispersion d un
        emplacement a l autre ; c est elle qui fonde le verdict.
      </p>

      {direct && (
        <p className="rounded-lg border border-ink-500/60 bg-ink-900/40 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-400">
          <span className="font-medium text-zinc-300">Sans relais</span> — liaison directe TX-RX :{' '}
          <span
            className={
              directVerdict.tone === 'ok'
                ? 'font-medium text-emerald-300'
                : directVerdict.tone === 'error'
                  ? 'font-medium text-rose-300'
                  : 'font-medium text-amber-300'
            }
          >
            {directVerdict.label}
          </span>
          . Marge{' '}
          <span className="font-mono">{direct.margin.toFixed(1)} dB</span>, diffraction{' '}
          <span className="font-mono">{direct.diffraction.toFixed(1)} dB</span>, Fresnel{' '}
          <span className="font-mono">{(direct.clearance * 100).toFixed(0)} %</span>. Le relais apporte{' '}
          <span className="font-mono text-zinc-200">
            {result.margin - direct.margin >= 0 ? '+' : ''}
            {(result.margin - direct.margin).toFixed(1)} dB
          </span>
          .
        </p>
      )}
    </div>
  );
}
