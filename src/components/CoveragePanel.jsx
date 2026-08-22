import React from 'react';
import { Field, NumberInput, Select, Banner, Spinner } from './ui.jsx';

const km = (m) => `${(m / 1000).toFixed(1)} km`;

/**
 * Commande et resultats de l enveloppe de portee du relais.
 * Le calcul demande son propre telechargement de relief, bien au-dela du
 * corridor TX-RX : il est donc explicitement declenche par l utilisateur, avec
 * son cout affiche a l avance.
 */
export default function CoveragePanel({
  coverage,
  onChange,
  result,
  busy,
  progress,
  estimate,
  freeSpaceM,
  horizonM,
  desiredMargin,
  onRun,
  onExtend,
  disabled,
}) {
  const set = (patch) => onChange({ ...coverage, ...patch });
  const rings = result?.rings ?? [];
  const inner = rings.find((r) => r.threshold === desiredMargin);
  const outer = rings.find((r) => r.threshold === 0);

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-zinc-500">
        Portee du relais dans toutes les directions, calculee sur le relief reel : un rayon est tire
        tous les {(360 / coverage.azimuths).toFixed(0)} degres et s arrete la ou le bilan de liaison
        decroche.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Hauteur antenne du noeud">
          <NumberInput
            value={coverage.nodeHeight}
            onChange={(v) => set({ nodeHeight: v })}
            min={0}
            max={60}
            suffix="m"
          />
        </Field>
        <Field label="Gain antenne du noeud">
          <NumberInput
            value={coverage.nodeGain}
            onChange={(v) => set({ nodeGain: v })}
            min={-6}
            max={25}
            suffix="dBi"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Rayon d exploration">
          <NumberInput
            value={coverage.radiusKm}
            onChange={(v) => set({ radiusKm: v })}
            min={1}
            max={40}
            step="1"
            suffix="km"
          />
        </Field>
        <Field label="Directions">
          <Select
            value={String(coverage.azimuths)}
            onChange={(v) => set({ azimuths: Number(v) })}
            options={[
              { value: '36', label: '36 (tous les 10 deg)' },
              { value: '72', label: '72 (tous les 5 deg)' },
              { value: '144', label: '144 (tous les 2,5 deg)' },
            ]}
          />
        </Field>
      </div>

      <div className="rounded-lg border border-ink-500/70 bg-ink-900/50 px-2.5 py-2 text-[11px] leading-relaxed">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Portee en espace libre</span>
          <span className="font-mono text-zinc-300">{km(freeSpaceM)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Horizon radio (antennes seules)</span>
          <span className="font-mono text-zinc-300">{km(horizonM)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Points a telecharger</span>
          <span className="font-mono text-zinc-300">{estimate.points.toLocaleString('fr-FR')}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Requetes reseau</span>
          <span className={`font-mono ${estimate.requests > 200 ? 'text-amber-300' : 'text-zinc-300'}`}>
            {estimate.requests} (~{estimate.seconds} s)
          </span>
        </div>
        <p className="mt-1.5 text-zinc-600">
          La portee en espace libre ignore totalement le relief et la courbure : sur LoRa elle se
          compte en centaines de kilometres. Elle n est la que pour rappeler que la portee n est
          jamais limitee par la puissance, mais par la geometrie.
        </p>
      </div>

      <button
        type="button"
        className="btn-primary w-full"
        onClick={onRun}
        disabled={busy || disabled}
        title={disabled ? 'Selectionnez d abord un emplacement de relais' : undefined}
      >
        {busy ? (
          <>
            <Spinner className="h-3.5 w-3.5" />
            {progress ? `${progress.done}/${progress.total} requetes` : 'Calcul...'}
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" strokeLinecap="round" />
            </svg>
            {result ? 'Recalculer la couverture' : 'Calculer la couverture'}
          </>
        )}
      </button>

      {result && (
        <>
          <div className="overflow-hidden rounded-lg border border-ink-500/70">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-ink-900/60 text-left text-[10px] uppercase tracking-wide text-zinc-500">
                  <th className="px-2 py-1.5 font-medium">Zone</th>
                  <th className="px-2 py-1.5 text-right font-medium">Moyen</th>
                  <th className="px-2 py-1.5 text-right font-medium">Min</th>
                  <th className="px-2 py-1.5 text-right font-medium">Max</th>
                  <th className="px-2 py-1.5 text-right font-medium">Surface</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [inner, `Fiable (${desiredMargin} dB)`, 'bg-emerald-500', 'text-emerald-300'],
                  [outer, 'Limite de reception', 'bg-amber-500', 'text-amber-300'],
                ].map(([ring, label, dot, tone]) =>
                  ring ? (
                    <tr key={label} className="border-t border-ink-500/50">
                      <td className="px-2 py-1.5">
                        <span className="flex items-center gap-1.5 text-zinc-300">
                          <span className={`h-2 w-2 rounded-full ${dot}`} />
                          {label}
                        </span>
                      </td>
                      <td className={`px-2 py-1.5 text-right font-mono ${tone}`}>{km(ring.stats.mean)}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{km(ring.stats.min)}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-zinc-400">{km(ring.stats.max)}</td>
                      <td className="px-2 py-1.5 text-right font-mono text-zinc-300">
                        {ring.stats.areaKm2.toFixed(0)} km2
                      </td>
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>
          </div>

          {inner && (
            <p className="text-[11px] leading-relaxed text-zinc-500">
              Le relief ampute la zone fiable a{' '}
              <span className="font-mono text-zinc-300">{(inner.stats.fillRatio * 100).toFixed(0)} %</span> du
              disque de meme portee maximale.
              {inner.stats.blocked > 0 && (
                <>
                  {' '}
                  <span className="text-rose-300">{inner.stats.blocked}</span> direction(s) sur{' '}
                  {coverage.azimuths} sont bouchees des les premieres centaines de metres.
                </>
              )}
            </p>
          )}

          {(inner?.stats.saturated || outer?.stats.saturated) && (
            <Banner tone="warn" title="Portee bridee par le rayon d exploration">
              La zone atteint la limite des {coverage.radiusKm} km explores dans plusieurs directions :
              la portee reelle va au-dela.
              <button
                type="button"
                className="mt-1.5 block rounded border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-[11px] font-medium text-amber-100 transition hover:bg-amber-500/25"
                onClick={() => onExtend(Math.min(40, Math.round(coverage.radiusKm * 1.7)))}
              >
                Etendre a {Math.min(40, Math.round(coverage.radiusKm * 1.7))} km et recalculer
              </button>
            </Banner>
          )}

          <p className="text-[11px] leading-relaxed text-zinc-600">
            Chaque rayon s arrete a la premiere rupture durable du bilan. La zone tracee est donc
            continue depuis le relais : des poches de reception peuvent exister au-dela, derriere une
            zone d ombre, sans y figurer.
          </p>
        </>
      )}
    </div>
  );
}
