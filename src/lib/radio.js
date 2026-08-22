// Moteur de propagation : espace libre + zone de Fresnel + diffraction par
// arete (Fresnel-Kirchhoff, ITU-R P.526), avec correction de courbure
// terrestre k = 4/3.

export const C_LIGHT = 299792458;

/** Presets LoRa Meshtastic et sensibilite recepteur associee (dBm). */
export const LORA_PRESETS = [
  { id: 'ShortFast', label: 'ShortFast', sens: -121, sf: 7, bw: 250 },
  { id: 'ShortSlow', label: 'ShortSlow', sens: -124, sf: 8, bw: 250 },
  { id: 'MediumFast', label: 'MediumFast', sens: -126, sf: 9, bw: 250 },
  { id: 'MediumSlow', label: 'MediumSlow', sens: -128, sf: 10, bw: 250 },
  { id: 'LongFast', label: 'LongFast', sens: -130, sf: 11, bw: 250 },
  { id: 'LongSlow', label: 'LongSlow', sens: -133, sf: 12, bw: 125 },
  { id: 'VeryLongSlow', label: 'VeryLongSlow', sens: -137, sf: 12, bw: 62.5 },
];

export const PRESET_BY_ID = Object.fromEntries(LORA_PRESETS.map((p) => [p.id, p]));

/**
 * Regions Meshtastic. erpLimit = limite reglementaire en ERP (dBm).
 * EU 868 : 14 dBm ERP sur la majorite de la bande, 20 dBm sur la sous-bande
 * 869,4-869,65 MHz (g4). Cette sous-bande autorise en realite jusqu a
 * 27 dBm ERP sous EN 300 220 avec un rapport cyclique de 10 % ; on retient ici
 * la valeur prudente de 20 dBm demandee par la specification.
 */
export const REGIONS = [
  {
    id: 'EU_868',
    label: 'EU 868 (Europe)',
    freq: 869.5,
    erpLimit: 20,
    subBand: [869.4, 869.65],
    erpLimitOutside: 14,
    note: 'Sous-bande g4 869,4-869,65 MHz : 20 dBm ERP retenu (EN 300 220 autorise 27 dBm ERP a 10 % de rapport cyclique). Ailleurs en 868 : 14 dBm ERP.',
  },
  {
    id: 'US',
    label: 'US 915',
    freq: 915,
    erpLimit: 30,
    note: 'FCC part 15.247 : 30 dBm conduits, reduction requise au-dela de 6 dBi de gain.',
  },
  {
    id: 'ANZ',
    label: 'ANZ 923',
    freq: 923,
    erpLimit: 30,
    note: 'Australie / Nouvelle-Zelande, classe LIPD.',
  },
  {
    id: 'IN',
    label: 'IN 866',
    freq: 866,
    erpLimit: 30,
    note: 'Inde, bande 865-867 MHz.',
  },
  {
    id: 'RU',
    label: 'RU 869',
    freq: 869,
    erpLimit: 20,
    note: 'Russie, bande 868,7-869,2 MHz.',
  },
  {
    id: 'CUSTOM',
    label: 'Personnalise',
    freq: 869,
    erpLimit: 14,
    note: 'Verifiez la reglementation locale applicable.',
  },
];

export const REGION_BY_ID = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

/**
 * Materiels connus. Selectionner un materiel renseigne d un coup la puissance
 * d emission, le gain d antenne et la perte de cable des trois noeuds.
 *
 * Les puissances proviennent des fiches techniques des transceivers, pas des
 * pages produit : c est la seule source chiffree fiable. Le firmware
 * Meshtastic applique de toute facon un plafond supplementaire selon la
 * region, et le gain de l antenne fournie est rarement documente - d ou les
 * valeurs estimees, signalees comme telles dans l interface.
 */
