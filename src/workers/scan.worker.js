// Balayage de la grille de candidats relais, et construction d une chaine.
//
// Aucun acces reseau ici : le MNT et la couverture du sol sont transferes
// entierement par le thread principal, le worker ne fait que du calcul pur.
//
// Le raisonnement porte sur un **segment** quelconque, pas sur le couple
// TX-RX fige : c est ce qui permet, quand un bond ne passe pas, de le rouvrir
// et d y inserer un relais supplementaire, de proche en proche.

import { analyzeHop, combine, PRESET_BY_ID } from '../lib/radio.js';
import {
  sampleGrid,
  slopeAt,
  looksLikeWater,
  gridLat,
  gridLon,
  profileSampleCount,
} from '../lib/dem.js';
import { metersPerDeg, haversine, makeLocalProjection, distanceToSegment } from '../lib/geo.js';

/**
 * Profil du sol entre a et b. Interpolation lineaire en degres : sur moins de
 * 50 km l ecart avec le grand cercle est inferieur au metre, tres en dessous
 * de la resolution du MNT.
 */
function buildProfile(g, data, a, b, n, buf) {
  const out = buf && buf.length === n ? buf : new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    out[i] = sampleGrid(g, data, a.lat + (b.lat - a.lat) * f, a.lon + (b.lon - a.lon) * f);
  }
  return out;
}

/** Bouche les trous du profil par interpolation entre voisins valides. */
function patchHoles(p) {
  const n = p.length;
  let holes = 0;
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(p[i])) continue;
    holes++;
    let lo = i - 1;
    while (lo >= 0 && !Number.isFinite(p[lo])) lo--;
    let hi = i + 1;
    while (hi < n && !Number.isFinite(p[hi])) hi++;
    if (lo < 0 && hi >= n) return -1;
    if (lo < 0) p[i] = p[hi];
    else if (hi >= n) p[i] = p[lo];
    else p[i] = p[lo] + ((p[hi] - p[lo]) * (i - lo)) / (hi - lo);
  }
  return holes;
}

