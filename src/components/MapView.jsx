import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { marginColor, heatRgb } from '../lib/colors.js';
import { destination, bearing, formatBearing } from '../lib/geo.js';

const BASE_LAYERS = () => ({
  'Relief (OpenTopoMap)': L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution:
      'Fond <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA) - donnees <a href="https://openstreetmap.org">OpenStreetMap</a>',
  }),
  'Plan IGN': L.tileLayer(
    'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
      '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM' +
      '&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    { maxZoom: 19, attribution: 'Fond <a href="https://geoservices.ign.fr/">IGN</a> - Geoplateforme' }
  ),
  'Photo aerienne IGN': L.tileLayer(
    'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
      '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM' +
      '&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    { maxZoom: 19, attribution: 'Fond <a href="https://geoservices.ign.fr/">IGN</a> - Geoplateforme' }
  ),
  'OpenStreetMap': L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: 'Donnees <a href="https://openstreetmap.org">OpenStreetMap</a>',
  }),
});

const siteIcon = (kind, text) =>
  L.divIcon({
    className: '',
    html: `<div class="site-marker site-marker--${kind}">${text}</div>`,
    iconSize: kind === 'relay' ? [30, 30] : [26, 26],
    iconAnchor: kind === 'relay' ? [15, 15] : [13, 13],
  });

/** Contour du corridor de recherche : capsule autour du segment TX-RX. */
function corridorPolygon(tx, rx, radius, steps = 24) {
  const brg = bearing(tx, rx);
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    pts.push(destination(rx, brg - 90 + (180 * i) / steps, radius));
  }
  for (let i = 0; i <= steps; i++) {
    pts.push(destination(tx, brg + 90 + (180 * i) / steps, radius));
  }
  return pts.map((p) => [p.lat, p.lon]);
}

