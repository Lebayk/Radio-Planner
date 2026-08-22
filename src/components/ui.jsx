import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../lib/i18n.js';

/**
 * Menu deroulant rendu dans un portail, en position fixe.
 *
 * Rendu a l interieur de son bouton, un menu absolu depend du `overflow` et du
 * contexte d empilement de tous ses ancetres : il suffit d un conteneur qui
 * rogne pour qu il devienne invisible sans qu aucune erreur ne soit levee.
 * Le portail supprime cette dependance.
 *
 * La fermeture passe par un voile plein ecran plutot que par un ecouteur
 * `mousedown` sur le document : pas d ordre d evenements a demeler, le clic
 * exterieur est capte par un element reel.
 */
export function DropdownMenu({ open, anchorRef, onClose, width = 240, children }) {
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const place = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({
        top: r.bottom + 4,
        // Aligne a droite du bouton, sans jamais sortir de la fenetre.
        left: Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorRef, width]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !pos) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} aria-hidden="true" />
      <div
        role="menu"
        style={{ top: pos.top, left: pos.left, width }}
        className="fixed z-[9999] overflow-hidden rounded-lg border border-ink-500 bg-ink-800 shadow-2xl"
      >
        {children}
      </div>
    </>,
    document.body
  );
}

/** Bloc repliable utilise pour toutes les sections du panneau lateral. */
export function Section({ title, icon, children, defaultOpen = true, right }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="card-title w-full justify-between hover:text-zinc-200"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="text-sm">
            {icon}
          </span>
          {title}
        </span>
        <span className="flex items-center gap-2">
          {right}
          <svg
            viewBox="0 0 24 24"
            className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open && <div className="space-y-3 border-t border-ink-500/60 px-4 py-3.5">{children}</div>}
    </section>
  );
}

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] leading-snug text-zinc-500">{hint}</span>}
    </label>
  );
}

export function TextInput({ value, onChange, ...rest }) {
  return (
    <input
      type="text"
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    />
  );
}

/**
 * Champ numerique tolerant : on garde la saisie brute tant qu elle n est pas
 * valide, pour ne pas remettre le curseur a zero quand l utilisateur efface ou
 * tape un separateur decimal.
 */
export function NumberInput({ value, onChange, min, max, step = 'any', suffix, invalid, ...rest }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? (value ?? '');

  const commit = (raw) => {
    const cleaned = String(raw).replace(',', '.').trim();
    if (cleaned === '' || cleaned === '-') return;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return;
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v);
  };

  return (
    <span className="relative block">
      <input
        type="text"
        inputMode="decimal"
        className={`input tabular ${suffix ? 'pr-10' : ''} ${invalid ? 'input-invalid' : ''}`}
        value={shown}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => setDraft(null)}
        step={step}
        {...rest}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-zinc-500">
          {suffix}
        </span>
      )}
    </span>
  );
}

export function Select({ value, onChange, options, ...rest }) {
  return (
    <select
      className="input appearance-none bg-[length:14px] bg-[right_0.5rem_center] bg-no-repeat pr-8"
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2.5'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
      }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-ink-800">
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ checked, onChange, label, hint }) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-ink-500 bg-ink-900 accent-sky-500"
      />
      <label htmlFor={id} className="cursor-pointer select-none text-sm leading-snug text-zinc-300">
        {label}
        {hint && <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500">{hint}</span>}
      </label>
    </div>
  );
}

/** Etiquette colorée d une marge de liaison. */
export function MarginChip({ value, unit = 'dB', digits = 1 }) {
  if (!Number.isFinite(value)) return <span className="chip bg-ink-600 text-zinc-500">-</span>;
  const cls =
    value >= 15
      ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
      : value >= 5
        ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30'
        : 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30';
  return (
    <span className={`chip ${cls}`}>
      {value > 0 ? '+' : ''}
      {value.toFixed(digits)} {unit}
    </span>
  );
}

export function Banner({ tone = 'info', title, children, onClose }) {
  const { t } = useI18n();
  const tones = {
    info: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
    warn: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    error: 'border-rose-500/40 bg-rose-500/10 text-rose-200',
    ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  };
  return (
    <div className={`rounded-lg border px-3 py-2.5 text-[12px] leading-relaxed ${tones[tone]}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          {title && <div className="mb-0.5 font-semibold">{title}</div>}
          {children}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100"
            aria-label={t('ui.close')}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** Barre de progression avec libelle et pourcentage. */
export function Progress({ value, total, label, indeterminate }) {
  const pct = total > 0 ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-[11px]">
        <span className="text-zinc-400">{label}</span>
        <span className="tabular font-mono text-zinc-500">
          {indeterminate ? '' : `${Math.round(pct)} %`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-600">
        <div
          className="progress-fill h-full rounded-full transition-[width] duration-200"
          style={{ width: indeterminate ? '100%' : `${pct}%` }}
        />
      </div>
    </div>
  );
}
