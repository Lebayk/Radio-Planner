import React, { useState } from 'react';
import { Field, NumberInput, Select, Checkbox, Banner, TextInput } from './ui.jsx';
import { PROVIDERS, PROVIDER_BY_ID, getOpenTopoDataBase, setOpenTopoDataBase } from '../lib/elevation.js';
import { formatBearing } from '../lib/geo.js';
import { useI18n } from '../lib/i18n.js';

const PRESET_HEIGHTS = [2, 4, 6, 8, 10, 12, 15, 20, 25, 30];

/** Selection multiple des hauteurs d antenne du relais a tester. */
function HeightPicker({ heights, onChange }) {
  const { t } = useI18n();
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
      <span className="field-label">{t('search.heightsLabel')}</span>
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
          placeholder={t('search.otherHeight')}
          inputMode="decimal"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
        />
        <button type="button" className="btn-ghost" onClick={addCustom}>
          {t('search.add')}
        </button>
      </div>
      {heights.length === 0 && (
        <p className="mt-1 text-[11px] text-amber-400/80">{t('search.selectAtLeastOne')}</p>
      )}
      {heights.length > 6 && (
        <p className="mt-1 text-[11px] text-zinc-500">{t('search.manyHeights', { n: heights.length })}</p>
      )}
    </div>
  );
}

export default function SearchPanel({ search, onChange, provider, onProviderChange, estimate, linkLength, linkBearing }) {
  const { t, locale } = useI18n();
  const set = (patch) => onChange({ ...search, ...patch });
  const p = PROVIDER_BY_ID[provider];
  const tooFine = search.step < p.resolution * 0.8;
  const [otdBase, setOtdBase] = useState(getOpenTopoDataBase);

  return (
    <div className="space-y-3">
      <HeightPicker heights={search.heights} onChange={(v) => set({ heights: v })} />

      <div className="grid grid-cols-2 gap-2">
        <Field label={t('search.radius')}>
          <NumberInput value={search.radius} onChange={(v) => set({ radius: v })} min={50} max={5000} step="50" suffix="m" />
        </Field>
        <Field label={t('search.step')}>
          <NumberInput value={search.step} onChange={(v) => set({ step: v })} min={10} max={500} step="10" suffix="m" />
        </Field>
      </div>

      {estimate.tooBig && (
        <Banner tone="error" title={t('search.tooBigTitle')}>
          <p>{t('search.tooBigMsg')}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {Number.isFinite(estimate.suggestedStep) && (
              <button
                type="button"
                className="rounded border border-rose-500/40 bg-rose-500/15 px-2 py-1 text-[11px] font-medium text-rose-100 transition hover:bg-rose-500/25"
                onClick={() => set({ step: estimate.suggestedStep })}
              >
                {t('search.tooBigFixStep', { step: estimate.suggestedStep })}
              </button>
            )}
            {Number.isFinite(estimate.suggestedRadius) && (
              <button
                type="button"
                className="rounded border border-rose-500/40 bg-rose-500/15 px-2 py-1 text-[11px] font-medium text-rose-100 transition hover:bg-rose-500/25"
                onClick={() => set({ radius: estimate.suggestedRadius })}
              >
                {t('search.tooBigFixRadius', { radius: estimate.suggestedRadius })}
              </button>
            )}
          </div>
        </Banner>
      )}

      <Field label={t('search.maxRelays')} hint={t('search.maxRelaysHint')}>
        <NumberInput
          value={search.maxRelays}
          onChange={(v) => set({ maxRelays: Math.round(v) })}
          min={1}
          max={8}
          step="1"
        />
      </Field>

      <Field label={t('search.dem')} hint={p.hint}>
        <Select
          value={provider}
          onChange={onProviderChange}
          options={PROVIDERS.map((x) => ({ value: x.id, label: x.label }))}
        />
      </Field>

      {p.needsSelfHost && (
        <div className="space-y-2">
          <Banner tone="warn" title={t('search.selfHostTitle')}>
            {t('search.selfHostMsg')}
          </Banner>
          <Field label={t('search.otdAddress')}>
            <TextInput
              value={otdBase}
              onChange={(v) => {
                setOtdBase(v);
                setOpenTopoDataBase(v.trim());
              }}
              placeholder="https://mon-serveur.example/"
            />
          </Field>
        </div>
      )}

      {tooFine && <Banner tone="warn">{t('search.tooFine', { step: search.step, res: p.resolution })}</Banner>}

      <div className="space-y-2 rounded-lg border border-ink-500/60 bg-ink-900/40 p-2.5">
        <Checkbox
          checked={search.clutter}
          onChange={(v) => set({ clutter: v })}
          label={t('search.modelGround')}
          hint={t('search.modelGroundHint')}
        />
        {search.clutter && (
          <>
            <Checkbox
              checked={search.buildings}
              onChange={(v) => set({ buildings: v })}
              label={t('search.includeBuildings')}
              hint={t('search.includeBuildingsHint')}
            />
            <p className="text-[11px] leading-snug text-zinc-600">{t('search.defaultHeights')}</p>
          </>
        )}
      </div>

      <Checkbox
        checked={search.exclude}
        onChange={(v) => set({ exclude: v })}
        label={t('search.excludeInaccessible')}
        hint={t('search.excludeInaccessibleHint')}
      />

      <div className="rounded-lg border border-ink-500/70 bg-ink-900/50 px-2.5 py-2 text-[11px] leading-relaxed">
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">{t('search.linkDistance')}</span>
          <span className="font-mono text-zinc-300">
            {Number.isFinite(linkLength) ? `${(linkLength / 1000).toFixed(2)} km` : '-'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">{t('search.linkBearing')}</span>
          <span className="font-mono text-zinc-300">{formatBearing(linkBearing)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">{t('search.pointsToCover')}</span>
          <span className="font-mono text-zinc-300">{estimate.points.toLocaleString(locale)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">{t('search.alreadyCached')}</span>
          <span className="font-mono text-zinc-300">{estimate.cached.toLocaleString(locale)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-500">{t('search.networkRequests')}</span>
          <span className={`font-mono ${estimate.requests > 200 ? 'text-amber-300' : 'text-zinc-300'}`}>
            {Number.isFinite(estimate.requests) ? estimate.requests : '-'}
            {Number.isFinite(estimate.seconds) ? ` (~${estimate.seconds} s)` : ''}
          </span>
        </div>
      </div>

      {estimate.requests > 200 && <Banner tone="warn" title={t('search.wideAreaTitle')}>{t('search.wideAreaMsg')}</Banner>}
    </div>
  );
}
