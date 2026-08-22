import React, { useEffect, useRef, useState } from 'react';
import { Field, NumberInput, TextInput, Spinner } from './ui.jsx';
import { geocode } from '../lib/osm.js';
import { toDMS } from '../lib/geo.js';

/** Recherche d adresse Nominatim, avec anti-rebond et annulation. */
function AddressSearch({ onPick }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const abort = useRef(null);
  const timer = useRef(null);
  const box = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (box.current && !box.current.contains(e.target)) setItems(null);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const run = (value) => {
    clearTimeout(timer.current);
    abort.current?.abort();
    setErr(null);
    if (value.trim().length < 3) {
      setItems(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    timer.current = setTimeout(async () => {
      const ctl = new AbortController();
      abort.current = ctl;
      try {
        setItems(await geocode(value, ctl.signal));
      } catch (e) {
        if (e.name !== 'AbortError') setErr('Recherche indisponible');
      } finally {
        setBusy(false);
      }
    }, 550);
  };

  return (
    <div ref={box} className="relative">
      <span className="field-label">Rechercher une adresse</span>
      <div className="relative">
        <input
          className="input pr-8"
          placeholder="Commune, lieu-dit, adresse..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            run(e.target.value);
          }}
          onKeyDown={(e) => e.key === 'Escape' && setItems(null)}
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500">
          {busy ? (
            <Spinner className="h-3.5 w-3.5" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
          )}
        </span>
      </div>
      {err && <p className="mt-1 text-[11px] text-amber-400/80">{err}</p>}
      {items && (
        <ul className="absolute z-[1200] mt-1 max-h-56 w-full overflow-auto rounded-lg border border-ink-500 bg-ink-800 shadow-2xl">
          {items.length === 0 && <li className="px-3 py-2 text-[12px] text-zinc-500">Aucun resultat</li>}
          {items.map((it, i) => (
            <li key={i}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-[12px] leading-snug text-zinc-300 transition hover:bg-ink-600"
                onClick={() => {
                  onPick(it);
                  setItems(null);
                  setQ('');
                }}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SitePanel({ site, onChange, color, picking, onPickToggle, elevation, elevBusy }) {
  const set = (patch) => onChange({ ...site, ...patch });

  return (
    <div className="space-y-3">
      <Field label="Nom du site">
        <TextInput value={site.name} onChange={(v) => set({ name: v })} placeholder="Nom" />
      </Field>

      <AddressSearch onPick={(p) => set({ lat: p.lat, lon: p.lon, name: site.name || p.label.split(',')[0] })} />

      <div className="grid grid-cols-2 gap-2">
        <Field label="Latitude">
          <NumberInput value={site.lat} onChange={(v) => set({ lat: v })} min={-90} max={90} step="0.00001" />
        </Field>
        <Field label="Longitude">
          <NumberInput value={site.lon} onChange={(v) => set({ lon: v })} min={-180} max={180} step="0.00001" />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-lg border border-ink-500/70 bg-ink-900/50 px-2.5 py-2">
        <div className="min-w-0 text-[11px] leading-tight text-zinc-500">
          <div className="font-mono text-zinc-400">{toDMS(site.lat, true)}</div>
          <div className="font-mono text-zinc-400">{toDMS(site.lon, false)}</div>
          <div className="mt-1">
            Altitude sol :{' '}
            <span className="font-mono text-zinc-300">
              {elevBusy ? '...' : Number.isFinite(elevation) ? `${elevation.toFixed(0)} m` : '-'}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onPickToggle}
          className={picking ? 'btn border-sky-500 bg-sky-600 text-white' : 'btn-ghost'}
          title="Definir la position par un clic sur la carte"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" strokeLinejoin="round" />
            <circle cx="12" cy="10" r="2.4" />
          </svg>
          {picking ? 'Cliquez...' : 'Carte'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Hauteur antenne">
          <NumberInput value={site.height} onChange={(v) => set({ height: v })} min={0} max={120} suffix="m" />
        </Field>
        <Field label="Gain antenne">
          <NumberInput value={site.gain} onChange={(v) => set({ gain: v })} min={-6} max={25} suffix="dBi" />
        </Field>
      </div>

      <div
        className="h-0.5 w-full rounded-full opacity-60"
        style={{ background: color }}
        aria-hidden="true"
      />
    </div>
  );
}
