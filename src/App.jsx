import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import MapView from './components/MapView.jsx';
import SitePanel from './components/SitePanel.jsx';
import RadioPanel from './components/RadioPanel.jsx';
import SearchPanel from './components/SearchPanel.jsx';
import ResultsTable from './components/ResultsTable.jsx';
import ProfileChart from './components/ProfileChart.jsx';
import HeightChart from './components/HeightChart.jsx';
import LinkSummary from './components/LinkSummary.jsx';
import Disclaimer from './components/Disclaimer.jsx';
import CoveragePanel from './components/CoveragePanel.jsx';
import ChainPanel from './components/ChainPanel.jsx';
import AreaPanel from './components/AreaPanel.jsx';
import AreaResults from './components/AreaResults.jsx';
import { Section, Checkbox, Banner, Progress, Spinner, MarginChip, DropdownMenu } from './components/ui.jsx';

import { loadConfig, saveConfig, resetConfig } from './lib/storage.js';
import { buildGridSpec, buildMask, maskedPoints, sampleGrid, minFeasibleStep, maxFeasibleRadius } from './lib/dem.js';
import { fetchElevations, estimateRequests, cacheStats, clearCache, PROVIDER_BY_ID } from './lib/elevation.js';
import { haversine, bearing } from './lib/geo.js';
import { DEVICE_BY_ID, PRESET_BY_ID } from './lib/radio.js';
import { analyzeSite, heightSweep, analyzeDirect, profileFromGrid, clutterProfiles, getHopProfiles, pinProfiles } from './lib/analysis.js';
import { fetchClutter, estimateClutter, gridBbox, clutterSummary } from './lib/clutter.js';
import { normalizeZone, zoneGrid, zonePointGrid, planArea, zoneMetrics } from './lib/area.js';
import { loadRoads, nearestRoad, bboxAround, clearRoadCache } from './lib/osm.js';
import { exportGpx, exportKml, exportPdf, exportXlsx, preloadPdf } from './lib/exporters.js';
import { renderCoverageMapPNG } from './lib/mapRender.js';
import { useI18n } from './lib/i18n.js';
import {
  buildRays,
  computeCoverage,
  estimateCoverage,
  freeSpaceRangeM,
  radioHorizonM,
  samplesForRadius,
} from './lib/coverage.js';

const MAX_CELLS = 400000;

/** Signature des entrees : sert a marquer les resultats comme perimes. */
const signature = (c) =>
  JSON.stringify([c.tx.lat, c.tx.lon, c.tx.height, c.tx.gain, c.rx.lat, c.rx.lon, c.rx.height, c.rx.gain, c.radio, c.search, c.provider]);

