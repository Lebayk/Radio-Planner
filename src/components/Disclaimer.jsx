import React from 'react';

/**
 * Avertissement sur les limites du modele. Toujours visible sous forme
 * condensee, depliable pour le detail : c est une information de securite,
 * pas une notification a masquer definitivement.
 */
export default function Disclaimer({ open, onToggle }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-100/90">
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-2 text-left">
        <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18.4A2 2 0 0 0 3.5 21.4h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="flex-1">
          <b>Ce que le modele ignore encore.</b>{' '}
          {!open && <span className="text-amber-100/70">Toute simulation doit etre validee sur le terrain.</span>}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5 border-t border-amber-500/25 pt-2 text-amber-100/80">
          <p>
            Sont desormais pris en compte : le relief, la courbure terrestre, la diffraction sur
            plusieurs aretes, la <b>vegetation</b> et le <b>bati</b> issus d OpenStreetMap, et la
            dispersion d un emplacement a l autre (marge a 95 %).
          </p>
          <p className="pt-1">Restent hors du modele, ou incertains :</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              les <b>hauteurs de couvert</b>, largement supposees : OSM ne renseigne quasiment jamais la
              hauteur de la vegetation, et seuls 8 % des batiments portent une hauteur. Une « foret » a
              20 m peut etre un taillis de 5 m ;
            </li>
            <li>
              la <b>completude d OpenStreetMap</b> : un bois non cartographie n existe pas pour le calcul ;
            </li>
            <li>
              le <b>bruit RF local</b> et les interferences, qui degradent le seuil de reception reel
              au-dela de la sensibilite theorique du preset ;
            </li>
            <li>
              les <b>reflexions sur le sol</b> et la diffraction sur terrain lisse au-dela de l horizon,
              approximee par le bombement et une arete ;
            </li>
            <li>
              la <b>variabilite temporelle</b> : pluie, feuillaison, conduits tropospheriques.
            </li>
          </ul>
          <p className="pt-1">
            Toute simulation doit etre confirmee par un <b>test terrain avec deux noeuds reels</b>.
          </p>
        </div>
      )}
    </div>
  );
}