self.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type !== 'scan') return;

  try {
    const t0 = performance.now();
    const { grid, dem, clutter, tx, rx, radio, search } = msg;
    const data = dem;
    const sensitivity = PRESET_BY_ID[radio.preset].sens;
    const mPerDeg = metersPerDeg((tx.lat + rx.lat) / 2);
    const proj = makeLocalProjection({
      lat: (tx.lat + rx.lat) / 2,
      lon: (tx.lon + rx.lon) / 2,
    });

    const heights = search.heights.length ? search.heights : [6];
    const maxRelays = Math.max(1, Math.min(8, search.maxRelays ?? 4));
    const target = radio.desiredMargin;
    // Un relais colle a une extremite n a aucun interet : on ecarte les
    // mailles situees a moins de 100 m (ou d une maille) des deux bouts.
    const minSep = Math.max(100, grid.step);

    const baseParams = {
      freqMHz: radio.freq,
      cableLoss: radio.cableLoss,
      sensitivity,
      k: 4 / 3,
    };

    // --- Echantillonnage ---------------------------------------------------

    const sampleClutter = (a, b, n, buf) => {
      if (!clutter) return null;
      const out =
        buf && buf.foliage.length === n
          ? buf
          : { foliage: new Float64Array(n), buildingHeight: new Float64Array(n) };
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1);
        const lat = a.lat + (b.lat - a.lat) * f;
        const lon = a.lon + (b.lon - a.lon) * f;
        const v = sampleGrid(grid, clutter.foliage, lat, lon);
        const h = sampleGrid(grid, clutter.buildings, lat, lon);
        out.foliage[i] = Number.isFinite(v) ? v : 0;
        out.buildingHeight[i] = Number.isFinite(h) ? h : 0;
      }
      return out;
    };

    /** Bilan d un bond entre deux noeuds deja pourvus de leur altitude. */
    const hopBetween = (a, b) => {
      const dist = haversine(a, b);
      const n = profileSampleCount(dist, grid.step);
      const prof = buildProfile(grid, data, a, b, n, null);
      if (patchHoles(prof) < 0) return null;
      prof[0] = a.elev;
      prof[n - 1] = b.elev;
      const clt = sampleClutter(a, b, n, null);
      return analyzeHop(prof, dist, {
        ...baseParams,
        ...(clt || {}),
        hA: a.height,
        hB: b.height,
        gA: a.gain,
        gB: b.gain,
        txPower: a.power,
      });
    };

    // --- Recherche du meilleur relais sur un segment -----------------------

    /**
     * Balaie les mailles proches du segment a-b et renvoie les candidats
     * classes, le meilleur en tete.
     *
     * Les candidats restent ceux de la grille deja telechargee : le corridor
     * TX-RX etant convexe, tout sous-segment y est inclus, donc approfondir
     * une chaine ne demande aucune donnee supplementaire.
     */
    const scanSegment = (a, b, { collect = false, onTick = null } = {}) => {
      const cand = [];
      for (let iy = 0; iy < grid.ny; iy++) {
        const lat = gridLat(grid, iy);
        for (let ix = 0; ix < grid.nx; ix++) {
          const lon = gridLon(grid, ix);
          const { dist } = distanceToSegment(proj, { lat, lon }, a, b);
          if (dist > search.radius) continue;
          const p = { lat, lon };
          if (haversine(p, a) < minSep || haversine(p, b) < minSep) continue;
          cand.push({ ix, iy, lat, lon });
        }
      }

      const results = [];
      const stats = { candidates: cand.length, slope: 0, water: 0, nodata: 0 };
      let buf1 = null;
      let buf2 = null;
      let clt1 = null;
      let clt2 = null;
      let processed = 0;
      const tick = Math.max(1, Math.floor(cand.length / 120));

      for (const c of cand) {
        processed++;
        if (onTick && processed % tick === 0) onTick(processed, cand.length);

        const elev = sampleGrid(grid, data, c.lat, c.lon);
        if (!Number.isFinite(elev)) {
          stats.nodata++;
          continue;
        }

        if (search.exclude) {
          const sl = slopeAt(grid, data, c.ix, c.iy, mPerDeg);
          if (Number.isFinite(sl) && sl > 30) {
            stats.slope++;
            continue;
          }
          if (looksLikeWater(grid, data, c.ix, c.iy)) {
            stats.water++;
            continue;
          }
          c.slope = sl;
        } else {
          c.slope = slopeAt(grid, data, c.ix, c.iy, mPerDeg);
        }

        const d1 = haversine(a, c);
        const d2 = haversine(c, b);
        const n1 = profileSampleCount(d1, grid.step);
        const n2 = profileSampleCount(d2, grid.step);

        buf1 = buildProfile(grid, data, a, c, n1, buf1 && buf1.length === n1 ? buf1 : null);
        buf2 = buildProfile(grid, data, c, b, n2, buf2 && buf2.length === n2 ? buf2 : null);
        if (patchHoles(buf1) < 0 || patchHoles(buf2) < 0) {
          stats.nodata++;
          continue;
        }
        // Les extremites viennent de mesures ponctuelles, plus fiables que
        // l interpolation de grille.
        buf1[0] = a.elev;
        buf1[n1 - 1] = elev;
        buf2[0] = elev;
        buf2[n2 - 1] = b.elev;

        clt1 = sampleClutter(a, c, n1, clt1);
        clt2 = sampleClutter(c, b, n2, clt2);

        const byHeight = [];
        let best = null;

        for (const h of heights) {
          const hop1 = analyzeHop(buf1, d1, {
            ...baseParams,
            ...(clt1 || {}),
            hA: a.height,
            hB: h,
            gA: a.gain,
            gB: radio.relayGain,
            txPower: a.power,
          });
          const hop2 = analyzeHop(buf2, d2, {
            ...baseParams,
            ...(clt2 || {}),
            hA: h,
            hB: b.height,
            gA: radio.relayGain,
            gB: b.gain,
            txPower: radio.relayPower,
          });
          const c2 = combine(hop1, hop2);
          const rec = {
            h,
            margin: c2.margin,
            margin95: c2.margin95,
            foliage: c2.foliage,
            score: c2.score,
            m1: hop1.margin,
            m2: hop2.margin,
            c1: hop1.clearance,
            c2: hop2.clearance,
            rssi1: hop1.rssi,
            rssi2: hop2.rssi,
            diff1: hop1.diffraction,
            diff2: hop2.diffraction,
          };
          byHeight.push(rec);
          if (!best || rec.score > best.score) best = rec;
        }

        results.push({
          lat: c.lat,
          lon: c.lon,
          ix: c.ix,
          iy: c.iy,
          elev,
          slope: c.slope,
          d1,
          d2,
          best,
          byHeight: collect ? byHeight : undefined,
        });
      }

      results.sort((x, y) => y.best.score - x.best.score);
      return { results, stats };
    };

    // --- Passe principale : classement et carte de chaleur ------------------

    const txNode = { ...tx, gain: tx.gain, power: radio.power };
    const rxNode = { ...rx, gain: rx.gain, power: radio.relayPower };

    const main = scanSegment(txNode, rxNode, {
      collect: true,
      onTick: (done, total) => self.postMessage({ type: 'progress', done, total }),
    });

    const heat = new Float32Array(grid.nx * grid.ny).fill(NaN);
    for (const r of main.results) heat[r.iy * grid.nx + r.ix] = r.best.score;
    const top = main.results.slice(0, 120);

    // --- Construction de la chaine -----------------------------------------
    //
    // On part de la liaison directe et on n insere un relais que la ou le
    // bilan decroche, en reprenant a chaque tour le bond le plus faible. Un
    // relais qui n ameliore pas ce maillon est refuse : mieux vaut une chaine
    // courte qui echoue franchement qu une chaine longue qui pretend passer.

    const nodeFor = (r) => ({
      lat: r.lat,
      lon: r.lon,
      elev: r.elev,
      height: r.best.h,
      gain: radio.relayGain,
      power: radio.relayPower,
      relay: true,
    });

    const chainNodes = [txNode, rxNode];
    const chainLog = [];
    const hops = [hopBetween(txNode, rxNode)];
    let stopReason = 'direct';

    for (let step = 0; step < maxRelays; step++) {
      // Maillon faible : le bond dont la marge fiable est la plus basse.
      let worst = -1;
      let worstVal = Infinity;
      for (let i = 0; i < hops.length; i++) {
        const v = hops[i] ? hops[i].margin95 : -Infinity;
        if (v < worstVal) {
          worstVal = v;
          worst = i;
        }
      }
      if (worst < 0 || worstVal >= target) {
        stopReason = step === 0 ? 'direct' : 'atteint';
        break;
      }

      const seg = scanSegment(chainNodes[worst], chainNodes[worst + 1]);
      if (!seg.results.length) {
        stopReason = 'aucun-candidat';
        break;
      }
      const node = nodeFor(seg.results[0]);
      const h1 = hopBetween(chainNodes[worst], node);
      const h2 = hopBetween(node, chainNodes[worst + 1]);
      if (!h1 || !h2) {
        stopReason = 'profil-indisponible';
        break;
      }

      // Le nouveau maillon faible local doit depasser l ancien, sinon
      // l insertion n apporte rien.
      const gain = Math.min(h1.margin95, h2.margin95) - worstVal;
      if (gain <= 0.5) {
        stopReason = 'sans-gain';
        break;
      }

      chainNodes.splice(worst + 1, 0, node);
      hops.splice(worst, 1, h1, h2);
      chainLog.push({
        step: step + 1,
        insertedInHop: worst,
        lat: node.lat,
        lon: node.lon,
        elev: node.elev,
        height: node.height,
        before: worstVal,
        after: Math.min(h1.margin95, h2.margin95),
      });
      stopReason = 'en-cours';
    }

    const chainMargin95 = hops.reduce(
      (m, h) => Math.min(m, h ? h.margin95 : -Infinity),
      Infinity
    );
    const chainMargin = hops.reduce((m, h) => Math.min(m, h ? h.margin : -Infinity), Infinity);
    const feasible = chainMargin95 >= target;
    if (stopReason === 'en-cours') stopReason = feasible ? 'atteint' : 'plafond-relais';

    const chain = {
      nodes: chainNodes.map((n) => ({
        lat: n.lat,
        lon: n.lon,
        elev: n.elev,
        height: n.height,
        relay: !!n.relay,
      })),
      hops: hops.map((h) =>
        h
          ? {
              distM: h.distM,
              margin: h.margin,
              margin95: h.margin95,
              clearance: h.clearance,
              foliage: h.foliage,
              diffraction: h.diffraction,
              rssi: h.rssi,
            }
          : null
      ),
      relays: chainNodes.filter((n) => n.relay).length,
      margin: chainMargin,
      margin95: chainMargin95,
      feasible,
      stopReason,
      target,
      log: chainLog,
    };

    self.postMessage(
      {
        type: 'done',
        top,
        heat,
        chain,
        stats: {
          candidates: main.stats.candidates,
          evaluated: main.results.length,
          excludedSlope: main.stats.slope,
          excludedWater: main.stats.water,
          excludedNoData: main.stats.nodata,
          heights,
          ms: Math.round(performance.now() - t0),
        },
      },
      [heat.buffer]
    );
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message ?? String(err) });
  }
};