export const DEVICES = [
  {
    id: 'custom',
    label: 'Personnalise / autre materiel',
    custom: true,
    note: 'Saisissez vous-meme la puissance et les gains d antenne.',
  },
  {
    id: 'xiao_wio_sx1262',
    label: 'Seeed XIAO nRF52840 + Wio-SX1262',
    power: 22,
    gain: 2,
    cableLoss: 0,
    freqMin: 862,
    freqMax: 930,
    estimatedGain: true,
    estimatedPower: true,
    summary: 'nRF52840 Cortex-M4 64 MHz, BLE 5.0 / NFC - Wio-SX1262, 862 a 930 MHz',
    note:
      'Puissance de 22 dBm reprise de la fiche du SX1262 (amplificateur haute puissance) : ' +
      'la description du kit ne la precise pas, verifiez le reglage effectif de votre firmware. ' +
      'Gain de 2 dBi estime pour l antenne fournie, a remplacer si vous connaissez la votre. ' +
      'Antenne montee directement sur le module : perte de cable nulle.',
  },
  {
    id: 'generic_sx1262',
    label: 'Module SX1262 generique',
    power: 22,
    gain: 2,
    cableLoss: 0,
    freqMin: 150,
    freqMax: 960,
    estimatedGain: true,
    summary: 'Semtech SX1262, sortie haute puissance jusqu a 22 dBm',
    note: 'Valeur maximale du SX1262. Le gain depend entierement de l antenne montee.',
  },
  {
    id: 'generic_sx127x',
    label: 'Module SX1276 / SX1278 generique',
    power: 20,
    gain: 2,
    cableLoss: 0,
    freqMin: 137,
    freqMax: 1020,
    estimatedGain: true,
    summary: 'Semtech SX1276/78, sortie PA_BOOST jusqu a 20 dBm',
    note: 'Valeur maximale sur la broche PA_BOOST. Le gain depend de l antenne montee.',
  },
];

export const DEVICE_BY_ID = Object.fromEntries(DEVICES.map((d) => [d.id, d]));

/** La frequence demandee tient-elle dans la bande supportee par le materiel ? */
export function deviceSupportsFreq(deviceId, freqMHz) {
  const d = DEVICE_BY_ID[deviceId];
  if (!d || d.custom) return true;
  return freqMHz >= d.freqMin && freqMHz <= d.freqMax;
}

/** Limite ERP applicable compte tenu de la frequence exacte. */
export function erpLimitFor(regionId, freqMHz) {
  const r = REGION_BY_ID[regionId] ?? REGION_BY_ID.CUSTOM;
  if (r.subBand) {
    const inside = freqMHz >= r.subBand[0] && freqMHz <= r.subBand[1];
    return inside ? r.erpLimit : r.erpLimitOutside;
  }
  return r.erpLimit;
}

/** ERP (dBm) = puissance conduite + gain - pertes - 2,15 dB (reference dipole). */
export function erp(powerDbm, gainDbi, cableLossDb) {
  return powerDbm + gainDbi - cableLossDb - 2.15;
}

/** PIRE / EIRP (dBm) = puissance conduite + gain - pertes. */
export function eirp(powerDbm, gainDbi, cableLossDb) {
  return powerDbm + gainDbi - cableLossDb;
}

/** Longueur d onde en metres. */
export const wavelength = (freqMHz) => C_LIGHT / (freqMHz * 1e6);

/** Perte en espace libre, dB. D en km, f en MHz. */
export function fspl(dKm, freqMHz) {
  if (dKm <= 0) return 0;
  return 20 * Math.log10(dKm) + 20 * Math.log10(freqMHz) + 32.44;
}

/**
 * Rayon de la premiere zone de Fresnel, en metres.
 * r = 17.31 * sqrt(d1*d2 / (f_GHz * D)) avec d1, d2, D en km.
 * La constante 17.31 impose f en GHz ; la specification indiquait des MHz,
 * ce qui sous-estimait le rayon d un facteur ~31.
 */
