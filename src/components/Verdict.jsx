import React from 'react';

const TONES = {
  ok: {
    box: 'border-emerald-500/40 bg-emerald-500/10',
    title: 'text-emerald-300',
    icon: 'text-emerald-400',
    path: 'M20 6L9 17l-5-5',
  },
  warn: {
    box: 'border-amber-500/40 bg-amber-500/10',
    title: 'text-amber-300',
    icon: 'text-amber-400',
    path: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18.4A2 2 0 0 0 3.5 21.4h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  },
  error: {
    box: 'border-rose-500/40 bg-rose-500/10',
    title: 'text-rose-300',
    icon: 'text-rose-400',
    path: 'M18 6L6 18M6 6l12 12',
  },
};

/**
 * Verdict de faisabilite. C est la reponse a la seule question qui compte
 * vraiment : est-ce que ca passe, oui ou non.
 */
export default function Verdict({ verdict, compact = false }) {
  if (!verdict) return null;
  const t = TONES[verdict.tone] ?? TONES.warn;

  if (compact) {
    return (
      <span
        className={`chip ${t.box} ${t.title} border`}
        title={verdict.reason}
      >
        {verdict.short}
      </span>
    );
  }

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${t.box}`}>
      <div className="flex items-start gap-2.5">
        <svg
          viewBox="0 0 24 24"
          className={`mt-0.5 h-5 w-5 shrink-0 ${t.icon}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
        >
          <path d={t.path} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className={`text-[15px] font-semibold ${t.title}`}>{verdict.label}</span>
            {Number.isFinite(verdict.margin) && (
              <span className={`font-mono text-[13px] ${t.title}`}>
                {verdict.margin > 0 ? '+' : ''}
                {verdict.margin.toFixed(1)} dB
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-zinc-300">{verdict.reason}</p>

          {Number.isFinite(verdict.margin95) && (
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 border-t border-white/10 pt-1.5 text-[11px] leading-relaxed text-zinc-400">
              <span>
                Median{' '}
                <span className="font-mono text-zinc-300">
                  {verdict.margin50 > 0 ? '+' : ''}
                  {verdict.margin50.toFixed(1)} dB
                </span>
              </span>
              <span>
                Tenu sur 95 % des emplacements{' '}
                <span
                  className={`font-mono ${
                    verdict.margin95 >= 0 ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {verdict.margin95 > 0 ? '+' : ''}
                  {verdict.margin95.toFixed(1)} dB
                </span>
              </span>
              <span className="text-zinc-500">
                dispersion <span className="font-mono">{verdict.sigma?.toFixed(1)} dB</span>
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
