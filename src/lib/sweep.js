// Balayage radial a horizon incrementiel.
//
// L approche naive evalue une liaison par couple (emplacement, point de test) :
// pour chacun elle redescend tout le profil du terrain. Le meme relief est
// donc relu des centaines de fois, une fois par point de test aligne derriere
// lui.
//
// Ici, un emplacement est traite en un seul balayage : on tire des rayons et
// l on avance le long de chacun en gardant **l angle d elevation maximal deja
// rencontre**. Cet angle est exactement l horizon vu depuis l antenne ; un
// point est degage s il s eleve au-dessus, masque sinon, et l ecart donne
// directement la hauteur d obstruction du diffracteur dominant. Chaque maille
// est donc visitee une fois, pour un travail constant.
//
// Cout : O(rayons x echantillons) au lieu de O(points de test x longueur de
// profil). Le rapport vaut environ R / (2 x pas des points de test) - sans
// effet sur une petite zone, decisif des que le rayon couvre beaucoup de
// mailles.
//
// Deux approximations, assumees parce que ce balayage **filtre** les
// emplacements avant un re-calcul exact des meilleurs :
//   - projection equirectangulaire locale plutot que geodesique (ecart < 0,1 %
//     sur quelques dizaines de km, deja l hypothese du masquage de grille) ;
//   - une seule arete de diffraction (l horizon dominant) au lieu de la
//     construction recursive de Deygout, et profondeur de vegetation accumulee
//     sous la ligne d horizon plutot que sous le faisceau propre a chaque
//     recepteur.

import {
  knifeEdgeLoss,
  diffractionParam,
  fresnelRadius,
  fspl,
  foliageLoss,
  locationSigma,
  Z95,
  C_LIGHT,
} from './radio.js';
import { sampleGrid } from './dem.js';
import { metersPerDeg } from './geo.js';

/**
 * Bombement terrestre rapporte a l origine du rayon.
 *
 * Le moteur principal exprime le bombement entre deux extremites,
 * `d1*d2/(12,75*k)`. Vu depuis une origine fixe, la transformation equivalente
 * est `d^2/(12,75*k)` retranchee au relief : la ligne de visee redevient une
 * droite, ce qui rend le balayage incrementiel possible. Les deux conventions
 * donnent le meme degagement - c est un simple changement de repere.
 */
const bulgeFromOrigin = (dKm, k) => (dKm * dKm) / (12.75 * k);

/**
 * Couverture atteinte depuis un emplacement, en un balayage.
 *
 * Marque directement les mailles de test couvertes dans `stamp`, un tableau
 * d entiers estampille par numero d emplacement : cela evite de remettre a
 * zero un masque a chaque candidat, ce qui couterait plus cher que le balayage
 * lui-meme.
 *
 * @returns {number} nombre de mailles de test couvertes
 */