export function fresnelRadius(d1Km, d2Km, freqMHz, dTotKm) {
  if (dTotKm <= 0 || d1Km <= 0 || d2Km <= 0) return 0;
  const fGHz = freqMHz / 1000;
  return 17.31 * Math.sqrt((d1Km * d2Km) / (fGHz * dTotKm));
}

/**
 * Bombement terrestre apparent, en metres, d1 et d2 en km.
 * h = d1*d2 / (12.75 * k) ; avec k = 4/3 -> h = d1*d2 / 17.
 * Equivalent a (d1*d2*1000)/(2*8500) : la specification omettait la
 * conversion km -> m.
 */
export function earthBulge(d1Km, d2Km, k = 4 / 3) {
  return (d1Km * d2Km) / (12.75 * k);
}

/**
 * Perte de diffraction par arete unique, ITU-R P.526.
 * J(v) = 6.9 + 20*log10( sqrt((v-0.1)^2 + 1) + v - 0.1 ) pour v > -0.78
 */
export function knifeEdgeLoss(v) {
  if (v <= -0.78) return 0;
  const t = v - 0.1;
  return 6.9 + 20 * Math.log10(Math.sqrt(t * t + 1) + t);
}

/** Parametre de diffraction v. h, d1, d2, lambda en metres. */
export function diffractionParam(h, d1, d2, lambda) {
  if (d1 <= 0 || d2 <= 0) return -10;
  return h * Math.sqrt((2 * (d1 + d2)) / (lambda * d1 * d2));
}

/**
 * Arete dominante d un troncon : celle de parametre v maximal.
 * `terr` contient le relief deja corrige du bombement terrestre.
 */
function dominantEdge(terr, i0, i1, z0, z1, stepM, lambda) {
  let bestV = -Infinity;
  let bestI = -1;
  const span = i1 - i0;
  for (let i = i0 + 1; i < i1; i++) {
    const f = (i - i0) / span;
    const los = z0 + (z1 - z0) * f;
    const h = terr[i] - los;
    const v = diffractionParam(h, (i - i0) * stepM, (i1 - i) * stepM, lambda);
    if (v > bestV) {
      bestV = v;
      bestI = i;
    }
  }
  return { v: bestV, i: bestI };
}

/**
 * Perte de diffraction par aretes multiples, construction de Deygout.
 *
 * On isole l arete dominante, puis on recommence de part et d autre en
 * prenant son sommet comme extremite. Les pertes s additionnent.
 *
 * Pourquoi ne pas se contenter d une seule arete : sur un relief vallonne, le
 * seul obstacle dominant ne represente qu une partie de l attenuation. Avec le
 * budget de liaison tres large de LoRa (plus de 150 dB), sous-estimer ainsi la
 * perte donne des portees qui ne s arretent jamais - la zone de couverture
 * degenere alors en cercle parfait cale sur la limite d exploration, ce qui ne
 * decrit plus rien du terrain.
 *
 * Profondeur limitee a 3 aretes, conformement a l usage courant de Deygout :
 * au-dela la methode surestime nettement.
 */
export const DEYGOUT_MAX_DEPTH = 1;

function deygout(terr, i0, i1, z0, z1, stepM, lambda, depth) {
  if (i1 - i0 < 2) return 0;
  const edge = dominantEdge(terr, i0, i1, z0, z1, stepM, lambda);
  if (edge.i < 0 || edge.v <= -0.78) return 0;

  let loss = knifeEdgeLoss(edge.v);

  // On ne decompose en sous-trajets que si l arete coupe reellement la ligne
  // de visee (v > 0). Sans cette condition, Deygout traite le sol lisse d une
  // plaine comme une succession de lames de couteau et ajoute une dizaine de
  // decibels fictifs : un trajet plat de 20 km rasant le sol ressortait a
  // 17,7 dB au lieu des ~6 dB d une obstruction rasante unique.
  if (depth < DEYGOUT_MAX_DEPTH && edge.v > 0) {
    const zTop = terr[edge.i];
    loss += deygout(terr, i0, edge.i, z0, zTop, stepM, lambda, depth + 1);
    loss += deygout(terr, edge.i, i1, zTop, z1, stepM, lambda, depth + 1);
  }
  return loss;
}

