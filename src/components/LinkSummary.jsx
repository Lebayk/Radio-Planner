import React from 'react';
import { MarginChip } from './ui.jsx';
import Verdict from './Verdict.jsx';
import { PRESET_BY_ID, assessLink } from '../lib/radio.js';
import { bearing, formatBearing } from '../lib/geo.js';
import { useI18n } from '../lib/i18n.js';

const Row = ({ label, a, b, mono = true }) => (
  <tr className="border-t border-ink-500/40">
    <td className="py-1.5 pr-2 text-[11px] text-zinc-500">{label}</td>
    <td className={`py-1.5 text-right text-[12px] text-zinc-300 ${mono ? 'font-mono' : ''}`}>{a}</td>
    <td className={`py-1.5 pl-3 text-right text-[12px] text-zinc-300 ${mono ? 'font-mono' : ''}`}>{b}</td>
  </tr>
);

const d = (v, n = 1, u = '') => (Number.isFinite(v) ? `${v.toFixed(n)}${u}` : '-');

export default function LinkSummary({ result, radio, direct, tx, rx, relay }) {
  const { t, lang } = useI18n();
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
    lang,
  });
  const directVerdict = direct
    ? assessLink({
        margin: direct.margin,
        margin95: direct.margin95,
        clearance: direct.clearance,
        desiredMargin: radio.desiredMargin,
        foliage: direct.foliage,
        sigma: direct.sigma,
        lang,
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
                {t('link.capTx')}
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
                {t('link.capRx')}
                <br />
                <span className="font-mono text-[13px] font-semibold text-zinc-200">{formatBearing(capRx)}</span>
              </span>
            </div>
          )}
        </div>
      )}
      {(Number.isFinite(capTx) || Number.isFinite(capRx)) && (
        <p className="-mt-1 px-0.5 text-[10px] leading-relaxed text-zinc-600">{t('link.capNote')}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-0.5 text-[11px] text-zinc-500">
        <span>
          {t('link.relayAntenna')} <span className="font-mono text-zinc-300">{result.height} m</span>
        </span>
        <span>
          {t('link.minClearance')}{' '}
          <span className={`font-mono ${result.clearance >= 0.6 ? 'text-emerald-300' : 'text-amber-300'}`}>
            {(result.clearance * 100).toFixed(0)} %
          </span>
        </span>
        <span>
          {t('link.target')} <span className="font-mono text-zinc-300">{radio.desiredMargin} dB</span>
        </span>
      </div>

      <table className="w-full">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-zinc-500">
            <th />
            <th className="pb-1 text-right font-medium">{t('link.hop1')}</th>
            <th className="pb-1 pl-3 text-right font-medium">{t('link.hop2')}</th>
          </tr>
        </thead>
        <tbody>
          <Row label={t('link.row.distance')} a={d(hop1.distM / 1000, 2, ' km')} b={d(hop2.distM / 1000, 2, ' km')} />
          <Row label={t('link.row.fspl')} a={d(hop1.fspl, 1, ' dB')} b={d(hop2.fspl, 1, ' dB')} />
          <Row label={t('link.row.diffraction')} a={d(hop1.diffraction, 1, ' dB')} b={d(hop2.diffraction, 1, ' dB')} />
          <Row
            label={t('link.row.vegetation')}
            a={hop1.foliageDepth > 0 ? `${d(hop1.foliage, 1, ' dB')} / ${Math.round(hop1.foliageDepth)} m` : '-'}
            b={hop2.foliageDepth > 0 ? `${d(hop2.foliage, 1, ' dB')} / ${Math.round(hop2.foliageDepth)} m` : '-'}
          />
          <Row label={t('link.row.vParam')} a={d(hop1.v, 2)} b={d(hop2.v, 2)} />
          <Row label={t('link.row.rssi')} a={d(hop1.rssi, 1, ' dBm')} b={d(hop2.rssi, 1, ' dBm')} />
          <Row label={t('link.row.fresnelClear')} a={d(hop1.clearance * 100, 0, ' %')} b={d(hop2.clearance * 100, 0, ' %')} />
          <Row label={t('link.row.margin95')} a={d(hop1.margin95, 1, ' dB')} b={d(hop2.margin95, 1, ' dB')} />
          <tr className="border-t border-ink-500/40">
            <td className="py-1.5 pr-2 text-[11px] text-zinc-500">{t('link.row.medianMargin')}</td>
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
        {t('link.sensitivity', { preset: radio.preset, sens })}
      </p>

      {direct && (
        <p className="rounded-lg border border-ink-500/60 bg-ink-900/40 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-400">
          <span className="font-medium text-zinc-300">{t('link.noRelay')}</span>
          {t('link.noRelayIntro')}
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
          {t('link.noRelayStats', {
            margin: direct.margin.toFixed(1),
            diff: direct.diffraction.toFixed(1),
            fresnel: (direct.clearance * 100).toFixed(0),
            gain: `${result.margin - direct.margin >= 0 ? '+' : ''}${(result.margin - direct.margin).toFixed(1)}`,
          })}
        </p>
      )}
    </div>
  );
}
