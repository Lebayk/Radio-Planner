import React, { useState } from 'react';
import { Field, NumberInput, Select, Checkbox, Banner, TextInput } from './ui.jsx';
import { PROVIDERS, PROVIDER_BY_ID, getOpenTopoDataBase, setOpenTopoDataBase } from '../lib/elevation.js';
import { formatBearing } from '../lib/geo.js';

const PRESET_HEIGHTS = [2, 4, 6, 8, 10, 12, 15, 20, 25, 30];

/** Selection multiple des hauteurs d antenne du relais a tester. */
function HeightPicker({ heights, onChange }) {
  const [custom, setCustom] = useState('');
  const toggle = (h) => {
    const next = heights.includes(h) ? heights.filter((x) => x !== h) : [...heights, h];
    onChange(next.sort((a, b) => a - b));
  };
  const addCustom = () => {
    const v = Number(String(custom).replace(',', '.'));
    if (Number.isFinite(v) && v >= 0 && v <= 120 && !heights.includes(v)) {
      onChange([...heights, v].sort((a, b) => a - b));
    }
    setCustom('');
  };

  return (
    <div>
      <span className="field-label">Hauteurs d antenne du relais a tester</span>
      <div className="flex flex-wrap gap-1.5">
        {[...new Set([...PRESET_HEIGHTS, ...heights])]
          .sort((a, b) => a - b)
          .map((h) => {
            const on = heights.includes(h);
            return (
              <button
                key={h}
                type="button"
                onClick={() => toggle(h)}
                className={`rounded-md border px-2 py-1 font-mono text-[11px] transition ${
                  on
                    ? 'border-sky-500 bg-sky-500/20 text-sky-200'
                    : 'border-ink-500 bg-ink-900/60 text-zinc-500 hover:border-ink-500 hover:text-zinc-300'
                }`}
              >
                {h} m
              </button>
            );
          })}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className="input flex-1"
          placeholder="Autre hauteur"
          inputMode="decimal"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
        />
        <button type="button" className="btn-ghost" onClick={addCustom}>
          Ajouter
        </button>
      </div>
      {heights.length === 0 && (
        <p className="mt-1 text-[11px] text-amber-400/80">Selectionnez au moins une hauteur.</p>
      )}
      {heights.length > 6 && (
        <p className="mt-1 text-[11px] text-zinc-500">
          {heights.length} hauteurs : le balayage sera d autant plus long.
        </p>
      )}
    </div>
  );
}