/**
 * Attenuation totale par diffraction sur un profil complet.
 * Renvoie aussi l arete dominante, pour l annotation des graphiques.
 */
export function multiEdgeDiffraction(terr, n, zA, zB, stepM, lambda) {
  const main = dominantEdge(terr, 0, n - 1, zA, zB, stepM, lambda);
  return {
    loss: deygout(terr, 0, n - 1, zA, zB, stepM, lambda, 0),
    v: Number.isFinite(main.v) ? main.v : -10,
    index: main.i,
  };
}

/**
 * Attenuation par le feuillage, modele exponentiel modifie de Weissberger.
 *
 *   L = 0,45 * f^0,284 * d           pour 0 < d <= 14 m
 *   L = 1,33 * f^0,284 * d^0,588     pour 14 < d <= 400 m
 *
 * f en GHz, d = profondeur de vegetation reellement traversee, en metres.
 * Les deux branches se raccordent exactement a 14 m.
 *
 * Le feuillage est traite comme un **milieu absorbant** et non comme un
 * obstacle : a 868 MHz il est partiellement transparent, contrairement a une
 * facade. Cette separation evite de compter deux fois la meme vegetation,
 * une fois en diffraction et une fois en absorption.
 *
 * Le modele sature au-dela de 400 m : plus profond, l attenuation croit trop
 * lentement pour que l extrapolation garde un sens.
 */
export const FOLIAGE_MAX_DEPTH = 400;

export function foliageLoss(depthM, freqMHz) {
  if (!(depthM > 0)) return 0;
  const f = Math.pow(freqMHz / 1000, 0.284);
  const d = Math.min(depthM, FOLIAGE_MAX_DEPTH);
  return d <= 14 ? 0.45 * f * d : 1.33 * f * Math.pow(d, 0.588);
}

/**
 * Ecart-type de la variabilite de lieu, en dB.
 *
 * Deux liaisons geometriquement identiques ne donnent pas le meme niveau recu :
 * le champ varie de facon log-normale d un emplacement a l autre. ITU-R P.1812
 * retient environ 5,5 dB sur terre entre 100 MHz et 3 GHz ; la dispersion monte
 * vers 8 dB sous couvert dense. On interpole entre les deux selon la
 * vegetation traversee, et on majore legerement les trajets fortement
 * diffractes, dont le niveau est par nature plus instable.
 */
export const SIGMA_OPEN = 5.5;
export const SIGMA_CLUTTERED = 8;

export function locationSigma(foliageDepthM = 0, diffractionDb = 0) {
  const clutter = Math.min(1, (foliageDepthM || 0) / 200);
  const base = SIGMA_OPEN + (SIGMA_CLUTTERED - SIGMA_OPEN) * clutter;
  return Math.min(9.5, base + (diffractionDb > 15 ? 1.5 : 0));
}

/** Quantile normal unilateral a 95 %. */
export const Z95 = 1.6449;

/**
 * Penalite de score appliquee lorsque le degagement de Fresnel tombe sous
 * 60 %. J(v) est quasi nul entre 0 et 60 % de degagement, or une liaison a
 * 20 % de degagement est nettement plus fragile que ne le dit le seul bilan.
 * Penalite lineaire : 0 dB a 60 %, 6 dB a 0 % et en dessous.
 */
export function clearancePenalty(ratio) {
  if (!Number.isFinite(ratio)) return 6;
  if (ratio >= 0.6) return 0;
  const r = Math.max(0, ratio);
  return ((0.6 - r) / 0.6) * 6;
}

/**
 * Analyse d un bond.
 *
 * @param {Float32Array|number[]} elev altitudes du sol, de A vers B, pas constant
 * @param {number} distM longueur du bond en metres
 * @param {object} p { hA, hB, gA, gB, freqMHz, txPower, cableLoss, sensitivity, k }
 * @param {boolean} detail renvoyer les series completes (pour les graphiques)
 */