export function sweepCandidate({
  grid,
  dem,
  foliageData,
  buildingData,
  origin,
  originElev,
  target, // { lat0, lon0, dLat, dLon, nx, ny }
  stamp,
  mark, // valeur d estampille pour cet emplacement
  zone,
  params, // { freqMHz, txPower, gA, gB, cableLoss, sensitivity, k, hA, hB }
  threshold,
  nAz,
  rayStepM,
  maxRangeM,
}) {
  const { k, freqMHz, hA, hB } = params;
  const lambda = C_LIGHT / (freqMHz * 1e6);
  const mPerDeg = metersPerDeg(origin.lat);
  const zA = originElev + hA;

  const budget = params.txPower + params.gA + params.gB - 2 * params.cableLoss - params.sensitivity;
  let covered = 0;

  for (let a = 0; a < nAz; a++) {
    const th = (2 * Math.PI * a) / nAz;
    // Pas unitaire en degres : la trigonometrie sort de la boucle interne.
    const dLatPerM = Math.cos(th) / mPerDeg.lat;
    const dLonPerM = Math.sin(th) / mPerDeg.lon;

    let maxAngle = -Infinity; // horizon vu depuis l antenne
    let horizonD = 0; // distance du diffracteur dominant
    let vegDepth = 0; // vegetation traversee, cumulee sous l horizon

    for (let d = rayStepM; d <= maxRangeM; d += rayStepM) {
      const lat = origin.lat + d * dLatPerM;
      const lon = origin.lon + d * dLonPerM;
      // Le relief n est connu que sur la zone. Un rayon qui en sort n y
      // rentrera plus (rectangle convexe) : on arrete la.
      if (lat < zone.latMin || lat > zone.latMax || lon < zone.lonMin || lon > zone.lonMax) break;

      const g = sampleGrid(grid, dem, lat, lon);
      if (!Number.isFinite(g)) break;

      const dKm = d / 1000;
      const bld = buildingData ? sampleGrid(grid, buildingData, lat, lon) : 0;
      // Repere a terre plate : le relief descend du bombement, la visee est
      // alors une droite depuis l antenne.
      const ground = g - bulgeFromOrigin(dKm, k) + (Number.isFinite(bld) ? bld : 0);

      const veg = foliageData ? sampleGrid(grid, foliageData, lat, lon) : 0;
      const canopy = ground + (Number.isFinite(veg) ? veg : 0);

      // --- Le recepteur potentiel a cet endroit ---------------------------
      const zR = ground + hB;
      const angR = (zR - zA) / d;

      // Hauteur du diffracteur dominant au-dessus de la visee antenne->recepteur.
      // Negative quand la visee passe au-dessus de l horizon.
      const h = Number.isFinite(maxAngle) && horizonD > 0 ? horizonD * (maxAngle - angR) : -Infinity;

      let lossDiff = 0;
      let clearanceRatio = 1;
      if (h > -1e9 && horizonD > 0 && horizonD < d) {
        const d1 = horizonD;
        const d2 = d - horizonD;
        const v = diffractionParam(h, d1, d2, lambda);
        lossDiff = knifeEdgeLoss(v);
        const r1 = fresnelRadius(d1 / 1000, d2 / 1000, freqMHz, dKm);
        if (r1 > 0) clearanceRatio = -h / r1;
      }

      const lossFoliage = foliageLoss(vegDepth, freqMHz);
      const margin = budget - fspl(dKm, freqMHz) - lossDiff - lossFoliage;
      const sigma = locationSigma(vegDepth, lossDiff);
      const margin95 = margin - Z95 * sigma;

      if (margin95 >= threshold) {
        // Maille de test contenant cet echantillon : les points de test sont
        // des centres de maille, d ou l arrondi.
        const ix = Math.round((lon - target.lon0) / target.dLon);
        const iy = Math.round((lat - target.lat0) / target.dLat);
        if (ix >= 0 && ix < target.nx && iy >= 0 && iy < target.ny) {
          const idx = iy * target.nx + ix;
          if (stamp[idx] !== mark) {
            stamp[idx] = mark;
            covered++;
          }
        }
      }

      // --- Mise a jour de l horizon pour la suite du rayon ------------------
      // Le sommet opaque (relief + bati) fait horizon ; la canopee, milieu
      // absorbant, n arrete pas la visee mais s ajoute a la profondeur
      // traversee tant que l horizon passe sous sa cime.
      const angTop = (ground - zA) / d;
      if (angTop > maxAngle) {
        maxAngle = angTop;
        horizonD = d;
      }
      if (canopy > ground && zA + maxAngle * d < canopy) vegDepth += rayStepM;
    }
  }

  return covered;
}

/**
 * Nombre de rayons pour qu aucune maille de test ne passe entre deux rayons.
 *
 * L ecart entre rayons voisins croit avec la distance : a `maxRangeM`, il vaut
 * `2*pi*R/nAz`. Le maintenir sous la taille d une maille garantit que toute
 * maille atteignable est touchee.
 */
export function raysForRange(maxRangeM, cellM) {
  return Math.max(16, Math.min(4096, Math.ceil((2 * Math.PI * maxRangeM) / Math.max(1, cellM))));
}