export default function SearchPanel({ search, onChange, provider, onProviderChange, estimate, linkLength, linkBearing }) {
  const set = (patch) => onChange({ ...search, ...patch });
  const p = PROVIDER_BY_ID[provider];
  const tooFine = search.step < p.resolution * 0.8;
  const [otdBase, setOtdBase] = useState(getOpenTopoDataBase);

  return (
    <div className="space-y-3">
      <HeightPicker heights={search.heights} onChange={(v) => set({ heights: v })} />

      <div className="grid grid-cols-2 gap-2">
        <Field label="Rayon autour de l axe">
          <NumberInput value={search.radius} onChange={(v) => set({ radius: v })} min={50} max={5000} step="50" suffix="m" />
        </Field>
        <Field label="Pas de la grille">
          <NumberInput value={search.step} onChange={(v) => set({ step: v })} min={10} max={500} step="10" suffix="m" />
        </Field>
      </div>

      <Field
        label="Relais au maximum dans la chaine"
        hint="Si un seul relais ne suffit pas, l application en insere d autres dans le bond le plus faible, jusqu a ce que l objectif de marge soit tenu ou que ce plafond soit atteint."
      >
        <NumberInput
          value={search.maxRelays}
          onChange={(v) => set({ maxRelays: Math.round(v) })}
          min={1}
          max={8}
          step="1"
        />
      </Field>

      <Field
        label="Modele numerique de terrain"
        hint={p.hint}
      >
        <Select
          value={provider}
          onChange={onProviderChange}
          options={PROVIDERS.map((x) => ({ value: x.id, label: x.label }))}
        />
      </Field>

      {p.needsSelfHost && (
        <div className="space-y-2">
          <Banner tone="warn" title="Instance auto-hebergee requise">
            L API publique d OpenTopoData ne renvoie aucun en-tete CORS : le navigateur bloque l appel.
            Indiquez l adresse de votre propre instance, sinon l application basculera automatiquement sur
            un fournisseur mondial.
          </Banner>
          <Field label="Adresse de l instance OpenTopoData">
            <TextInput
              value={otdBase}
              onChange={(v) => {
                setOtdBase(v);
                setOpenTopoDataBase(v.trim());
              }}
              placeholder="https://mon-serveur.exemple/"
            />
          </Field>
        </div>
      )}

      {tooFine && (
        <Banner tone="warn">
          Un pas de {search.step} m est plus fin que la resolution du MNT ({p.resolution} m) : les points
          supplementaires n apportent pas d information, ils ne font qu allonger le telechargement.
        </Banner>
      )}

      <div className="space-y-2 rounded-lg border border-ink-500/60 bg-ink-900/40 p-2.5">
        <Checkbox
          checked={search.clutter}
          onChange={(v) => set({ clutter: v })}
          label="Modeliser la couverture du sol"
          hint="Vegetation et bati depuis OpenStreetMap. Sans cette option le calcul porte sur le sol nu, ce qui surestime nettement la portee : un rideau de feuillus coute 10 a 20 dB a 868 MHz."
        />
        {search.clutter && (
          <>
            <Checkbox
              checked={search.buildings}
              onChange={(v) => set({ buildings: v })}
              label="Inclure les batiments"
              hint="Traites comme obstacles opaques. Volumineux a telecharger, et seuls 8 % portent une hauteur dans OSM : les autres sont estimes a 8 m ou d apres le nombre d etages."
            />
            <p className="text-[11px] leading-snug text-zinc-600">
              Hauteurs par defaut : foret 20 m, verger 5 m, broussaille 3 m, vigne 2 m. OSM ne
              renseigne pas la hauteur de la vegetation ; ces valeurs sont des hypotheses.
            </p>
          </>
        )}
      </div>

      <Checkbox
        checked={search.exclude}
        onChange={(v) => set({ exclude: v })}
        label="Exclure les zones inaccessibles"
        hint="Ecarte les mailles dont la pente depasse 30 deg, ainsi que les surfaces detectees comme etant en eau (plateau parfaitement plat dans le MNT, ou altitude nulle). Detection heuristique : une plaine tres plane peut etre ecartee a tort."
      />

      <div className="rounded-lg border border-ink-500/70 bg-ink-900/50 px-2.5 py-2 text-[11px] leading-relaxed">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Distance TX - RX</span>
          <span className="font-mono text-zinc-300">
            {Number.isFinite(linkLength) ? `${(linkLength / 1000).toFixed(2)} km` : '-'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Cap TX vers RX</span>
          <span className="font-mono text-zinc-300">{formatBearing(linkBearing)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Points MNT a couvrir</span>
          <span className="font-mono text-zinc-300">{estimate.points.toLocaleString('fr-FR')}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Deja en cache</span>
          <span className="font-mono text-zinc-300">{estimate.cached.toLocaleString('fr-FR')}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">Requetes reseau</span>
          <span className={`font-mono ${estimate.requests > 200 ? 'text-amber-300' : 'text-zinc-300'}`}>
            {Number.isFinite(estimate.requests) ? estimate.requests : '-'}
            {Number.isFinite(estimate.seconds) ? ` (~${estimate.seconds} s)` : ''}
          </span>
        </div>
      </div>

      {estimate.requests > 200 && (
        <Banner tone="warn" title="Zone tres large">
          Le telechargement va prendre plusieurs minutes et solliciter lourdement un service gratuit.
          Reduisez le rayon ou augmentez le pas d echantillonnage.
        </Banner>
      )}
    </div>
  );
}