/**
 * Tampon reutilise pour le relief corrige du bombement. Un calcul de couverture
 * appelle `analyzeHop` plusieurs centaines de milliers de fois : allouer un
 * tableau a chaque appel dominerait le temps de calcul.
 */
let terrScratch = new Float64Array(256);

export function analyzeHop(elev, distM, p, detail = false) {
  const n = elev.length;
  const dTotKm = distM / 1000;
  const lambda = wavelength(p.freqMHz);
  const k = p.k ?? 4 / 3;

  const zA = elev[0] + p.hA;
  const zB = elev[n - 1] + p.hB;

  let worstRatio = Infinity;
  let worstIdx = -1;
  let worstObstacle = 0;
  let foliageDepth = 0;

  // Couverture du sol, optionnelle. Le bati est un obstacle opaque, ajoute au
  // profil de diffraction ; la vegetation est un milieu absorbant, dont on
  // cumule la profondeur traversee. Sans ces tableaux, le calcul est
  // strictement celui du sol nu.
  const bld = p.buildingHeight;
  const veg = p.foliage;
  const stepM = n > 1 ? distM / (n - 1) : 0;

  // Le relief corrige sert aussi bien aux graphiques qu au calcul de
  // diffraction : il est donc toujours construit. Hors mode detaille, il l est
  // dans un tampon partage.
  if (!detail && terrScratch.length < n) terrScratch = new Float64Array(n);
  const terrain = detail ? new Float64Array(n) : terrScratch;
  const los = detail ? new Float64Array(n) : null;
  const fresnelUp = detail ? new Float64Array(n) : null;
  const fresnelDown = detail ? new Float64Array(n) : null;
  const dist = detail ? new Float64Array(n) : null;
  const canopy = detail ? new Float64Array(n) : null;

  for (let i = 0; i < n; i++) {
    const f = n === 1 ? 0 : i / (n - 1);
    const d1 = dTotKm * f;
    const d2 = dTotKm - d1;
    // Le relief est remonte du bombement terrestre : on raisonne ensuite en
    // geometrie plane, convention classique des profils 4/3.
    const ground = elev[i] + earthBulge(d1, d2, k);
    const sight = zA + (zB - zA) * f;
    const r1 = fresnelRadius(d1, d2, p.freqMHz, dTotKm);

    // Les extremites portent les antennes : y empiler du bati remonterait la
    // ligne de visee elle-meme, alors que la hauteur d antenne saisie fait
    // deja foi.
    const edge = i === 0 || i === n - 1;
    const opaque = ground + (!edge && bld ? bld[i] : 0);
    terrain[i] = opaque;

    if (detail) {
      los[i] = sight;
      fresnelUp[i] = sight + r1;
      fresnelDown[i] = sight - r1;
      dist[i] = d1;
      canopy[i] = opaque + (veg ? veg[i] : 0);
    }

    if (edge) continue;

    // Profondeur de vegetation traversee : le rayon doit passer sous la cime
    // tout en restant au-dessus du sol. Plus bas il est bloque, et c est la
    // diffraction qui en rend compte.
    if (veg && veg[i] > 0 && sight < opaque + veg[i] && sight > opaque) {
      foliageDepth += stepM;
    }

    const obstacle = opaque - sight; // > 0 : le relief coupe la ligne de vue
    if (r1 > 0) {
      const ratio = -obstacle / r1; // 1 = premiere zone de Fresnel entierement libre
      if (ratio < worstRatio) {
        worstRatio = ratio;
        worstIdx = i;
        worstObstacle = obstacle;
      }
    }
  }

  if (!Number.isFinite(worstRatio)) worstRatio = 1;

  // Diffraction sur aretes multiples : se limiter a l obstacle dominant
  // sous-estime nettement la perte sur un relief vallonne.
  const diff = multiEdgeDiffraction(terrain, n, zA, zB, stepM, lambda);
  const worstV = diff.v;
  if (diff.index >= 0) worstIdx = diff.index;

  const lossFspl = fspl(dTotKm, p.freqMHz);
  const lossDiff = diff.loss;
  const lossFoliage = foliageLoss(foliageDepth, p.freqMHz);
  const rssi =
    p.txPower + p.gA + p.gB - 2 * p.cableLoss - lossFspl - lossDiff - lossFoliage;
  const margin = rssi - p.sensitivity;
  const sigma = locationSigma(foliageDepth, lossDiff);
  // Marge tenue sur 95 % des emplacements. C est elle qui fonde le verdict et
  // le classement : la valeur mediane est trop optimiste pour decider.
  const margin95 = margin - Z95 * sigma;
  const penalty = clearancePenalty(worstRatio);

  const out = {
    distM,
    fspl: lossFspl,
    diffraction: lossDiff,
    foliage: lossFoliage,
    foliageDepth,
    v: worstV,
    rssi,
    margin,
    margin50: margin,
    margin95,
    sigma,
    scored: margin95 - penalty,
    penalty,
    clearance: worstRatio, // fraction de la 1re zone de Fresnel degagee
    worstIdx,
    worstObstacle,
    zA,
    zB,
    elevA: elev[0],
    elevB: elev[n - 1],
  };

  if (detail) {
    out.series = { dist, terrain, los, fresnelUp, fresnelDown, canopy };
    if (worstIdx >= 0) {
      out.worstPoint = {
        distKm: dist[worstIdx],
        terrain: terrain[worstIdx],
        los: los[worstIdx],
      };
    }
  }
  return out;
}