export default function App() {
  const { t, lang, setLang, locale } = useI18n();
  const [config, setConfig] = useState(loadConfig);
  const [elev, setElev] = useState({ tx: NaN, rx: NaN });
  const [elevBusy, setElevBusy] = useState(false);

  const [phase, setPhase] = useState('idle'); // idle | dem | scan | ready
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);

  const [scan, setScan] = useState(null); // { grid, dem, heat, top, stats, sig }
  const [selected, setSelected] = useState(0);
  const [detail, setDetail] = useState(null);
  const [direct, setDirect] = useState(null);
  const [manual, setManual] = useState(null); // { lat, lon, elev, detail }
  const [manualBusy, setManualBusy] = useState(false);

  const [cover, setCover] = useState(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverProgress, setCoverProgress] = useState(null);
  const [coverStale, setCoverStale] = useState(false);
  const [coverPending, setCoverPending] = useState(false);

  const [roads, setRoads] = useState([]);
  const [roadsBusy, setRoadsBusy] = useState(false);

  // Recherche du meilleur relais pour couvrir une zone : etat independant du
  // balayage TX-RX, les deux repondent a des questions differentes.
  const [zonePending, setZonePending] = useState(null); // premier coin pose
  const [areaResult, setAreaResult] = useState(null);
  const [areaBusy, setAreaBusy] = useState(false);
  const [areaProgress, setAreaProgress] = useState(null);

  const [pickMode, setPickMode] = useState(null); // 'tx' | 'rx' | 'both'
  const [pickStep, setPickStep] = useState(0); // avancement du placement en deux clics
  const [focus, setFocus] = useState({ type: 'fit', n: 0 });
  const [tab, setTab] = useState('map');
  const [discOpen, setDiscOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFiles, setExportFiles] = useState(null);
  const [exportError, setExportError] = useState(null);

  const workerRef = useRef(null);
  const areaWorkerRef = useRef(null);
  const abortRef = useRef(null);
  const chartsRef = useRef({});
  const exportBtnRef = useRef(null);
  const coverRef = useRef(null);
  coverRef.current = cover;

  const { tx, rx, radio, search, provider } = config;
  const txSite = useMemo(() => ({ ...tx, elev: elev.tx }), [tx, elev.tx]);
  const rxSite = useMemo(() => ({ ...rx, elev: elev.rx }), [rx, elev.rx]);
  const linkLength = useMemo(() => haversine(tx, rx), [tx.lat, tx.lon, rx.lat, rx.lon]);
  // Cap direct TX -> RX : reperage utile des la saisie des deux sites, avant
  // meme de savoir si un relais sera necessaire.
  const linkBearing = useMemo(() => bearing(tx, rx), [tx.lat, tx.lon, rx.lat, rx.lon]);

  const patch = useCallback((key, value) => setConfig((c) => ({ ...c, [key]: value })), []);

  /**
   * Modification d un site. Toucher au gain d antenne invalide le profil
   * materiel selectionne : continuer a afficher un nom de materiel dont les
   * caracteristiques ont ete modifiees induirait en erreur.
   */
  const patchSite = useCallback(
    (key, value) =>
      setConfig((c) => ({
        ...c,
        [key]: value,
        radio:
          value.gain !== c[key].gain && c.radio.device !== 'custom'
            ? { ...c.radio, device: 'custom' }
            : c.radio,
      })),
    []
  );

  /** Applique un profil materiel a TX, RX et au relais d un seul geste. */
  const applyDevice = useCallback((deviceId) => {
    const d = DEVICE_BY_ID[deviceId];
    setConfig((c) => {
      if (!d || d.custom) return { ...c, radio: { ...c.radio, device: 'custom' } };
      return {
        ...c,
        tx: { ...c.tx, gain: d.gain },
        rx: { ...c.rx, gain: d.gain },
        radio: {
          ...c.radio,
          device: d.id,
          power: d.power,
          relayPower: d.power,
          relayGain: d.gain,
          cableLoss: d.cableLoss,
        },
      };
    });
  }, []);

  const toggleCoverageLayer = useCallback(
    () => setConfig((c) => ({ ...c, ui: { ...c.ui, coverage: !c.ui.coverage } })),
    []
  );

  /**
   * Elargit le rayon d exploration puis relance le calcul.
   *
   * Le relancer directement rejouerait la fonction capturee avec l ancien
   * rayon : on pose un drapeau, et l effet plus bas declenche le calcul une
   * fois la nouvelle configuration appliquee.
   */
  const extendCoverage = useCallback((radiusKm) => {
    setConfig((c) => ({ ...c, coverage: { ...c.coverage, radiusKm } }));
    setCoverPending(true);
  }, []);

  /** Placement enchaine de TX puis RX par deux clics sur la carte. */
  const startPickBoth = useCallback(() => {
    setPickMode((m) => (m === 'both' ? null : 'both'));
    setPickStep(0);
  }, []);

  // Echap annule tout mode de placement en cours.
  useEffect(() => {
    if (!pickMode) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setPickMode(null);
        setPickStep(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickMode]);

  // --- Persistance ---------------------------------------------------------
  useEffect(() => {
    saveConfig(config);
  }, [config]);

  // --- Altitude des deux sites fixes ---------------------------------------
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setElevBusy(true);
      try {
        const { values } = await fetchElevations(provider, [
          { lat: tx.lat, lon: tx.lon },
          { lat: rx.lat, lon: rx.lon },
        ]);
        if (!cancelled) setElev({ tx: values[0], rx: values[1] });
      } catch (e) {
        if (!cancelled) setWarnings((w) => [...new Set([...w, `warn:elevUnavailable:${e.message}`])]);
      } finally {
        if (!cancelled) setElevBusy(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [tx.lat, tx.lon, rx.lat, rx.lon, provider]);

  // --- Estimation du volume de telechargement ------------------------------
  const estimate = useMemo(() => {
    try {
      const grid = buildGridSpec(tx, rx, search.radius, search.step);
      if (grid.nx * grid.ny > MAX_CELLS) {
        // Plutot que de se contenter d un refus, on calcule tout de suite de
        // combien il faudrait relacher le pas ou le rayon : l utilisateur
        // corrige d un clic au lieu de tatonner par essais-erreurs.
        return {
          points: Infinity,
          cached: 0,
          requests: Infinity,
          tooBig: true,
          grid,
          suggestedStep: Math.ceil(minFeasibleStep(tx, rx, search.radius, MAX_CELLS, search.step) / 5) * 5,
          suggestedRadius: (() => {
            const r = maxFeasibleRadius(tx, rx, search.step, MAX_CELLS, search.radius);
            return r === null ? null : Math.max(50, Math.floor(r / 10) * 10);
          })(),
        };
      }
      const mask = buildMask(grid, tx, rx);
      const pts = maskedPoints(grid, mask);
      const { missing, requests, seconds } = estimateRequests(provider, pts);
      return { points: pts.length, cached: pts.length - missing, requests, seconds, grid, mask, pts };
    } catch {
      return { points: 0, cached: 0, requests: 0, seconds: 0 };
    }
  }, [tx.lat, tx.lon, rx.lat, rx.lon, search.radius, search.step, provider]);

  const stale = scan && scan.sig !== signature(config);

  // --- Balayage ------------------------------------------------------------
  const cancelScan = useCallback(() => {
    abortRef.current?.abort();
    workerRef.current?.terminate();
    workerRef.current = null;
    // Le meme bouton annule le balayage TX-RX ou la recherche de zone, selon
    // celui en cours : oublier l un des deux laisserait son etat "occupe"
    // bloque indefiniment si l utilisateur annule pendant sa phase calcul.
    areaWorkerRef.current?.terminate();
    areaWorkerRef.current = null;
    setPhase('idle');
    setAreaBusy(false);
    setAreaProgress(null);
    setProgress(null);
  }, []);

  const runScan = useCallback(async () => {
    if (!search.heights.length) {
      setError(t('app.error.needHeight'));
      return;
    }
    if (estimate.tooBig) {
      setError(t('app.error.tooBig'));
      return;
    }
    if (linkLength < 200) {
      setError(t('app.error.tooClose'));
      return;
    }

    setError(null);
    setWarnings([]);
    setDetail(null);
    setManual(null);
    setRoads([]);
    setPhase('dem');

    const ctl = new AbortController();
    abortRef.current = ctl;

    try {
      const grid = estimate.grid ?? buildGridSpec(tx, rx, search.radius, search.step);
      const mask = estimate.mask ?? buildMask(grid, tx, rx);
      const pts = estimate.pts ?? maskedPoints(grid, mask);

      setProgress({ label: t('app.progress.elevation'), value: 0, total: Math.max(1, estimate.requests) });

      const { values, warnings: w1 } = await fetchElevations(provider, pts, {
        signal: ctl.signal,
        onProgress: ({ done, total, cached }) =>
          setProgress({
            label:
              total === 0
                ? t('app.progress.elevationCached', { n: cached.toLocaleString(locale) })
                : t('app.progress.elevationDl', { done, total }),
            value: total === 0 ? 1 : done,
            total: total === 0 ? 1 : total,
          }),
      });

      // Reconstitution de la grille complete (NaN hors corridor).
      const dem = new Float32Array(grid.nx * grid.ny).fill(NaN);
      for (let i = 0; i < pts.length; i++) dem[pts[i].idx] = values[i];

      // Altitudes ponctuelles des deux sites fixes, plus fiables que la grille.
      const { values: ends } = await fetchElevations(
        provider,
        [
          { lat: tx.lat, lon: tx.lon },
          { lat: rx.lat, lon: rx.lon },
        ],
        { signal: ctl.signal }
      );
      const txElev = Number.isFinite(ends[0]) ? ends[0] : NaN;
      const rxElev = Number.isFinite(ends[1]) ? ends[1] : NaN;
      setElev({ tx: txElev, rx: rxElev });

      if (!Number.isFinite(txElev) || !Number.isFinite(rxElev)) {
        throw new Error(t('app.warn.elevMissing'));
      }

      // --- Couverture du sol -------------------------------------------
      // Le MNT ne connait que le sol nu ; sans cette etape la vegetation et le
      // bati manquent au bilan, soit l essentiel de l erreur du modele.
      let clutter = null;
      if (search.clutter) {
        setPhase('clutter');
        const est = estimateClutter(gridBbox(grid), search.buildings ? gridBbox(grid) : null);
        setProgress({ label: t('app.progress.clutter'), value: 0, total: Math.max(1, est.tiles) });
        try {
          clutter = await fetchClutter({
            grid,
            buildingBbox: search.buildings ? gridBbox(grid) : null,
            signal: ctl.signal,
            onProgress: ({ done, total, layer, waitingMs }) =>
              setProgress({
                label: waitingMs
                  ? t('app.progress.clutterQuota', { s: Math.round(waitingMs / 1000) })
                  : layer === 'cache'
                    ? t('app.progress.clutterCached')
                    : t('app.progress.clutterLayer', { layer, done, total }),
                value: done,
                total,
              }),
          });
          if (clutter.stats?.unavailable) {
            setWarnings((w) => [...w, t('app.warn.overpassUnavailable')]);
          } else if (clutter.stats?.failed) {
            setWarnings((w) => [
              ...w,
              t('app.warn.overpassPartial', { failed: clutter.stats.failed, total: clutter.stats.tiles }),
            ]);
          }
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          // Le clutter est un raffinement : son echec ne doit pas emporter le
          // balayage, qui reste valable sur sol nu.
          setWarnings((w) => [...w, t('app.warn.clutterFailed', { msg: e.message })]);
        }
      }

      if (w1.length) setWarnings((w) => [...new Set([...w, ...w1])]);
      setPhase('scan');
      setProgress({ label: t('app.progress.candidates'), value: 0, total: 1 });

      workerRef.current?.terminate();
      const worker = new Worker(new URL('./workers/scan.worker.js', import.meta.url), { type: 'module' });
      workerRef.current = worker;

      worker.onmessage = (ev) => {
        const m = ev.data;
        if (m.type === 'progress') {
          setProgress({ label: t('app.progress.candidates'), value: m.done, total: m.total });
        } else if (m.type === 'done') {
          const sig = signature(config);
          setScan({
            grid,
            dem,
            clutter,
            heat: m.heat,
            top: m.top,
            chain: m.chain,
            stats: m.stats,
            sig,
            txElev,
            rxElev,
          });
          setSelected(0);
          setPhase('ready');
          setProgress(null);
          setFocus((f) => ({ type: 'fit', n: f.n + 1 }));
          if (!m.top.length) {
            setWarnings((w) => [...w, t('app.warn.noCandidate')]);
          }
          worker.terminate();
          workerRef.current = null;
        } else if (m.type === 'error') {
          setError(t('app.error.calc', { msg: m.message }));
          setPhase('idle');
          setProgress(null);
        }
      };
      worker.onerror = (e) => {
        setError(t('app.error.worker', { msg: e.message }));
        setPhase('idle');
        setProgress(null);
      };

      worker.postMessage({
        type: 'scan',
        grid,
        dem,
        clutter,
        tx: { ...tx, elev: txElev },
        rx: { ...rx, elev: rxElev },
        radio,
        search,
      });
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
      setPhase('idle');
      setProgress(null);
    }
  }, [config, estimate, linkLength, provider, radio, rx, search, tx, t, locale]);

  useEffect(() => () => workerRef.current?.terminate(), []);


  // --- Liaison directe, pour reference -------------------------------------
  useEffect(() => {
    if (!scan) return setDirect(null);
    const p = profileFromGrid(scan.grid, scan.dem, tx, rx);
    if (!p) return setDirect(null);
    p[0] = scan.txElev;
    p[p.length - 1] = scan.rxElev;
    setDirect(
      analyzeDirect({
        tx: txSite,
        rx: rxSite,
        radio,
        profile: p,
        clutter: clutterProfiles(scan.grid, scan.clutter, tx, rx, p.length),
      })
    );
  }, [scan, radio, txSite, rxSite, tx, rx]);

  // --- Detail du site selectionne ------------------------------------------
  const computeDetail = useCallback(
    (site, height) => {
      if (!scan) return null;
      const relay = { lat: site.lat, lon: site.lon };
      const p1 = profileFromGrid(scan.grid, scan.dem, tx, relay);
      const p2 = profileFromGrid(scan.grid, scan.dem, relay, rx);
      if (!p1 || !p2) return null;
      pinProfiles(p1, p2, scan.txElev, site.elev, scan.rxElev);
      const c1 = clutterProfiles(scan.grid, scan.clutter, tx, relay, p1.length);
      const c2 = clutterProfiles(scan.grid, scan.clutter, relay, rx, p2.length);
      const result = analyzeSite({ tx: txSite, rx: rxSite, relay, radio, p1, p2, c1, c2, height, detail: true });
      const sweep = heightSweep({ tx: txSite, rx: rxSite, relay, radio, p1, p2, c1, c2, from: 2, to: 20, step: 1 });
      return { result, sweep, site, height };
    },
    [scan, radio, txSite, rxSite, tx, rx]
  );

  useEffect(() => {
    if (!scan?.top?.length) return setDetail(null);
    const row = scan.top[Math.min(selected, scan.top.length - 1)];
    if (!row) return setDetail(null);
    setDetail(computeDetail(row, row.best.h));
  }, [scan, selected, computeDetail]);

  const setDetailHeight = (h) => {
    if (!detail) return;
    setDetail(computeDetail(detail.site, h));
  };

  // --- Distance a la route la plus proche ----------------------------------
  useEffect(() => {
    if (!scan?.top?.length) return;
    let cancelled = false;
    const ctl = new AbortController();
    const rows = scan.top.slice(0, 25);
    setRoadsBusy(true);
    (async () => {
      try {
        const bbox = bboxAround([tx, rx, ...rows], 600);
        const data = await loadRoads(bbox, ctl.signal);
        if (cancelled) return;
        setRoads(rows.map((r) => (data ? nearestRoad(r, data) : null)));
      } catch {
        if (!cancelled) setRoads(rows.map(() => null));
      } finally {
        if (!cancelled) setRoadsBusy(false);
      }
    })();
    return () => {
      cancelled = true;
      ctl.abort();
    };
  }, [scan, tx, rx]);

  // --- Clic sur la carte ---------------------------------------------------
  const onMapClick = useCallback(
    async (pt) => {
      const coords = { lat: +pt.lat.toFixed(6), lon: +pt.lon.toFixed(6) };

      if (pickMode === 'both') {
        if (pickStep === 0) {
          patch('tx', { ...config.tx, ...coords });
          setPickStep(1);
        } else {
          patch('rx', { ...config.rx, ...coords });
          setPickMode(null);
          setPickStep(0);
          setFocus((f) => ({ type: 'fit', n: f.n + 1 }));
        }
        return;
      }

      if (pickMode === 'zone') {
        if (pickStep === 0) {
          setZonePending(coords);
          setPickStep(1);
        } else {
          patch('area', { ...config.area, zone: normalizeZone(zonePending, coords) });
          setZonePending(null);
          setPickMode(null);
          setPickStep(0);
          // Une nouvelle zone perime le classement precedent : le garder
          // afficherait des emplacements calcules pour une autre surface.
          setAreaResult(null);
        }
        return;
      }

      if (pickMode === 'tx' || pickMode === 'rx') {
        patch(pickMode, { ...config[pickMode], ...coords });
        setPickMode(null);
        return;
      }
      if (!scan) return;
      setManualBusy(true);
      setPickMode(null);
      try {
        const height = detail?.height ?? search.heights[0] ?? 6;
        const relay = { lat: pt.lat, lon: pt.lon };
        const { p1, p2 } = await getHopProfiles({
          tx,
          rx,
          relay,
          grid: scan.grid,
          dem: scan.dem,
          providerId: provider,
          step: scan.grid.step,
        });
        const relayElev = p1[p1.length - 1];
        pinProfiles(p1, p2, scan.txElev, relayElev, scan.rxElev);
        const c1 = clutterProfiles(scan.grid, scan.clutter, tx, relay, p1.length);
        const c2 = clutterProfiles(scan.grid, scan.clutter, relay, rx, p2.length);
        const result = analyzeSite({ tx: txSite, rx: rxSite, relay, radio, p1, p2, c1, c2, height, detail: true });
        const sweep = heightSweep({ tx: txSite, rx: rxSite, relay, radio, p1, p2, c1, c2, from: 2, to: 20, step: 1 });
        setManual({ ...relay, elev: relayElev, result, sweep, height });
        setTab('results');
      } catch (e) {
        setError(t('app.error.evalPoint', { msg: e.message }));
      } finally {
        setManualBusy(false);
      }
    },
    [pickMode, pickStep, patch, config, scan, detail, search.heights, tx, rx, provider, txSite, rxSite, radio, t, zonePending]
  );

  // --- Meilleur emplacement pour couvrir une zone --------------------------

  /** Estimation du telechargement MNT propre a la zone. */
  const areaDemEstimate = useMemo(() => {
    const zone = config.area.zone;
    if (!zone) return null;
    try {
      const g = zoneGrid(zone, config.area.gridStep);
      if (g.nx * g.ny > MAX_CELLS) {
        // Meme correctif que pour le balayage TX-RX : plutot que de se
        // contenter d un refus, on calcule tout de suite de combien il
        // faudrait relacher le pas du relief.
        const corner1 = { lat: zone.latMin, lon: zone.lonMin };
        const corner2 = { lat: zone.latMax, lon: zone.lonMax };
        const suggestedGridStep =
          Math.ceil(minFeasibleStep(corner1, corner2, 0, MAX_CELLS, config.area.gridStep) / 5) * 5;
        return { tooBig: true, points: g.nx * g.ny, suggestedGridStep };
      }
      const pts = maskedPoints(g, new Uint8Array(g.nx * g.ny).fill(1));
      const { requests, seconds } = estimateRequests(provider, pts);
      return { points: pts.length, requests, seconds, grid: g, pts };
    } catch {
      return null;
    }
  }, [config.area.zone, config.area.gridStep, provider]);

  /**
   * Portee exploree autour de chaque emplacement, et horizon radio de
   * reference.
   *
   * La portee en espace libre ne borne rien en LoRa : elle depasse le millier
   * de kilometres. La borne utile est l horizon radio, au-dela duquel le
   * bombement terrestre coupe seul la liaison. La valeur reste reglable, mais
   * l horizon est affiche a cote pour que le choix soit informe.
   */
  const areaHorizonM = useMemo(
    () => radioHorizonM(config.area.relayHeight, config.coverage.nodeHeight),
    [config.area.relayHeight, config.coverage.nodeHeight]
  );
  const areaMaxRangeM = useMemo(
    () =>
      Math.min(
        (config.area.maxRangeKm ?? 20) * 1000,
        freeSpaceRangeM({
          txPower: radio.relayPower,
          gA: radio.relayGain,
          gB: config.coverage.nodeGain,
          cableLoss: radio.cableLoss,
          sensitivity: PRESET_BY_ID[radio.preset].sens,
          freqMHz: radio.freq,
          margin: radio.desiredMargin,
        })
      ),
    [config.area.maxRangeKm, radio, config.coverage.nodeGain]
  );

  const runAreaSearch = useCallback(async () => {
    const zone = config.area.zone;
    if (!zone) {
      setError(t('area.error.noZone'));
      return;
    }
    if (!areaDemEstimate || areaDemEstimate.tooBig) {
      setError(t('area.error.tooBig'));
      return;
    }
    const maxRangeM = areaMaxRangeM;
    const plan = planArea(zone, {
      candidateStep: config.area.candidateStep,
      testStep: config.area.testStep,
      gridStep: config.area.gridStep,
      maxRangeM,
    });
    // Le bouton est deja desactive dans ce cas (AreaPanel calcule le meme
    // plan) : ce garde-fou ne devrait normalement jamais se declencher, mais
    // un retour silencieux serait indiscernable d une panne si jamais il l
    // etait - par exemple lors d une reconfiguration entre le rendu du
    // bouton et le clic.
    if (!plan || plan.tooBig) {
      setError(t('area.tooHeavyMsg', { n: plan ? plan.candidates.toLocaleString(locale) : '-' }));
      return;
    }

    setError(null);
    setAreaBusy(true);
    setAreaProgress(null);
    setAreaResult(null);

    const ctl = new AbortController();
    abortRef.current = ctl;

    try {
      const grid = areaDemEstimate.grid;
      const pts = areaDemEstimate.pts;

      setProgress({ label: t('area.progress.dem', { done: 0, total: areaDemEstimate.requests }), value: 0, total: Math.max(1, areaDemEstimate.requests) });
      const { values, warnings: w } = await fetchElevations(provider, pts, {
        signal: ctl.signal,
        onProgress: ({ done, total }) =>
          setProgress({
            label: t('area.progress.dem', { done, total: total || areaDemEstimate.requests }),
            value: done,
            total: Math.max(1, total || areaDemEstimate.requests),
          }),
      });
      if (w.length) setWarnings((prev) => [...new Set([...prev, ...w])]);

      const dem = new Float32Array(grid.nx * grid.ny).fill(NaN);
      for (let i = 0; i < pts.length; i++) dem[pts[i].idx] = values[i];

      // Couverture du sol sur la zone, aux memes conditions que le balayage
      // TX-RX : sans elle la portee est nettement surestimee.
      let clutter = null;
      if (search.clutter) {
        try {
          setProgress({ label: t('app.progress.clutter'), value: 0, total: 1 });
          clutter = await fetchClutter({
            grid,
            buildingBbox: search.buildings ? gridBbox(grid) : null,
            signal: ctl.signal,
            onProgress: ({ done, total, waitingMs }) =>
              setProgress({
                label: waitingMs
                  ? t('app.progress.clutterQuota', { s: Math.round(waitingMs / 1000) })
                  : t('app.progress.clutter'),
                value: done,
                total: Math.max(1, total),
              }),
          });
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          setWarnings((prev) => [...prev, t('app.warn.clutterFailed', { msg: e.message })]);
        }
      }

      const cand = zonePointGrid(zone, config.area.candidateStep);
      const targ = zonePointGrid(zone, config.area.testStep);

      setProgress({ label: t('area.progress.scan'), value: 0, total: 1 });

      areaWorkerRef.current?.terminate();
      const worker = new Worker(new URL('./workers/area.worker.js', import.meta.url), { type: 'module' });
      areaWorkerRef.current = worker;

      worker.onmessage = (ev) => {
        const m = ev.data;
        if (m.type === 'progress') {
          const label = { coarse: 'area.phase.coarse', refine: 'area.phase.refine', exact: 'area.phase.exact' }[m.phase];
          setAreaProgress({ done: m.done, total: m.total });
          setProgress({ label: t(label ?? 'area.progress.scan'), value: m.done, total: m.total });
        } else if (m.type === 'done') {
          setAreaResult({ top: m.top, scores: m.scores, cand: m.cand, stats: m.stats, zone });
          setAreaBusy(false);
          setAreaProgress(null);
          setProgress(null);
          setFocus((f) => ({
            type: 'rect',
            bounds: [
              [zone.latMin, zone.lonMin],
              [zone.latMax, zone.lonMax],
            ],
            n: f.n + 1,
          }));
          setTab('results');
          worker.terminate();
          areaWorkerRef.current = null;
        } else if (m.type === 'error') {
          setError(t('app.error.calc', { msg: m.message }));
          setAreaBusy(false);
          setProgress(null);
        }
      };
      worker.onerror = (e) => {
        setError(t('app.error.worker', { msg: e.message }));
        setAreaBusy(false);
        setProgress(null);
      };

      const params = {
        freqMHz: radio.freq,
        cableLoss: radio.cableLoss,
        sensitivity: PRESET_BY_ID[radio.preset].sens,
        k: 4 / 3,
        hA: config.area.relayHeight,
        hB: config.coverage.nodeHeight,
        gA: radio.relayGain,
        gB: config.coverage.nodeGain,
        txPower: radio.relayPower,
      };

      const metrics = zoneMetrics(zone);
      worker.postMessage({
        type: 'area',
        grid,
        dem,
        clutter,
        // Les semis ne transitent plus point par point : le worker les
        // reconstruit de leur descripteur, ce qui evite de serialiser des
        // millions d objets pour rien.
        cand: {
          nx: cand.nx,
          ny: cand.ny,
          lat0: cand.lat0,
          lon0: cand.lon0,
          dLat: cand.dLat,
          dLon: cand.dLon,
          diagM: Math.hypot(metrics.widthM, metrics.heightM),
        },
        targ: {
          nx: targ.nx,
          ny: targ.ny,
          lat0: targ.lat0,
          lon0: targ.lon0,
          dLat: targ.dLat,
          dLon: targ.dLon,
          stepM: targ.stepM,
        },
        zone,
        params,
        plan,
        threshold: radio.desiredMargin,
        maxRangeM,
        zoneAreaKm2: metrics.areaKm2,
      });
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
      setAreaBusy(false);
      setAreaProgress(null);
      setProgress(null);
    }
  }, [config.area, config.coverage, areaDemEstimate, areaMaxRangeM, provider, radio, search.clutter, search.buildings, t]);

  useEffect(() => () => areaWorkerRef.current?.terminate(), []);

  const onSiteDrag = useCallback(
    (kind, pt) => {
      if (kind !== 'tx' && kind !== 'rx') return;
      patch(kind, { ...config[kind], lat: +pt.lat.toFixed(6), lon: +pt.lon.toFixed(6) });
    },
    [patch, config]
  );

  // --- Exports -------------------------------------------------------------
  const activeResult = manual?.result ?? detail?.result ?? null;
  const activeSweep = manual?.sweep ?? detail?.sweep ?? null;
  const activeHeight = manual?.height ?? detail?.height ?? null;

  const relayForMap = activeResult
    ? {
        lat: manual ? manual.lat : detail.site.lat,
        lon: manual ? manual.lon : detail.site.lon,
        elev: manual ? manual.elev : detail.site.elev,
        height: activeHeight,
        margin: activeResult.margin,
        m1: activeResult.hop1.margin,
        m2: activeResult.hop2.margin,
      }
    : null;

  const exportDataRef = useRef(null);
  const exportData = {
    tx: txSite,
    rx: rxSite,
    relay: relayForMap,
    radio,
    search,
    provider,
    result: activeResult,
    top: scan?.top,
    chain: scan?.chain,
    direct,
    lang,
    // Uniquement consommes par le classeur de calcul : le balayage en hauteur,
    // les statistiques du scan et l enveloppe de portee n apparaissent pas
    // dans les autres exports.
    sweep: activeSweep,
    stats: scan?.stats,
    cover,
  };
  exportDataRef.current = exportData;

  /**
   * Les fichiers sont construits des l ouverture du menu, puis proposes comme
   * de vraies ancres `<a download>`.
   *
   * Aucun clic n est declenche par script : c est precisement ce qui echouait
   * silencieusement chez certains utilisateurs, les navigateurs refusant un
   * telechargement qui ne se rattache pas clairement a une action humaine.
   * GPX et KML sont instantanes ; le PDF demande environ une seconde, pendant
   * laquelle son entree affiche sa preparation.
   */
  useEffect(() => {
    if (!exportOpen || !activeResult) return;
    let cancelled = false;
    const created = [];

    const keep = (kind, handle) => {
      if (cancelled) {
        URL.revokeObjectURL(handle.url);
        return;
      }
      created.push(handle.url);
      setExportFiles((f) => ({ ...f, [kind]: handle }));
    };

    setExportFiles({});
    setExportError(null);

    try {
      keep('gpx', exportGpx(exportDataRef.current));
      keep('kml', exportKml(exportDataRef.current));
    } catch (e) {
      setExportError(t('app.error.exportPrep', { msg: e.message }));
    }

    // La compression du classeur passe par CompressionStream, donc asynchrone
    // comme le PDF - d ou la meme mecanique d ancre differee.
    exportXlsx(exportDataRef.current)
      .then((h) => keep('xlsx', h))
      .catch((e) => {
        if (!cancelled) setExportError(t('app.error.xlsxUnavailable', { msg: e.message }));
      });

    const img = (k) => {
      try {
        return chartsRef.current[k]?.toBase64Image('image/png', 1);
      } catch {
        return null;
      }
    };
    // Carte schematique, dessinee a la main : la carte Leaflet reelle ne peut
    // pas etre capturee (tuiles sans en-tete CORS -> canvas souille), mais on
    // dispose deja de toute la geometrie du calcul pour en reconstruire une.
    const coverageMap = (() => {
      try {
        const d = exportDataRef.current;
        return renderCoverageMapPNG({
          tx: d.tx,
          rx: d.rx,
          chain: d.chain,
          relay: d.relay,
          cover: coverRef.current,
          lang: d.lang,
        });
      } catch {
        return null;
      }
    })();
    exportPdf(exportDataRef.current, {
      profile1: img('p1'),
      profile2: img('p2'),
      heights: img('h'),
      coverageMap,
    })
      .then((h) => keep('pdf', h))
      .catch((e) => {
        if (!cancelled) setExportError(t('app.error.pdfUnavailable', { msg: e.message }));
      });

    return () => {
      cancelled = true;
      // Les URL de blob sont liberees a la fermeture du menu : le
      // telechargement lance par le navigateur, lui, est deja parti.
      setTimeout(() => created.forEach((u) => URL.revokeObjectURL(u)), 60000);
    };
  }, [exportOpen, activeResult, t]);

  useEffect(() => {
    if (activeResult) preloadPdf().catch(() => {});
  }, [activeResult]);

  // --- Enveloppe de portee du relais ---------------------------------------

  /** Parametres de bilan du relais vers un noeud distant quelconque. */
  const coverParams = useMemo(
    () => ({
      hA: activeHeight ?? 6,
      hB: config.coverage.nodeHeight,
      gA: radio.relayGain,
      gB: config.coverage.nodeGain,
      txPower: radio.relayPower,
      cableLoss: radio.cableLoss,
      freqMHz: radio.freq,
      sensitivity: PRESET_BY_ID[radio.preset].sens,
      k: 4 / 3,
    }),
    [activeHeight, config.coverage.nodeHeight, config.coverage.nodeGain, radio]
  );

  const coverInfo = useMemo(() => {
    const p = PROVIDER_BY_ID[provider];
    const maxDistM = config.coverage.radiusKm * 1000;
    const nSamples = samplesForRadius(maxDistM);
    return {
      maxDistM,
      nSamples,
      estimate: estimateCoverage(config.coverage.azimuths, nSamples, p.batch, p.interval),
      freeSpaceM: freeSpaceRangeM({ ...coverParams, margin: 0 }),
      horizonM: radioHorizonM(coverParams.hA, coverParams.hB),
    };
  }, [config.coverage, provider, coverParams]);

  // Un changement de relais, de hauteur ou de radio perime la couverture.
  const coverSig = JSON.stringify([
    relayForMap?.lat,
    relayForMap?.lon,
    activeHeight,
    coverParams,
    config.coverage.radiusKm,
    config.coverage.azimuths,
  ]);
  const coverSigRef = useRef(coverSig);
  coverSigRef.current = coverSig;
  useEffect(() => {
    setCover((c) => {
      if (!c || c.sig === coverSig) return c;
      // Disparaitre en silence laisserait l utilisateur devant une carte vide
      // sans comprendre pourquoi.
      setCoverStale(true);
      return null;
    });
  }, [coverSig]);

  const runCoverage = useCallback(async () => {
    if (!relayForMap) return;
    setCoverBusy(true);
    setCoverProgress(null);
    setError(null);
    const ctl = new AbortController();
    try {
      const center = { lat: relayForMap.lat, lon: relayForMap.lon };
      const rays = buildRays(center, coverInfo.maxDistM, config.coverage.azimuths, coverInfo.nSamples);

      const { values, warnings: w } = await fetchElevations(provider, rays.points, {
        signal: ctl.signal,
        onProgress: ({ done, total }) => setCoverProgress({ done, total }),
      });
      if (w.length) setWarnings((prev) => [...new Set([...prev, ...w])]);

      // Vegetation sur le disque de couverture. Les batiments en sont exclus :
      // a 15 km de rayon leur volume depasse largement ce qu Overpass accepte.
      let covFoliage = null;
      let covBuildings = null;
      if (search.clutter) {
        try {
          const discGrid = buildGridSpec(center, center, coverInfo.maxDistM, Math.max(100, search.step));
          setCoverProgress({ done: 0, total: 1, label: t('app.progress.clutter') });
          const cl = await fetchClutter({
            grid: discGrid,
            buildingBbox: null,
            signal: ctl.signal,
            onProgress: ({ done, total, waitingMs }) =>
              setCoverProgress({
                done,
                total,
                label: waitingMs ? t('app.progress.clutterQuota', { s: Math.round(waitingMs / 1000) }) : t('app.progress.clutter'),
              }),
          });
          covFoliage = new Float32Array(rays.points.length);
          covBuildings = new Float32Array(rays.points.length);
          for (let i = 0; i < rays.points.length; i++) {
            const pt = rays.points[i];
            const f = sampleGrid(discGrid, cl.foliage, pt.lat, pt.lon);
            const b = sampleGrid(discGrid, cl.buildings, pt.lat, pt.lon);
            covFoliage[i] = Number.isFinite(f) ? f : 0;
            covBuildings[i] = Number.isFinite(b) ? b : 0;
          }
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          setWarnings((w) => [...w, t('app.warn.clutterCoverageFailed', { msg: e.message })]);
        }
      }

      const result = computeCoverage({
        center,
        centerElev: relayForMap.elev,
        elevations: values,
        clutterFoliage: covFoliage,
        clutterBuildings: covBuildings,
        rays,
        params: coverParams,
        // Deux contours : la zone ou l objectif de marge est tenu, et la
        // limite au-dela de laquelle plus rien n est recu.
        thresholds: [radio.desiredMargin, 0],
      });
      const usable = result.rings.some((r) => r.stats.mean > 1);
      if (!usable) {
        throw new Error(
          Number.isFinite(relayForMap.elev) ? t('app.error.noUsableDirection') : t('app.error.unknownElev')
        );
      }
      // Signature relue au moment du stockage, et non celle capturee avant le
      // telechargement.
      setCover({ ...result, sig: coverSigRef.current, horizonM: coverInfo.horizonM, center });
      setCoverStale(false);
      // L enveloppe fait plusieurs dizaines de kilometres : au zoom du
      // balayage elle deborde entierement de la vue et se lit comme une
      // teinte de fond. On recadre dessus pour qu elle se lise comme une forme.
      const widest = result.rings.reduce((a, b) => (b.stats.max > a.stats.max ? b : a));
      setFocus((f) => ({ type: 'bounds', points: widest.polygon, n: f.n + 1 }));
    } catch (e) {
      if (e.name !== 'AbortError') setError(t('app.error.coverage', { msg: e.message }));
    } finally {
      setCoverBusy(false);
      setCoverProgress(null);
    }
  }, [relayForMap, coverInfo, config.coverage, provider, coverParams, radio.desiredMargin, coverSig, search.clutter, search.step, t]);

  // Relance differee : `runCoverage` a ete reconstruit avec le nouveau rayon.
  useEffect(() => {
    if (!coverPending) return;
    setCoverPending(false);
    runCoverage();
  }, [coverPending, runCoverage]);

  const stats = useMemo(() => cacheStats(), [scan, phase]);
  const busy = phase === 'dem' || phase === 'clutter' || phase === 'scan';

  // Certains messages sont stockes prefixes (`warn:elevUnavailable:...`) car
  // generes dans un effet qui s execute avant tout changement de langue : on
  // les retraduit a l affichage plutot qu au moment ou l erreur survient.
  const renderWarning = (w) => {
    if (typeof w === 'string' && w.startsWith('warn:elevUnavailable:')) {
      return t('app.warn.elevUnavailable', { msg: w.slice('warn:elevUnavailable:'.length) });
    }
    return w;
  };

  // --- Rendu ---------------------------------------------------------------
  const configPanel = (
    <div className="space-y-3 p-3">
      <Disclaimer open={discOpen} onToggle={() => setDiscOpen((v) => !v)} />

      {error && (
        <Banner tone="error" title={t('app.error.title')} onClose={() => setError(null)}>
          {error}
        </Banner>
      )}
      {warnings.map((w, i) => (
        <Banner key={i} tone="warn" onClose={() => setWarnings((ws) => ws.filter((_, j) => j !== i))}>
          {renderWarning(w)}
        </Banner>
      ))}
      {stale && <Banner tone="warn">{t('app.warn.stale')}</Banner>}

      <Section title={t('app.section.tx')} icon="▲">
        <SitePanel
          site={tx}
          onChange={(v) => patchSite('tx', v)}
          color="#2563eb"
          picking={pickMode === 'tx'}
          onPickToggle={() => setPickMode((p) => (p === 'tx' ? null : 'tx'))}
          elevation={elev.tx}
          elevBusy={elevBusy}
        />
      </Section>

      <Section title={t('app.section.rx')} icon="▼">
        <SitePanel
          site={rx}
          onChange={(v) => patchSite('rx', v)}
          color="#2563eb"
          picking={pickMode === 'rx'}
          onPickToggle={() => setPickMode((p) => (p === 'rx' ? null : 'rx'))}
          elevation={elev.rx}
          elevBusy={elevBusy}
        />
      </Section>

      <Section title={t('app.section.radio')} icon="≡">
        <RadioPanel
          radio={radio}
          onChange={(v) => patch('radio', v)}
          onApplyDevice={applyDevice}
          maxGain={Math.max(tx.gain, rx.gain, radio.relayGain)}
        />
      </Section>

      <Section title={t('app.section.search')} icon="◉">
        <SearchPanel
          search={search}
          onChange={(v) => patch('search', v)}
          provider={provider}
          onProviderChange={(v) => patch('provider', v)}
          estimate={estimate}
          linkLength={linkLength}
          linkBearing={linkBearing}
        />
      </Section>

      <Section title={t('app.section.area')} icon="▭" defaultOpen={false}>
        <AreaPanel
          area={config.area}
          onChange={(v) => patch('area', v)}
          picking={pickMode === 'zone'}
          onPickToggle={() => {
            setPickMode((p) => (p === 'zone' ? null : 'zone'));
            setPickStep(0);
            setZonePending(null);
          }}
          onClear={() => {
            patch('area', { ...config.area, zone: null });
            setAreaResult(null);
            setZonePending(null);
          }}
          onRun={runAreaSearch}
          busy={areaBusy}
          progress={areaProgress}
          demEstimate={areaDemEstimate}
          maxRangeM={areaMaxRangeM}
          horizonM={areaHorizonM}
          disabled={busy}
        />
      </Section>

      <Section title={t('app.section.display')} icon="▦" defaultOpen={false}>
        <Checkbox
          checked={config.ui.heatmap}
          onChange={(v) => patch('ui', { ...config.ui, heatmap: v })}
          label={t('app.display.heatmap')}
        />
        <Checkbox
          checked={config.ui.candidates}
          onChange={(v) => patch('ui', { ...config.ui, candidates: v })}
          label={t('app.display.candidates')}
        />
        <Checkbox
          checked={config.ui.coverage}
          onChange={(v) => patch('ui', { ...config.ui, coverage: v })}
          label={t('app.display.coverage')}
        />
        <div className="pt-1 text-[11px] text-zinc-500">
          {t('app.cacheStats', { tiles: stats.tiles, kb: (stats.bytes / 1024).toFixed(0) })}
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              clearCache();
              clearRoadCache();
              setWarnings((w) => [...w, t('app.warn.cacheCleared')]);
            }}
          >
            {t('app.clearCache')}
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              setConfig(resetConfig());
              setScan(null);
              setDetail(null);
              setManual(null);
            }}
          >
            {t('app.resetConfig')}
          </button>
        </div>
      </Section>
    </div>
  );

  const resultsPanel = (
    <div className="space-y-4 p-3">
      {!scan && !busy && (
        <div className="rounded-xl border border-dashed border-ink-500 px-4 py-8 text-center text-[13px] leading-relaxed text-zinc-500">
          {t('app.emptyState1')}
          <br />
          {t('app.emptyState2')}
        </div>
      )}

      {areaResult && (
        <div className="card p-3">
          <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-zinc-400">
            {t('area.resultsTitle')}
          </h3>
          <AreaResults
            result={areaResult}
            desiredMargin={radio.desiredMargin}
            onLocate={(r) => {
              setFocus((f) => ({ type: 'point', lat: r.lat, lon: r.lon, n: f.n + 1 }));
              setTab('map');
            }}
          />
        </div>
      )}

      {manual && (
        <div className="card p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-purple-300">{t('app.forcedPoint')}</h3>
            <button type="button" className="btn-ghost !py-1 !text-[11px]" onClick={() => setManual(null)}>
              {t('app.backToRanking')}
            </button>
          </div>
          <p className="mb-3 font-mono text-[11px] text-zinc-500">
            {t('app.manualCoords', { lat: manual.lat.toFixed(5), lon: manual.lon.toFixed(5), elev: manual.elev?.toFixed(0) })}
          </p>
          <LinkSummary result={manual.result} radio={radio} direct={direct} tx={txSite} rx={rxSite} relay={manual} />
        </div>
      )}

      {!manual && scan?.chain && (
        <div className="card p-3">
          <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-zinc-400">
            {t('app.chainTitle')}
          </h3>
          <ChainPanel
            chain={scan.chain}
            onLocate={(n) => {
              setFocus((f) => ({ type: 'point', lat: n.lat, lon: n.lon, n: f.n + 1 }));
              setTab('map');
            }}
          />
        </div>
      )}

      {!manual && scan?.top?.length > 0 && (
        <>
          <div className="card p-3">
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-400">
              {t('app.bestSitesTitle')}
            </h3>
            <p className="mb-3 mt-1 text-[11px] leading-relaxed text-zinc-500">{t('app.bestSitesHint')}</p>
            <ResultsTable
              rows={scan.top}
              roads={roads}
              roadsBusy={roadsBusy}
              selectedIndex={selected}
              desiredMargin={radio.desiredMargin}
              onSelect={setSelected}
              onLocate={(r) => {
                setFocus((f) => ({ type: 'point', lat: r.lat, lon: r.lon, n: f.n + 1 }));
                setTab('map');
              }}
            />
          </div>

          {detail && (
            <div className="card p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-400">
                  {t('app.siteN', { n: selected + 1 })}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-zinc-500">{t('app.height')}</span>
                  {scan.stats.heights.map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setDetailHeight(h)}
                      className={`rounded-md border px-1.5 py-0.5 font-mono text-[11px] transition ${
                        detail.height === h
                          ? 'border-sky-500 bg-sky-500/20 text-sky-200'
                          : 'border-ink-500 bg-ink-900/60 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      {h} m
                    </button>
                  ))}
                </div>
              </div>
              <LinkSummary result={detail.result} radio={radio} direct={direct} tx={txSite} rx={rxSite} relay={detail.site} />
            </div>
          )}
        </>
      )}

      {activeResult && (
        <div className="card space-y-5 p-3">
          <h3 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-400">
            {t('app.profilesTitle')}
          </h3>
          <ProfileChart
            hop={activeResult.hop1}
            title={t('app.hop1Title')}
            subtitle={t('app.hopSubtitle', { km: (activeResult.hop1.distM / 1000).toFixed(2), db: activeResult.hop1.diffraction.toFixed(1) })}
            onReady={(c) => (chartsRef.current.p1 = c)}
          />
          <ProfileChart
            hop={activeResult.hop2}
            title={t('app.hop2Title')}
            subtitle={t('app.hopSubtitle', { km: (activeResult.hop2.distM / 1000).toFixed(2), db: activeResult.hop2.diffraction.toFixed(1) })}
            onReady={(c) => (chartsRef.current.p2 = c)}
          />
        </div>
      )}

      {activeSweep && (
        <div className="card p-3">
          <h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wider text-zinc-400">
            {t('app.heightComparerTitle')}
          </h3>
          <p className="mb-3 text-[11px] text-zinc-500">{t('app.heightComparerHint')}</p>
          <HeightChart
            rows={activeSweep}
            desiredMargin={radio.desiredMargin}
            currentHeight={activeHeight}
            onReady={(c) => (chartsRef.current.h = c)}
          />
        </div>
      )}

      {activeResult && (
        <div className="card p-3">
          <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-zinc-400">
            {t('app.rangeTitle')}
          </h3>
          <CoveragePanel
            coverage={config.coverage}
            onChange={(v) => patch('coverage', v)}
            result={cover}
            busy={coverBusy}
            progress={coverProgress}
            estimate={coverInfo.estimate}
            freeSpaceM={coverInfo.freeSpaceM}
            horizonM={coverInfo.horizonM}
            desiredMargin={radio.desiredMargin}
            onRun={runCoverage}
            onExtend={extendCoverage}
            disabled={!relayForMap}
          />
        </div>
      )}

      {scan?.stats && (
        <div className="px-1 text-[11px] leading-relaxed text-zinc-600">
          {t('app.scanStats', { candidates: scan.stats.candidates.toLocaleString(locale), evaluated: scan.stats.evaluated.toLocaleString(locale), ms: scan.stats.ms })}
          {scan.stats.excludedSlope > 0 && <>{t('app.scanStats.slope', { n: scan.stats.excludedSlope })}</>}
          {scan.stats.excludedWater > 0 && <>{t('app.scanStats.water', { n: scan.stats.excludedWater })}</>}
          {scan.stats.excludedNoData > 0 && <>{t('app.scanStats.noData', { n: scan.stats.excludedNoData })}</>}
          {t('app.scanStats.source', { label: PROVIDER_BY_ID[provider]?.label })}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* En-tete */}
      <header className="z-20 flex shrink-0 flex-wrap items-center gap-3 border-b border-ink-500/70 bg-ink-800/80 px-3 py-2 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/30">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4" strokeLinecap="round" />
              <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <div className="leading-tight">
            <h1 className="text-[15px] font-semibold text-zinc-100">LoRa Relay Planner</h1>
            <p className="text-[11px] text-zinc-500">{t('app.subtitle')}</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {activeResult && (
            <span className="hidden items-center gap-1.5 text-[11px] text-zinc-500 sm:flex">
              {t('app.marginRetained')} <MarginChip value={activeResult.margin} />
            </span>
          )}
          {/* Bascule de langue : deux libelles courts plutot qu un menu, pour
              rester visible et instantane. */}
          <div className="flex items-center rounded-md border border-ink-500 bg-ink-900/60 p-0.5 text-[11px] font-medium">
            <button
              type="button"
              onClick={() => setLang('fr')}
              aria-pressed={lang === 'fr'}
              className={`rounded px-2 py-1 transition ${lang === 'fr' ? 'bg-sky-500/20 text-sky-200' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              FR
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              aria-pressed={lang === 'en'}
              className={`rounded px-2 py-1 transition ${lang === 'en' ? 'bg-sky-500/20 text-sky-200' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              EN
            </button>
          </div>
          {busy ? (
            <button type="button" className="btn-danger" onClick={cancelScan}>
              <Spinner className="h-3.5 w-3.5" />
              {t('app.cancel')}
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={runScan}>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M5 3l14 9-14 9V3z" strokeLinejoin="round" />
              </svg>
              {scan ? t('app.rerun') : t('app.runScan')}
            </button>
          )}
          <div data-export-menu>
            {/* Jamais desactive : un bouton inerte est indiscernable d une
                panne. S il n y a rien a exporter, le menu le dit. */}
            <button
              ref={exportBtnRef}
              type="button"
              className="btn-ghost"
              onClick={() => setExportOpen((v) => !v)}
              aria-expanded={exportOpen}
              aria-haspopup="menu"
            >
              {t('app.export')}
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            <DropdownMenu
              open={exportOpen}
              anchorRef={exportBtnRef}
              onClose={() => setExportOpen(false)}
              width={248}
            >
              {!activeResult ? (
                <p className="px-3 py-3 text-[11px] leading-relaxed text-zinc-400">{t('app.exportEmpty')}</p>
              ) : (
                [
                  ['gpx', t('app.export.gpx.label'), t('app.export.gpx.hint')],
                  ['kml', t('app.export.kml.label'), t('app.export.kml.hint')],
                  ['pdf', t('app.export.pdf.label'), t('app.export.pdf.hint')],
                  ['xlsx', t('app.export.xlsx.label'), t('app.export.xlsx.hint')],
                ].map(([kind, label, hint]) => {
                  const file = exportFiles?.[kind];
                  // Une vraie ancre, sur laquelle l utilisateur clique
                  // lui-meme : aucun navigateur ne bloque ce chemin.
                  return file ? (
                    <a
                      key={kind}
                      href={file.url}
                      download={file.name}
                      onClick={() => setExportOpen(false)}
                      className="block px-3 py-2 transition hover:bg-ink-600"
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[12px] text-zinc-200">{label}</span>
                        <span className="font-mono text-[10px] text-zinc-500">
                          {file.size < 1024
                            ? `${file.size} ${lang === 'fr' ? 'o' : 'B'}`
                            : `${(file.size / 1024).toFixed(0)} ${lang === 'fr' ? 'Ko' : 'KB'}`}
                        </span>
                      </span>
                      <span className="block text-[10px] text-zinc-500">{hint}</span>
                    </a>
                  ) : (
                    <span key={kind} className="block cursor-default px-3 py-2 opacity-50" aria-disabled="true">
                      <span className="flex items-center gap-2 text-[12px] text-zinc-300">
                        <Spinner className="h-3 w-3" />
                        {label}
                      </span>
                      <span className="block text-[10px] text-zinc-500">{t('app.exportPreparing')}</span>
                    </span>
                  );
                })
              )}
            </DropdownMenu>
          </div>
        </div>

        {exportError && (
          <div className="w-full">
            <Banner tone="error" onClose={() => setExportError(null)}>
              {exportError}
            </Banner>
          </div>
        )}

      </header>

      {/*
        Barre de progression persistante : le seul retour visible pendant un
        calcul restait jusqu ici un pourcentage nu dans le bouton qui l a
        declenche, invisible des qu on change d onglet ou qu on defile la
        page. Sur une recherche de zone dont le telechargement de relief peut
        prendre plusieurs minutes, l absence de retour est indiscernable d une
        panne - c est exactement ce qui a ete signale. Visible sur tous les
        onglets, avec de quoi annuler sans chercher le bon bouton.
      */}
      {progress && (
        <div className="z-10 flex shrink-0 items-center gap-3 border-b border-ink-500/70 bg-ink-800/95 px-3 py-2 backdrop-blur">
          <div className="min-w-0 flex-1">
            <Progress value={progress.value} total={progress.total} label={progress.label} />
          </div>
          <button type="button" className="btn-ghost shrink-0 !py-1 !text-[11px]" onClick={cancelScan}>
            {t('app.cancel')}
          </button>
        </div>
      )}

      {/* Corps */}
      <div className="flex min-h-0 flex-1 lg:grid lg:grid-cols-[380px_minmax(0,1fr)] xl:grid-cols-[400px_minmax(0,1fr)]">
        <aside
          className={`min-h-0 overflow-y-auto border-r border-ink-500/70 bg-ink-800/40 lg:block ${
            tab === 'config' ? 'block w-full' : 'hidden'
          }`}
        >
          {configPanel}
        </aside>

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            className={`relative min-h-0 shrink-0 lg:h-[52%] ${tab === 'map' ? 'h-full flex-1' : 'hidden lg:block'}`}
          >
            <MapView
              tx={txSite}
              rx={rxSite}
              relay={relayForMap}
              manual={manual ? { lat: manual.lat, lon: manual.lon } : null}
              candidates={scan?.top?.slice(0, 25)}
              grid={scan?.grid}
              heat={scan?.heat}
              coverage={cover}
              chain={config.ui.chain ? scan?.chain : null}
              radius={search.radius}
              showHeat={config.ui.heatmap}
              showCandidates={config.ui.candidates}
              showCoverage={config.ui.coverage}
              coverageBusy={coverBusy}
              coverageProgress={coverProgress}
              coverageStale={coverStale}
              onRunCoverage={runCoverage}
              onToggleCoverage={toggleCoverageLayer}
              pickMode={pickMode ?? (scan ? 'manual' : null)}
              pickStep={pickStep}
              onStartPickBoth={startPickBoth}
              onMapClick={onMapClick}
              onSiteDrag={onSiteDrag}
              onCandidateClick={(c, i) => {
                setManual(null);
                setSelected(i);
                setTab('results');
              }}
              onAreaSpotClick={() => setTab('results')}
              zone={config.area.zone}
              zonePending={pickMode === 'zone' && pickStep === 1 ? zonePending : null}
              areaResult={areaResult}
              focus={focus}
            />
            {manualBusy && (
              <div className="absolute inset-0 z-[600] grid place-items-center bg-ink-900/60 backdrop-blur-sm">
                <span className="flex items-center gap-2 rounded-lg border border-ink-500 bg-ink-800 px-3 py-2 text-[12px] text-zinc-300">
                  <Spinner /> {t('app.progress.evaluatingPoint')}
                </span>
              </div>
            )}
          </div>

          <div
            className={`min-h-0 flex-1 overflow-y-auto border-t border-ink-500/70 bg-ink-900/50 lg:block ${
              tab === 'results' ? 'block' : 'hidden lg:block'
            }`}
          >
            {resultsPanel}
          </div>
        </main>
      </div>

      {/* Navigation mobile */}
      <nav className="z-30 flex shrink-0 border-t border-ink-500/70 bg-ink-800 lg:hidden">
        {[
          ['config', t('app.nav.config'), 'M4 6h16M4 12h16M4 18h16'],
          ['map', t('app.nav.map'), 'M9 3l6 3 6-3v15l-6 3-6-3-6 3V6z'],
          ['results', t('app.nav.results'), 'M4 19V9m5 10V5m5 14v-7m5 7V8'],
        ].map(([id, label, path]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${
              tab === id ? 'text-sky-400' : 'text-zinc-500'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d={path} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