/** Rendu de la carte de chaleur dans un canvas, puis pose en imageOverlay. */
function heatDataUrl(grid, heat) {
  const c = document.createElement('canvas');
  c.width = grid.nx;
  c.height = grid.ny;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(grid.nx, grid.ny);
  for (let iy = 0; iy < grid.ny; iy++) {
    // La ligne 0 de la grille est au sud, la ligne 0 du canvas est au nord.
    const row = grid.ny - 1 - iy;
    for (let ix = 0; ix < grid.nx; ix++) {
      const v = heat[iy * grid.nx + ix];
      const o = (row * grid.nx + ix) * 4;
      const rgb = heatRgb(v);
      if (!rgb) {
        img.data[o + 3] = 0;
        continue;
      }
      img.data[o] = rgb[0];
      img.data[o + 1] = rgb[1];
      img.data[o + 2] = rgb[2];
      img.data[o + 3] = 190;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

export default function MapView({
  tx,
  rx,
  relay,
  manual,
  candidates,
  grid,
  heat,
  coverage,
  chain,
  radius,
  showHeat,
  showCandidates,
  showCoverage,
  coverageBusy,
  coverageProgress,
  coverageStale,
  onRunCoverage,
  onToggleCoverage,
  pickMode,
  pickStep,
  onStartPickBoth,
  onMapClick,
  onSiteDrag,
  onCandidateClick,
  focus,
}) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({});
  const cbRef = useRef({});
  cbRef.current = { onMapClick, onSiteDrag, onCandidateClick };

  // --- Initialisation ------------------------------------------------------
  useEffect(() => {
    // Rendu SVG et non Canvas : le renderer Canvas de Leaflet planifie ses
    // redessins en requestAnimationFrame et plante si la carte est detruite
    // entre la planification et l execution (« Cannot read properties of
    // undefined (reading 'clearRect') »). Avec au plus quelques dizaines de
    // vecteurs, SVG est aussi rapide et sans surprise.
    const map = L.map(hostRef.current, {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: false,
    }).setView([tx.lat, tx.lon], 13);

    const bases = BASE_LAYERS();
    Object.values(bases)[0].addTo(map);
    L.control.layers(bases, {}, { position: 'topright', collapsed: true }).addTo(map);
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

    const groups = {
      heat: L.layerGroup().addTo(map),
      chain: L.layerGroup().addTo(map),
      coverage: L.layerGroup().addTo(map),
      corridor: L.layerGroup().addTo(map),
      candidates: L.layerGroup().addTo(map),
      links: L.layerGroup().addTo(map),
      markers: L.layerGroup().addTo(map),
    };
    const state = { map, groups, alive: true };
    layersRef.current = state;
    mapRef.current = map;

    map.on('click', (e) => cbRef.current.onMapClick?.({ lat: e.latlng.lat, lon: e.latlng.lng }));

    // Le conteneur est souvent monte avant d avoir sa taille definitive.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(hostRef.current);

    return () => {
      // L ordre compte : on invalide d abord l etat pour que tout effet
      // declenche pendant le demontage se retire immediatement.
      state.alive = false;
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Curseur selon le mode de selection -----------------------------------
  useEffect(() => {
    const el = hostRef.current;
    // Le viseur n est affiche que pour un placement explicite de site :
    // en mode "point force" le clic reste possible sans changer le curseur.
    const placing = pickMode === 'tx' || pickMode === 'rx' || pickMode === 'both';
    if (el) el.style.cursor = placing ? 'crosshair' : '';
  }, [pickMode]);

  // --- Marqueurs et liaisons ------------------------------------------------
  useEffect(() => {
    const st = layersRef.current;
    if (!st?.alive) return;
    const { markers, links } = st.groups;
    markers.clearLayers();
    links.clearLayers();

    const mk = (site, kind, label) => {
      const m = L.marker([site.lat, site.lon], {
        icon: siteIcon(kind, label),
        draggable: kind !== 'relay' && kind !== 'manual',
        zIndexOffset: kind === 'relay' ? 500 : 300,
      });
      m.on('dragend', (e) => {
        const ll = e.target.getLatLng();
        cbRef.current.onSiteDrag?.(kind, { lat: ll.lat, lon: ll.lng });
      });
      return m;
    };

    // Quand une chaine est tracee, le relais unique et ses deux segments
    // feraient doublon par-dessus.
    const chainDrawn = chain?.relays > 0;

    // Cap exact a viser depuis TX et RX : vers le premier relais de la
    // chaine s il y en a une, sinon vers le relais unique, sinon l un vers
    // l autre en liaison directe.
    const txTarget = chainDrawn ? chain.nodes[1] : relay || rx;
    const rxTarget = chainDrawn ? chain.nodes[chain.nodes.length - 2] : relay || tx;
    // Origine passee explicitement : txTarget et rxTarget pointent souvent
    // vers le meme relais unique, un test d egalite de reference se serait
    // trompe de sens pour l un des deux caps.
    const capLine = (origin, target) =>
      target ? `<br>cap ${formatBearing(bearing(origin, target))}` : '';

    mk(tx, 'tx', 'TX')
      .bindTooltip(`${tx.name} (TX)${capLine(tx, txTarget)}`, { direction: 'top', offset: [0, -14] })
      .addTo(markers);
    mk(rx, 'rx', 'RX')
      .bindTooltip(`${rx.name} (RX)${capLine(rx, rxTarget)}`, { direction: 'top', offset: [0, -14] })
      .addTo(markers);

    if (relay && !chainDrawn) {
      const m = mk(relay, 'relay', 'REL');
      m.bindTooltip(
        `Relais - antenne ${relay.height} m<br>marge ${relay.margin?.toFixed(1) ?? '-'} dB` +
          `<br>cap ← ${formatBearing(bearing(relay, tx))} · cap → ${formatBearing(bearing(relay, rx))}`,
        { direction: 'top', offset: [0, -16] }
      ).addTo(markers);

      const c1 = marginColor(relay.m1);
      const c2 = marginColor(relay.m2);
      L.polyline([[tx.lat, tx.lon], [relay.lat, relay.lon]], { color: c1, weight: 4, opacity: 0.95 }).addTo(links);
      L.polyline([[relay.lat, relay.lon], [rx.lat, rx.lon]], { color: c2, weight: 4, opacity: 0.95 }).addTo(links);
    }

    if (manual) {
      mk(manual, 'manual', 'PT')
        .bindTooltip('Point force', { direction: 'top', offset: [0, -14] })
        .addTo(markers);
    }

    // Liaison directe, en pointilles : reference visuelle de l axe.
    L.polyline([[tx.lat, tx.lon], [rx.lat, rx.lon]], {
      color: '#64748b',
      weight: 1.5,
      opacity: 0.65,
      dashArray: '5 6',
    }).addTo(links);
  }, [tx, rx, relay, manual, chain]);

  // --- Chaine de relais -----------------------------------------------------
  useEffect(() => {
    const st = layersRef.current;
    if (!st?.alive) return;
    st.groups.chain.clearLayers();
    if (!chain?.nodes?.length || chain.relays === 0) return;

    const nodes = chain.nodes;
    for (let i = 0; i < nodes.length - 1; i++) {
      const hop = chain.hops?.[i];
      L.polyline(
        [
          [nodes[i].lat, nodes[i].lon],
          [nodes[i + 1].lat, nodes[i + 1].lon],
        ],
        { color: marginColor(hop?.margin95), weight: 4, opacity: 0.95 }
      )
        .bindTooltip(
          `Bond ${i + 1} : ${(hop?.distM / 1000).toFixed(2)} km<br>` +
            `cap ${formatBearing(bearing(nodes[i], nodes[i + 1]))}<br>` +
            `marge 95 % ${hop?.margin95?.toFixed(1) ?? '-'} dB`,
          { sticky: true }
        )
        .addTo(st.groups.chain);
    }

    nodes.forEach((n, i) => {
      if (!n.relay) return;
      L.marker([n.lat, n.lon], {
        icon: siteIcon('relay', `R${i}`),
        zIndexOffset: 600,
      })
        .bindTooltip(
          `Relais R${i} - antenne ${n.height} m<br>sol ${n.elev?.toFixed(0)} m<br>` +
            `cap ← ${formatBearing(bearing(n, nodes[i - 1]))} · cap → ${formatBearing(bearing(n, nodes[i + 1]))}`,
          { direction: 'top', offset: [0, -16] }
        )
        .addTo(st.groups.chain);
    });
  }, [chain]);

  // --- Corridor de recherche ------------------------------------------------
  useEffect(() => {
    const st = layersRef.current;
    if (!st?.alive) return;
    st.groups.corridor.clearLayers();
    if (!radius) return;
    L.polygon(corridorPolygon(tx, rx, radius), {
      color: '#38bdf8',
      weight: 1,
      opacity: 0.5,
      fill: true,
      fillColor: '#38bdf8',
      fillOpacity: 0.045,
      interactive: false,
    }).addTo(st.groups.corridor);
  }, [tx, rx, radius]);

  // --- Carte de chaleur -----------------------------------------------------
  useEffect(() => {
    const st = layersRef.current;
    if (!st?.alive) return;
    st.groups.heat.clearLayers();
    if (!showHeat || !grid || !heat) return;
    const bounds = L.latLngBounds(
      [grid.lat0, grid.lon0],
      [grid.lat0 + (grid.ny - 1) * grid.dLat, grid.lon0 + (grid.nx - 1) * grid.dLon]
    );
    L.imageOverlay(heatDataUrl(grid, heat), bounds, {
      opacity: 0.72,
      interactive: false,
      className: 'heat-overlay',
    }).addTo(st.groups.heat);
  }, [grid, heat, showHeat]);

  // --- Enveloppe de portee du relais ----------------------------------------
  useEffect(() => {
    const st = layersRef.current;
    if (!st?.alive) return;
    st.groups.coverage.clearLayers();
    if (!showCoverage || !coverage?.rings?.length || !relay) return;

    // Du plus large au plus etroit, pour que la zone fiable reste lisible
    // par-dessus la zone de reception limite.
    const ordered = [...coverage.rings].sort((a, b) => a.threshold - b.threshold);
    for (const ring of ordered) {
      const strong = ring.threshold > 0;
      L.polygon(ring.polygon, {
        color: strong ? '#22c55e' : '#f59e0b',
        weight: strong ? 2 : 1.5,
        opacity: strong ? 0.9 : 0.7,
        dashArray: strong ? null : '6 5',
        fillColor: strong ? '#22c55e' : '#f59e0b',
        fillOpacity: strong ? 0.14 : 0.07,
        interactive: false,
      }).addTo(st.groups.coverage);
    }

    // Cercle de reference : l horizon geometrique des seules antennes. L ecart
    // entre ce cercle et l enveloppe est exactement ce que coute le relief.
    if (coverage.horizonM > 0) {
      L.circle([relay.lat, relay.lon], {
        radius: coverage.horizonM,
        color: '#94a3b8',
        weight: 1,
        opacity: 0.55,
        dashArray: '2 7',
        fill: false,
        interactive: false,
      }).addTo(st.groups.coverage);
    }
  }, [coverage, showCoverage, relay]);

  // --- Candidats alternatifs ------------------------------------------------
  useEffect(() => {
    const st = layersRef.current;
    if (!st?.alive) return;
    st.groups.candidates.clearLayers();
    if (!showCandidates || !candidates?.length) return;

    candidates.forEach((c, i) => {
      const isTop = i < 5;
      const m = L.circleMarker([c.lat, c.lon], {
        radius: isTop ? 7 : 4,
        color: '#0b0e14',
        weight: isTop ? 2 : 1,
        fillColor: marginColor(c.best.margin),
        fillOpacity: isTop ? 1 : 0.75,
      });
      m.bindTooltip(
        `<b>#${i + 1}</b> - marge ${c.best.margin.toFixed(1)} dB<br>` +
          `antenne ${c.best.h} m - alt. ${c.elev.toFixed(0)} m<br>` +
          `bond 1 ${c.best.m1.toFixed(1)} dB / bond 2 ${c.best.m2.toFixed(1)} dB`,
        { direction: 'top', offset: [0, -6] }
      );
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        cbRef.current.onCandidateClick?.(c, i);
      });
      m.addTo(st.groups.candidates);
    });
  }, [candidates, showCandidates]);

  /**
   * Bornes de tout ce qui constitue la liaison.
   *
   * Ne cadrer que sur TX, RX et le relais unique laissait les relais de la
   * chaine hors du volet : ils etaient bien dessines, simplement au-dessus du
   * cadre visible.
   */
  const linkBounds = useCallback(() => {
    const b = L.latLngBounds([tx.lat, tx.lon], [rx.lat, rx.lon]);
    if (relay) b.extend([relay.lat, relay.lon]);
    if (manual) b.extend([manual.lat, manual.lon]);
    for (const n of chain?.nodes ?? []) b.extend([n.lat, n.lon]);
    return b;
  }, [tx, rx, relay, manual, chain]);

  /** Recadrage a la demande : le filet de securite quand tout a bouge. */
  const recenter = useCallback(() => {
    const map = mapRef.current;
    if (!map || !layersRef.current?.alive) return;
    map.fitBounds(linkBounds(), { padding: [45, 45], maxZoom: 16, animate: false });
  }, [linkBounds]);

  // --- Recadrage ------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersRef.current?.alive || !focus) return;
    if (focus.type === 'fit') {
      map.fitBounds(linkBounds(), { padding: [45, 45], maxZoom: 16, animate: false });
    } else if (focus.type === 'bounds' && focus.points?.length) {
      const b = L.latLngBounds(focus.points);
      b.extend([relay?.lat ?? tx.lat, relay?.lon ?? tx.lon]);
      map.fitBounds(b, { padding: [40, 40], animate: false });
    } else if (focus.type === 'point') {
      map.setView([focus.lat, focus.lon], Math.max(map.getZoom(), 15), { animate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  const legend = useMemo(
    () => [
      { c: '#22c55e', t: 'marge > 15 dB' },
      { c: '#f59e0b', t: '5 a 15 dB' },
      { c: '#ef4444', t: '< 5 dB' },
      { c: '#22c55e', t: 'portee fiable', ring: true },
      { c: '#f59e0b', t: 'reception limite', ring: true },
    ],
    []
  );

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />

      <div className="pointer-events-none absolute bottom-6 right-3 z-[500] rounded-lg border border-ink-500/80 bg-ink-900/85 px-2.5 py-2 text-[10px] backdrop-blur">
        <div className="mb-1 font-semibold uppercase tracking-wide text-zinc-500">Qualite</div>
        {legend.map((l) => (
          <div key={l.t} className="flex items-center gap-1.5 leading-relaxed text-zinc-400">
            <span
              className="h-2 w-2 rounded-full"
              style={
                l.ring
                  ? { border: `1.5px solid ${l.c}`, background: `${l.c}33` }
                  : { background: l.c }
              }
            />
            {l.t}
          </div>
        ))}
      </div>

      {/* Commandes de la carte, empilees sous le controle de zoom. Les
          positionner une a une en absolu se payait a chaque ajout. */}
      <div className="absolute left-[10px] top-[84px] z-[1001] flex flex-col items-start gap-1">
      {/* Placement des deux sites : le geste le plus courant, donc accessible
          directement sur la carte et pas seulement depuis le panneau. */}
      <button
        type="button"
        onClick={onStartPickBoth}
        className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium shadow-lg backdrop-blur transition ${
          pickMode === 'both'
            ? 'border-sky-400 bg-sky-600 text-white'
            : 'border-ink-500 bg-ink-800/90 text-zinc-300 hover:bg-ink-600 hover:text-zinc-100'
        }`}
        title="Definir l emetteur puis le recepteur par deux clics sur la carte"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" strokeLinejoin="round" />
          <circle cx="12" cy="10" r="2.4" />
        </svg>
        {pickMode === 'both' ? 'Annuler' : 'Placer TX + RX'}
      </button>

      {/* Recadrage : filet de securite permanent. Une chaine de relais peut
          sortir du cadre initial, et rien n est plus deroutant qu un relais
          calcule mais invisible. */}
      <button
        type="button"
        onClick={recenter}
        className="flex items-center gap-1.5 rounded-md border border-ink-500 bg-ink-800/90 px-2 py-1.5 text-[11px] font-medium text-zinc-300 shadow-lg backdrop-blur transition hover:bg-ink-600 hover:text-zinc-100"
        title="Recadrer sur toute la liaison, relais compris"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" strokeLinecap="round" />
        </svg>
        Recadrer
      </button>

      {/* Portee du relais : le calcul telecharge son propre relief, il reste
          donc explicite - mais la commande doit etre la ou l on regarde. */}
      {relay && (
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={coverage ? onToggleCoverage : onRunCoverage}
            disabled={coverageBusy}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium shadow-lg backdrop-blur transition disabled:opacity-70 ${
              coverage && showCoverage
                ? 'border-emerald-400 bg-emerald-600 text-white'
                : 'border-ink-500 bg-ink-800/90 text-zinc-300 hover:bg-ink-600 hover:text-zinc-100'
            }`}
            title={
              coverage
                ? 'Afficher ou masquer l enveloppe de portee'
                : 'Calculer la portee du relais sur le relief reel'
            }
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="2.5" />
              <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 19.1a10 10 0 0 0 0-14.2" strokeLinecap="round" />
            </svg>
            {coverageBusy
              ? coverageProgress
                ? `Portee ${coverageProgress.done}/${coverageProgress.total}`
                : 'Calcul...'
              : coverage
                ? showCoverage
                  ? 'Portee affichee'
                  : 'Portee masquee'
                : 'Calculer la portee'}
          </button>

          {!coverage && !coverageBusy && (
            <span className="max-w-[190px] rounded bg-ink-900/85 px-1.5 py-1 text-[10px] leading-snug text-zinc-500 backdrop-blur">
              {coverageStale
                ? 'Les parametres ont change : relancez le calcul.'
                : 'Necessite un telechargement de relief autour du relais.'}
            </span>
          )}
        </div>
      )}

      </div>

      {pickMode && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[1001] -translate-x-1/2 rounded-full border border-sky-500/50 bg-sky-500/20 px-3 py-1.5 text-[11px] font-medium text-sky-100 shadow-lg backdrop-blur">
          {pickMode === 'both' && (
            <>
              {pickStep === 0
                ? 'Cliquez pour placer l emetteur (1 sur 2)'
                : 'Cliquez pour placer le recepteur (2 sur 2)'}
              <span className="ml-2 text-sky-300/70">Echap pour annuler</span>
            </>
          )}
          {pickMode === 'manual' && 'Cliquez pour evaluer un emplacement precis'}
          {(pickMode === 'tx' || pickMode === 'rx') && (
            <>
              Cliquez pour placer {pickMode === 'tx' ? 'l emetteur' : 'le recepteur'}
              <span className="ml-2 text-sky-300/70">Echap pour annuler</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