/** Qualite globale d un site relais : le maillon faible commande. */
export function combine(hop1, hop2) {
  return {
    hop1,
    hop2,
    margin: Math.min(hop1.margin, hop2.margin),
    margin50: Math.min(hop1.margin50, hop2.margin50),
    margin95: Math.min(hop1.margin95, hop2.margin95),
    foliage: hop1.foliage + hop2.foliage,
    foliageDepth: hop1.foliageDepth + hop2.foliageDepth,
    score: Math.min(hop1.scored, hop2.scored),
    clearance: Math.min(hop1.clearance, hop2.clearance),
  };
}

export const VERDICTS = {
  impossible: {
    level: 'impossible',
    label: 'Liaison impossible',
    tone: 'error',
    short: 'Impossible',
  },
  obstrue: {
    level: 'obstrue',
    label: 'Sans visibilite directe',
    tone: 'error',
    short: 'Obstrue',
  },
  limite: {
    level: 'limite',
    label: 'Liaison a la limite',
    tone: 'warn',
    short: 'Limite',
  },
  fragile: {
    level: 'fragile',
    label: 'Liaison possible mais fragile',
    tone: 'warn',
    short: 'Fragile',
  },
  possible: {
    level: 'possible',
    label: 'Liaison possible',
    tone: 'ok',
    short: 'Possible',
  },
};

/**
 * Verdict de faisabilite d une liaison.
 *
 * Cinq situations, dans l ordre de gravite :
 *
 * - marge negative : le signal arrive sous le seuil de sensibilite du
 *   recepteur, rien ne passe, quelle que soit la patience ;
 * - degagement tres negatif : le relief coupe franchement la ligne de visee.
 *   Seule la diffraction fait passer le signal. La construction de Deygout
 *   tient compte de plusieurs aretes, mais un relief massif reste modelise
 *   comme une succession de lames de couteau : la perte reelle depend de la
 *   forme des sommets et de la nature du sol, que le MNT ne dit pas ;
 * - marge positive mais inferieure a l objectif : le bilan se boucle sur le
 *   papier, sans aucune reserve pour la meteo, la vegetation ou le bruit ;
 * - objectif atteint mais moins de 60 % de la zone de Fresnel degagee : le
 *   bilan est bon, la geometrie ne l est pas ;
 * - objectif atteint et geometrie propre.
 *
 * Le verdict se prononce sur `margin95`, la marge tenue sur 95 % des
 * emplacements, et non sur la mediane : c est la seule des deux sur laquelle
 * on puisse decider.
 */

