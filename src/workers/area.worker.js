// Recherche du meilleur emplacement de relais pour couvrir une zone.
//
// Le balayage naif - une liaison complete par couple (emplacement, point de
// test) - releve le meme relief des centaines de fois et coute
// O(emplacements x points x longueur de profil). Il ne tient pas au-dela de
// quelques millions de couples.
//
// Trois etages le remplacent :
//
//   1. FILTRAGE. Chaque emplacement est traite par un balayage radial a
//      horizon incrementiel (`sweep.js`) : chaque maille visitee une fois, en
//      travail constant. Le cout cesse de dependre du nombre de points de test.
//   2. RAFFINEMENT. Le filtrage tourne d abord sur un sous-echantillon des
//      emplacements, puis ne descend a pleine resolution qu autour des
//      meilleurs. Un emplacement mediocre n a pas a etre connu au metre pres.
//   3. RE-CALCUL EXACT. Les meilleurs retenus repassent par le moteur complet
//      - profil geodesique, diffraction de Deygout multi-aretes, vegetation
//      traversee sous le faisceau reel. Les chiffres publies viennent de la,
//      jamais du filtre.
//
// Le filtre peut donc approximer sans consequence : il choisit qui merite un
// calcul exact, il ne produit pas le resultat.

import { analyzeHop } from '../lib/radio.js';
import { sampleGrid, profileSampleCount } from '../lib/dem.js';
import { haversine } from '../lib/geo.js';
import { sweepCandidate } from '../lib/sweep.js';
import { planArea, REFINE_SEEDS, EXACT_TOP_K } from '../lib/area.js';

