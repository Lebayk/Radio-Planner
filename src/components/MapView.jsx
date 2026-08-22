import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { marginColor, heatRgb } from '../lib/colors.js';
import { destination, bearing, formatBearing } from '../lib/geo.js';
import { useI18n } from '../lib/i18n.js';

const BASE_LAYERS = (t) => ({
  [t('map.baseLayer.relief')]: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17,
    attribution:
      'Fond <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA) - donnees <a href="https://openstreetmap.org">OpenStreetMap</a>',
  }),
  [t('map.baseLayer.ignPlan')]: L.tileLayer(
    'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
      '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM' +
      '&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    { maxZoom: 19, attribution: 'Fond <a href="https://geoservices.ign.fr/">IGN</a> - Geoplateforme' }
  ),
  [t('map.baseLayer.ignAerial')]: L.tileLayer(
    'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
      '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM' +
      '&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}',
    { maxZoom: 19, attribution: 'Fond <a href="https://geoservices.ign.fr/">IGN</a> - Geoplateforme' }
  ),
  [t('map.baseLayer.osm')]: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: 'Donnees <a href="https://openstreetmap.org">OpenStreetMap</a>',
  }),
});

const siteIcon = (kind, text) => {
  const size = kind === 'relay' ? 30 : kind === 'candidate' ? 28 : 26;
  return L.divIcon({
    className: '',
    html: `<div class="site-marker site-marker--${kind}">${text}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

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
  const { t } = useI18n();
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({});
  const cbRef = useRef({});
  cbRef.current = { onMapClick, onSiteDrag, onCandidateClick };
  // Traductions lues dans les effets Leaflet (hors JSX) : capturees dans un
  // ref pour que les effets qui ne dependent pas de la langue n aient pas a
  // la lister dans leurs dependances, sans pour autant figer une traduction
  // perimee au premier rendu.
  const tRef = useRef(t);
  tRef.current = t;

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

    const bases = BASE_LAYERS(tRef.current);
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
        draggable: kind !== 'relay' && kind !== 'manual' && kind !== 'candidate',
        zIndexOffset: kind === 'relay' ? 500 : kind === 'candidate' ? 550 : 300,
      });
      m.on('dragend', (e) => {
        const ll = e.target.getLatLng();
        cbRef.current.onSiteDrag?.(kind, { lat: ll.lat, lon: ll.lng });
      });
      return m;
    };

    const chainDrawn = chain?.relays > 0;
    // Le relais/candidat unique (choisi dans le classement, ou clique sur la
    // carte) et le premier relais de la chaine auto-construite sont deux
    // choses **differentes**, presque toujours a des endroits differents : le
    // classement raisonne site par site, la chaine optimise l ensemble du
    // trajet. Les confondre - en cachant l un derriere l autre - a deja
    // induit en erreur un cap lu sur un site en regardant le marqueur d un
    // autre. Les deux sont donc toujours dessines, distinctement.
    const sameSpot =
      relay && chainDrawn && Math.abs(relay.lat - chain.nodes[1].lat) < 1e-6 && Math.abs(relay.lon - chain.nodes[1].lon) < 1e-6;

    const capLine = (labelKey, origin, target) =>
      target ? `<br>${t('map.tooltip.cap')}${labelKey ? t(labelKey) : ''}${formatBearing(bearing(origin, target))}` : '';

    const txCaps =
      relay && chainDrawn && !sameSpot
        ? capLine('map.tooltip.capChain', tx, chain.nodes[1]) + capLine('map.tooltip.capCandidate', tx, relay)
        : capLine(null, tx, chainDrawn ? chain.nodes[1] : relay || rx);
    const rxCaps =
      relay && chainDrawn && !sameSpot
        ? capLine('map.tooltip.capChain', rx, chain.nodes[chain.nodes.length - 2]) + capLine('map.tooltip.capCandidate', rx, relay)
        : capLine(null, rx, chainDrawn ? chain.nodes[chain.nodes.length - 2] : relay || tx);

    mk(tx, 'tx', 'TX')
      .bindTooltip(`${t('map.tooltip.txName', { name: tx.name })}${txCaps}`, { direction: 'top', offset: [0, -14] })
      .addTo(markers);
    mk(rx, 'rx', 'RX')
      .bindTooltip(`${t('map.tooltip.rxName', { name: rx.name })}${rxCaps}`, { direction: 'top', offset: [0, -14] })
      .addTo(markers);

    if (relay) {
      // Ambre et distinct du vert de la chaine des que les deux coexistent,
      // pour qu on ne confonde jamais visuellement les deux marqueurs.
      const kind = chainDrawn ? 'candidate' : 'relay';
      const m = mk(relay, kind, chainDrawn ? 'C' : 'REL');
      m.bindTooltip(
        `${chainDrawn ? t('map.tooltip.candidateInspected') : t('map.tooltip.relay')}` +
          t('map.tooltip.antenna', { h: relay.height }) +
          `<br>${t('map.tooltip.margin', { m: relay.margin?.toFixed(1) ?? '-' })}` +
          `<br>${t('map.tooltip.capToTx', { c: formatBearing(bearing(relay, tx)) })} · ${t('map.tooltip.capToRx', { c: formatBearing(bearing(relay, rx)) })}`,
        { direction: 'top', offset: [0, -16] }
      ).addTo(markers);

      const c1 = marginColor(relay.m1);
      const c2 = marginColor(relay.m2);
      L.polyline([[tx.lat, tx.lon], [relay.lat, relay.lon]], { color: c1, weight: 4, opacity: 0.95 }).addTo(links);
      L.polyline([[relay.lat, relay.lon], [rx.lat, rx.lon]], { color: c2, weight: 4, opacity: 0.95 }).addTo(links);
    }

    if (manual) {
      mk(manual, 'manual', 'PT')
        .bindTooltip(t('map.tooltip.forcedPoint'), { direction: 'top', offset: [0, -14] })
        .addTo(markers);
    }

    // Liaison directe, en pointilles : reference visuelle de l axe.
    L.polyline([[tx.lat, tx.lon], [rx.lat, rx.lon]], {
      color: '#64748b',
      weight: 1.5,
      opacity: 0.65,
      dashArray: '5 6',
    }).addTo(links);
  }, [tx, rx, relay, manual, chain, t]);

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
          `${t('map.tooltip.hopN', { n: i + 1, km: (hop?.distM / 1000).toFixed(2) })}<br>` +
            `${t('map.tooltip.cap')}${formatBearing(bearing(nodes[i], nodes[i + 1]))}<br>` +
            t('map.tooltip.margin95', { m: hop?.margin95?.toFixed(1) ?? '-' }),
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
          `${t('map.tooltip.relayN', { n: i, h: n.height })}<br>${t('map.tooltip.ground', { e: n.elev?.toFixed(0) })}<br>` +
            `${t('map.tooltip.cap')}← ${formatBearing(bearing(n, nodes[i - 1]))} · ${t('map.tooltip.cap')}→ ${formatBearing(bearing(n, nodes[i + 1]))}`,
          { direction: 'top', offset: [0, -16] }
        )
        .addTo(st.groups.chain);
    });
  }, [chain, t]);

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
        `<b>${t('map.tooltip.candidateHeader', { n: i + 1, m: c.best.margin.toFixed(1) })}</b><br>` +
          `${t('map.tooltip.candidateAntenna', { h: c.best.h, e: c.elev.toFixed(0) })}<br>` +
          t('map.tooltip.candidateHops', { m1: c.best.m1.toFixed(1), m2: c.best.m2.toFixed(1) }),
        { direction: 'top', offset: [0, -6] }
      );
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        cbRef.current.onCandidateClick?.(c, i);
      });
      m.addTo(st.groups.candidates);
    });
  }, [candidates, showCandidates, t]);

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
      { c: '#22c55e', t: t('map.legend.high') },
      { c: '#f59e0b', t: t('map.legend.mid') },
      { c: '#ef4444', t: t('map.legend.low') },
      { c: '#22c55e', t: t('map.legend.reliable'), ring: true },
      { c: '#f59e0b', t: t('map.legend.limited'), ring: true },
    ],
    [t]
  );

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />

      <div className="pointer-events-none absolute bottom-6 right-3 z-[500] rounded-lg border border-ink-500/80 bg-ink-900/85 px-2.5 py-2 text-[10px] backdrop-blur">
        <div className="mb-1 font-semibold uppercase tracking-wide text-zinc-500">{t('map.quality')}</div>
        {legend.map((l, i) => (
          <div key={i} className="flex items-center gap-1.5 leading-relaxed text-zinc-400">
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
        title={t('map.placeBothTitle')}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" strokeLinejoin="round" />
          <circle cx="12" cy="10" r="2.4" />
        </svg>
        {pickMode === 'both' ? t('map.cancel') : t('map.placeBoth')}
      </button>

      {/* Recadrage : filet de securite permanent. Une chaine de relais peut
          sortir du cadre initial, et rien n est plus deroutant qu un relais
          calcule mais invisible. */}
      <button
        type="button"
        onClick={recenter}
        className="flex items-center gap-1.5 rounded-md border border-ink-500 bg-ink-800/90 px-2 py-1.5 text-[11px] font-medium text-zinc-300 shadow-lg backdrop-blur transition hover:bg-ink-600 hover:text-zinc-100"
        title={t('map.recenterTitle')}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" strokeLinecap="round" />
        </svg>
        {t('map.recenter')}
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
            title={coverage ? t('map.toggleCoverageTitle') : t('map.runCoverageTitle')}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="2.5" />
              <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 19.1a10 10 0 0 0 0-14.2" strokeLinecap="round" />
            </svg>
            {coverageBusy
              ? coverageProgress
                ? t('map.coverageProgress', { done: coverageProgress.done, total: coverageProgress.total })
                : t('map.calculating')
              : coverage
                ? showCoverage
                  ? t('map.coverageShown')
                  : t('map.coverageHidden')
                : t('map.calculateCoverage')}
          </button>

          {!coverage && !coverageBusy && (
            <span className="max-w-[190px] rounded bg-ink-900/85 px-1.5 py-1 text-[10px] leading-snug text-zinc-500 backdrop-blur">
              {coverageStale ? t('map.staleParams') : t('map.needsDownload')}
            </span>
          )}
        </div>
      )}

      </div>

      {pickMode && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[1001] -translate-x-1/2 rounded-full border border-sky-500/50 bg-sky-500/20 px-3 py-1.5 text-[11px] font-medium text-sky-100 shadow-lg backdrop-blur">
          {pickMode === 'both' && (
            <>
              {pickStep === 0 ? t('map.pick.tx1of2') : t('map.pick.rx2of2')}
              <span className="ml-2 text-sky-300/70">{t('map.pick.escape')}</span>
            </>
          )}
          {pickMode === 'manual' && t('map.pick.manual')}
          {(pickMode === 'tx' || pickMode === 'rx') && (
            <>
              {pickMode === 'tx' ? t('map.pick.tx') : t('map.pick.rx')}
              <span className="ml-2 text-sky-300/70">{t('map.pick.escape')}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