/**
 * Seuil de degagement en dessous duquel l estimation de diffraction devient
 * trop incertaine pour conclure : le relief depasse la ligne de visee de plus
 * d un rayon de Fresnel.
 */
export const BLOCKED_CLEARANCE = -1;

export function assessLink({
  margin,
  margin95,
  clearance,
  desiredMargin = 10,
  foliage = 0,
  sigma = SIGMA_OPEN,
}) {
  const pct = Number.isFinite(clearance) ? Math.round(clearance * 100) : null;
  // Sans marge statistique fournie, on la reconstruit : les appelants qui ne
  // connaissent que la mediane restent servis.
  const m95 = Number.isFinite(margin95) ? margin95 : margin - Z95 * sigma;

  let v;
  if (!Number.isFinite(margin)) v = VERDICTS.impossible;
  else if (margin < 0) v = VERDICTS.impossible;
  else if (Number.isFinite(clearance) && clearance < BLOCKED_CLEARANCE) v = VERDICTS.obstrue;
  else if (m95 < 0) v = VERDICTS.limite;
  else if (m95 < desiredMargin || clearance < 0.6) v = VERDICTS.fragile;
  else v = VERDICTS.possible;

  const veg =
    foliage > 0.5 ? ` Dont ${foliage.toFixed(1)} dB attribues a la vegetation traversee.` : '';

  const reason = {
    impossible: !Number.isFinite(margin)
      ? 'Bilan de liaison indisponible.'
      : `Le signal arrive ${Math.abs(margin).toFixed(1)} dB sous le seuil de sensibilite du recepteur, ` +
        'et ce des la valeur mediane. Aucun reglage de puissance realiste ne comblera cet ecart : ' +
        'il faut surelever les antennes, deplacer un site ou ajouter un relais.' + veg,
    obstrue:
      `Le relief coupe la ligne de visee et la depasse de ${Math.abs(pct / 100).toFixed(1)} fois le rayon ` +
      'de Fresnel. Le signal ne passe plus que par diffraction, mecanisme dont l estimation reste ' +
      `incertaine sur un relief massif : la marge de ${margin.toFixed(1)} dB affichee est a prendre ` +
      'avec precaution.' + veg,
    limite:
      `La liaison passe au niveau median (${margin.toFixed(1)} dB) mais pas de facon fiable : ` +
      `sur 95 % des emplacements il ne resterait que ${m95.toFixed(1)} dB. ` +
      'Autrement dit, elle tiendra certains jours et pas d autres.' + veg,
    fragile:
      (m95 < desiredMargin
        ? `Marge fiable de ${m95.toFixed(1)} dB, en dessous de l objectif de ${desiredMargin} dB.`
        : `Marge fiable de ${m95.toFixed(1)} dB, mais ` +
          (pct < 0
            ? 'le relief affleure la ligne de visee'
            : `seulement ${pct} % de la premiere zone de Fresnel est degagee la ou il en faudrait 60 %`) +
          '.') +
      ' Le resultat ne laisse pas de reserve pour ce que le modele ignore.' + veg,
    possible:
      `Marge de ${margin.toFixed(1)} dB en median, ${m95.toFixed(1)} dB tenus sur 95 % des ` +
      `emplacements, et ${pct} % de la zone de Fresnel degagee.` + veg,
  }[v.level];

  return {
    ...v,
    margin,
    margin50: margin,
    margin95: m95,
    sigma,
    foliage,
    clearance,
    reason,
  };
}

/** Categorie visuelle d une marge. */
export function marginClass(m) {
  if (!Number.isFinite(m)) return 'unknown';
  if (m >= 15) return 'good';
  if (m >= 5) return 'fair';
  return 'poor';
}