self.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type !== 'area') return;

  try {
    const t0 = performance.now();
    const {
      grid,
      dem,
      clutter,
      cand,
      targ,
      params,
      threshold,
      maxRangeM,
      zoneAreaKm2,
      zone,
      plan,
      exactTopK = EXACT_TOP_K,
    } = msg;

    const nC = cand.nx * cand.ny;
    const nT = targ.nx * targ.ny;
    const foliageData = clutter?.foliage ?? null;
    const buildingData = clutter?.buildings ?? null;

    const latOf = (g, iy) => g.lat0 + iy * g.dLat;
    const lonOf = (g, ix) => g.lon0 + ix * g.dLon;

    // --- Etage 1 et 2 : filtrage par balayage --------------------------------
    const scores = new Float32Array(nC).fill(NaN);
    const stamp = new Int32Array(nT).fill(-1); // estampilles : evite de vider un masque par candidat
    // Le plan vient du meme calcul que celui affiche dans le panneau : le pas
    // d echantillonnage effectivement applique est bien celui annonce.
    const rayStepM = plan.rayStepM;
    const sweepRange = Math.min(maxRangeM, cand.diagM ?? maxRangeM);
    const nAz = plan.nAz;
    let sweeps = 0;

    const runSweep = (ix, iy) => {
      const idx = iy * cand.nx + ix;
      if (!Number.isNaN(scores[idx])) return scores[idx];
      const origin = { lat: latOf(cand, iy), lon: lonOf(cand, ix) };
      const elev = sampleGrid(grid, dem, origin.lat, origin.lon);
      if (!Number.isFinite(elev)) {
        scores[idx] = -1;
        return -1;
      }
      const covered = sweepCandidate({
        grid,
        dem,
        foliageData,
        buildingData,
        origin,
        originElev: elev,
        target: targ,
        stamp,
        mark: idx,
        zone,
        params,
        threshold,
        nAz,
        rayStepM,
        maxRangeM: sweepRange,
      });
      sweeps++;
      scores[idx] = covered;
      return covered;
    };

    const stride = plan.stride;
    const coarse = [];
    let done = 0;
    // Mode exhaustif : le moteur exact est abordable sur tous les emplacements,
    // on ne filtre pas. Le filtrage etant une heuristique, l eviter quand on
    // peut s en passer supprime le risque d ecarter un emplacement a egalite
    // avec les meilleurs.
    const totalCoarse = plan.exhaustive
      ? 0
      : Math.ceil(cand.ny / stride) * Math.ceil(cand.nx / stride);
    if (!plan.exhaustive) {
      for (let iy = 0; iy < cand.ny; iy += stride) {
        for (let ix = 0; ix < cand.nx; ix += stride) {
          coarse.push({ ix, iy, v: runSweep(ix, iy) });
          if (++done % 256 === 0) {
            self.postMessage({ type: 'progress', phase: 'coarse', done, total: totalCoarse });
          }
        }
      }
    }
    const tCoarse = performance.now();

    // Raffinement : pleine resolution autour des meilleurs blocs seulement.
    let refined = 0;
    if (!plan.exhaustive && stride > 1) {
      coarse.sort((a, b) => b.v - a.v);
      const seeds = coarse.slice(0, REFINE_SEEDS);
      for (const s of seeds) {
        for (let iy = Math.max(0, s.iy - stride); iy <= Math.min(cand.ny - 1, s.iy + stride); iy++) {
          for (let ix = Math.max(0, s.ix - stride); ix <= Math.min(cand.nx - 1, s.ix + stride); ix++) {
            if (Number.isNaN(scores[iy * cand.nx + ix])) {
              runSweep(ix, iy);
              refined++;
            }
          }
        }
        self.postMessage({ type: 'progress', phase: 'refine', done: refined, total: seeds.length * (2 * stride + 1) ** 2 });
      }
    }
    const tRefine = performance.now();

    // Carte de chaleur : les mailles non evaluees reprennent la valeur de leur
    // bloc, sans quoi l image serait criblee de trous.
    if (!plan.exhaustive && stride > 1) {
      for (let iy = 0; iy < cand.ny; iy++) {
        for (let ix = 0; ix < cand.nx; ix++) {
          const idx = iy * cand.nx + ix;
          if (Number.isNaN(scores[idx])) {
            const by = Math.min(cand.ny - 1, Math.round(iy / stride) * stride);
            const bx = Math.min(cand.nx - 1, Math.round(ix / stride) * stride);
            const v = scores[by * cand.nx + bx];
            if (!Number.isNaN(v)) scores[idx] = v;
          }
        }
      }
    }

    // --- Etage 3 : moteur exact ----------------------------------------------
    let shortlist;
    if (plan.exhaustive) {
      shortlist = Array.from({ length: nC }, (_, i) => i);
    } else {
      const ranked = [];
      for (let i = 0; i < nC; i++) if (!Number.isNaN(scores[i]) && scores[i] >= 0) ranked.push(i);
      ranked.sort((a, b) => scores[b] - scores[a]);
      shortlist = ranked.slice(0, exactTopK);
    }

    const targets = new Array(nT);
    for (let iy = 0; iy < targ.ny; iy++) {
      for (let ix = 0; ix < targ.nx; ix++) {
        targets[iy * targ.nx + ix] = { lat: latOf(targ, iy), lon: lonOf(targ, ix) };
      }
    }
    const tElev = new Float64Array(nT);
    for (let i = 0; i < nT; i++) tElev[i] = sampleGrid(grid, dem, targets[i].lat, targets[i].lon);

    const bufs = new Map();
    const bufFor = (n) => {
      let b = bufs.get(n);
      if (!b) {
        b = {
          prof: new Float64Array(n),
          foliage: clutter ? new Float64Array(n) : null,
          buildingHeight: clutter ? new Float64Array(n) : null,
        };
        bufs.set(n, b);
      }
      return b;
    };

    /** Couverture exacte, moteur complet, pour un emplacement retenu. */
    const exactCoverage = (origin, originElev) => {
      let covered = 0;
      let reachable = 0;
      let marginSum = 0;
      let links = 0;
      for (let ti = 0; ti < nT; ti++) {
        const t = targets[ti];
        const tE = tElev[ti];
        if (!Number.isFinite(tE)) continue;
        reachable++;
        const d = haversine(origin, t);
        if (d < grid.step) {
          covered++;
          continue;
        }
        if (d > maxRangeM) continue;

        const n = profileSampleCount(d, grid.step);
        const b = bufFor(n);
        const prof = b.prof;
        let ok = true;
        for (let i = 0; i < n; i++) {
          const f = i / (n - 1);
          const lat = origin.lat + (t.lat - origin.lat) * f;
          const lon = origin.lon + (t.lon - origin.lon) * f;
          const v = sampleGrid(grid, dem, lat, lon);
          if (!Number.isFinite(v)) {
            ok = false;
            break;
          }
          prof[i] = v;
          if (clutter) {
            const fv = sampleGrid(grid, foliageData, lat, lon);
            const bv = sampleGrid(grid, buildingData, lat, lon);
            b.foliage[i] = Number.isFinite(fv) ? fv : 0;
            b.buildingHeight[i] = Number.isFinite(bv) ? bv : 0;
          }
        }
        if (!ok) continue;
        prof[0] = originElev;
        prof[n - 1] = tE;

        const hop = analyzeHop(prof, d, {
          ...params,
          foliage: b.foliage ?? undefined,
          buildingHeight: b.buildingHeight ?? undefined,
        });
        links++;
        if (hop.margin95 >= threshold) {
          covered++;
          marginSum += hop.margin95;
        }
      }
      return { covered, reachable, marginSum, links };
    };

    const results = [];
    let exactLinks = 0;
    shortlist.forEach((idx, i) => {
      const ix = idx % cand.nx;
      const iy = (idx - ix) / cand.nx;
      const origin = { lat: latOf(cand, iy), lon: lonOf(cand, ix) };
      const elev = sampleGrid(grid, dem, origin.lat, origin.lon);
      if (!Number.isFinite(elev)) return;
      const e = exactCoverage(origin, elev);
      exactLinks += e.links;
      const fraction = e.reachable ? e.covered / e.reachable : 0;
      // En mode exhaustif la carte de chaleur montre la couverture exacte,
      // et non un score de filtrage.
      if (plan.exhaustive) scores[idx] = e.covered;
      results.push({
        lat: origin.lat,
        lon: origin.lon,
        elev,
        covered: e.covered,
        reachable: e.reachable,
        fraction,
        areaKm2: fraction * zoneAreaKm2,
        meanMargin: e.covered ? e.marginSum / e.covered : NaN,
        screened: scores[idx],
      });
      if (i % 32 === 0) self.postMessage({ type: 'progress', phase: 'exact', done: i, total: shortlist.length });
    });

    results.sort((a, b) => b.covered - a.covered || b.meanMargin - a.meanMargin);
    results.length = Math.min(results.length, 60);
    const tEnd = performance.now();

    // Ce que la force brute aurait coute, pour situer le gain.
    const bruteLinks = nC * nT;

    self.postMessage(
      {
        type: 'done',
        top: results,
        scores,
        cand: { nx: cand.nx, ny: cand.ny, lat0: cand.lat0, lon0: cand.lon0, dLat: cand.dLat, dLon: cand.dLon },
        stats: {
          exhaustive: !!plan.exhaustive,
          candidates: nC,
          targets: nT,
          sweeps,
          refined,
          stride,
          nAz,
          exactCandidates: results.length,
          exactLinks,
          bruteLinks,
          msCoarse: Math.round(tCoarse - t0),
          msRefine: Math.round(tRefine - tCoarse),
          msExact: Math.round(tEnd - tRefine),
          ms: Math.round(tEnd - t0),
          best: results[0] ?? null,
        },
      },
      [scores.buffer]
    );
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message ?? String(err) });
  }
};
