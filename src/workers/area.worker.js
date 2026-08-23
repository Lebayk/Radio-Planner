// Balayage des emplacements candidats pour couvrir une zone.
//
// Pour chaque emplacement possible du relais, on evalue la liaison vers chaque
// point de test de la zone et l on compte ceux qui passent. Le meilleur
// emplacement est celui qui en couvre le plus.
//
// C est volontairement un comptage direct, et non l aire du polygone de portee
// utilise ailleurs : la question posee porte sur la surface **de la zone**
// couverte, pas sur la portee dans toutes les directions. Compter des points
// de test y repond exactement, et traite sans cas particulier les poches
// couvertes au-dela d un versant, qu un polygone etoile ne sait pas
// representer.
//
// Aucun acces reseau : le MNT arrive entierement du thread principal.

import { analyzeHop } from '../lib/radio.js';
import { sampleGrid, profileSampleCount } from '../lib/dem.js';
import { haversine } from '../lib/geo.js';

self.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type !== 'area') return;

  try {
    const t0 = performance.now();
    const { grid, dem, clutter, candidates, targets, cand, params, threshold, maxRangeM, zoneAreaKm2 } = msg;

    // Altitude des points de test : constante d un candidat a l autre, donc
    // echantillonnee une fois pour toutes plutot qu a chaque bond.
    const nT = targets.length;
    const tElev = new Float64Array(nT);
    for (let i = 0; i < nT; i++) tElev[i] = sampleGrid(grid, dem, targets[i].lat, targets[i].lon);

    // Tampons de profil reutilises, indexes par longueur : les allouer a
    // chaque bond dominerait le temps de calcul.
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

    // La surface couverte se deduit de la fraction de points atteints et de la
    // surface reelle de la zone, et non d un comptage de mailles : le semis
    // regulier ne pave pas exactement le rectangle (huit points espaces de
    // 500 m couvrent 4,0 km, pas 3,88), et compter les mailles annoncerait
    // une surface couverte superieure a celle de la zone.
    const results = [];
    const scores = new Float32Array(candidates.length).fill(NaN);
    let evaluated = 0;
    let skippedRange = 0;
    const tick = Math.max(1, Math.floor(candidates.length / 100));

    for (let ci = 0; ci < candidates.length; ci++) {
      if (ci % tick === 0) self.postMessage({ type: 'progress', done: ci, total: candidates.length });

      const c = candidates[ci];
      const cElev = sampleGrid(grid, dem, c.lat, c.lon);
      if (!Number.isFinite(cElev)) continue;

      let covered = 0;
      let reachable = 0;
      let marginSum = 0;

      for (let ti = 0; ti < nT; ti++) {
        const t = targets[ti];
        const tE = tElev[ti];
        if (!Number.isFinite(tE)) continue;
        reachable++;

        const d = haversine(c, t);
        // Le point de test qui porte le relais est couvert par construction.
        if (d < grid.step) {
          covered++;
          continue;
        }
        // Au-dela de la portee en espace libre, aucun relief ne peut aider :
        // inutile de derouler le profil.
        if (d > maxRangeM) {
          skippedRange++;
          continue;
        }

        const n = profileSampleCount(d, grid.step);
        const b = bufFor(n);
        const prof = b.prof;
        for (let i = 0; i < n; i++) {
          const f = i / (n - 1);
          const lat = c.lat + (t.lat - c.lat) * f;
          const lon = c.lon + (t.lon - c.lon) * f;
          prof[i] = sampleGrid(grid, dem, lat, lon);
          if (clutter) {
            const v = sampleGrid(grid, clutter.foliage, lat, lon);
            const h = sampleGrid(grid, clutter.buildings, lat, lon);
            b.foliage[i] = Number.isFinite(v) ? v : 0;
            b.buildingHeight[i] = Number.isFinite(h) ? h : 0;
          }
        }
        // Les extremites viennent d un echantillonnage ponctuel, plus sur que
        // l interpolation le long du trajet.
        prof[0] = cElev;
        prof[n - 1] = tE;

        let ok = true;
        for (let i = 0; i < n; i++) {
          if (!Number.isFinite(prof[i])) {
            ok = false;
            break;
          }
        }
        if (!ok) continue;

        const hop = analyzeHop(prof, d, {
          ...params,
          foliage: b.foliage ?? undefined,
          buildingHeight: b.buildingHeight ?? undefined,
        });
        evaluated++;
        // Le verdict de l application se prononce sur la marge tenue sur 95 %
        // des emplacements : on retient le meme critere ici, sinon le
        // classement promettrait une couverture que le reste de l application
        // jugerait fragile.
        if (hop.margin95 >= threshold) {
          covered++;
          marginSum += hop.margin95;
        }
      }

      const fraction = reachable ? covered / reachable : 0;
      scores[ci] = fraction;
      results.push({
        lat: c.lat,
        lon: c.lon,
        elev: cElev,
        covered,
        reachable,
        fraction,
        areaKm2: fraction * zoneAreaKm2,
        meanMargin: covered ? marginSum / covered : NaN,
      });
    }

    results.sort((a, b) => b.covered - a.covered || b.meanMargin - a.meanMargin);

    self.postMessage(
      {
        type: 'done',
        top: results.slice(0, 60),
        scores,
        cand,
        stats: {
          candidates: candidates.length,
          targets: nT,
          evaluated,
          skippedRange,
          best: results[0] ?? null,
          ms: Math.round(performance.now() - t0),
        },
      },
      [scores.buffer]
    );
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message ?? String(err) });
  }
};
