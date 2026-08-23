// Dictionnaire de traduction FR/EN pur (sans React), pour que les modules
// charges dans le Web Worker (radio.js -> scan.worker.js) puissent traduire
// sans embarquer React dans le bundle du worker.
//
// Cle plate -> [texte FR, texte EN]. `tFor(lang, key, vars)` fait l interpolation
// `{{var}}`.

const STORAGE_KEY = 'relay-lang';

export function detectLang() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'fr' || saved === 'en') return saved;
  } catch {
    /* localStorage indisponible (navigation privee, quota) : repli silencieux. */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function localeFor(lang) {
  return lang === 'fr' ? 'fr-FR' : 'en-US';
}

// [fr, en] — cle plate, un domaine fonctionnel par prefixe.
const STRINGS = {
  // --- App shell -----------------------------------------------------------
  'app.subtitle': ['Implantation de relais Meshtastic sur relief reel', 'Meshtastic relay placement on real terrain'],
  'app.marginRetained': ['Marge retenue', 'Retained margin'],
  'app.cancel': ['Annuler', 'Cancel'],
  'app.rerun': ['Relancer', 'Rerun'],
  'app.runScan': ['Lancer le balayage', 'Run scan'],
  'app.export': ['Exporter', 'Export'],
  'app.exportEmpty': [
    'Rien a exporter pour l instant. Lancez un balayage, puis selectionnez un emplacement de relais.',
    'Nothing to export yet. Run a scan, then select a relay location.',
  ],
  'app.exportPreparing': ['preparation...', 'preparing...'],
  'app.export.gpx.label': ['GPX', 'GPX'],
  'app.export.gpx.hint': ['Trois points, pour un GPS', 'Three points, for a GPS'],
  'app.export.kml.label': ['KML', 'KML'],
  'app.export.kml.hint': ['Google Earth, avec le verdict', 'Google Earth, with the verdict'],
  'app.export.pdf.label': ['Rapport PDF', 'PDF report'],
  'app.export.pdf.hint': ['Bilan complet et graphiques', 'Full report with charts'],
  'app.nav.config': ['Reglages', 'Settings'],
  'app.nav.map': ['Carte', 'Map'],
  'app.nav.results': ['Resultats', 'Results'],
  'app.error.title': ['Erreur', 'Error'],
  'app.error.needHeight': [
    'Selectionnez au moins une hauteur d antenne pour le relais.',
    'Select at least one antenna height for the relay.',
  ],
  'app.error.tooBig': [
    'Zone trop vaste pour le pas demande. Augmentez le pas ou reduisez le rayon.',
    'Area too large for the requested step. Increase the step or reduce the radius.',
  ],
  'app.error.tooClose': [
    'TX et RX sont trop proches (moins de 200 m) : un relais n a pas de sens ici.',
    'TX and RX are too close (under 200 m): a relay makes no sense here.',
  ],
  'app.error.calc': ['Erreur de calcul : {{msg}}', 'Calculation error: {{msg}}'],
  'app.error.worker': ['Erreur du worker : {{msg}}', 'Worker error: {{msg}}'],
  'app.error.evalPoint': ['Impossible d evaluer ce point : {{msg}}', 'Could not evaluate this point: {{msg}}'],
  'app.error.exportPrep': ['Preparation impossible : {{msg}}', 'Preparation failed: {{msg}}'],
  'app.error.pdfUnavailable': ['Rapport PDF indisponible : {{msg}}', 'PDF report unavailable: {{msg}}'],
  'app.error.coverage': ['Calcul de couverture impossible : {{msg}}', 'Coverage calculation failed: {{msg}}'],
  'app.error.noUsableDirection': [
    'aucune direction exploitable, le relais est peut-etre trop bas ou entierement encaisse.',
    'no usable direction, the relay may be too low or entirely boxed in.',
  ],
  'app.error.unknownElev': ['altitude du relais inconnue.', 'relay altitude unknown.'],
  'app.warn.elevUnavailable': ['Altitudes TX/RX indisponibles : {{msg}}', 'TX/RX altitudes unavailable: {{msg}}'],
  'app.warn.elevMissing': [
    'Altitude indisponible pour TX ou RX. Le MNT choisi ne couvre probablement pas la zone.',
    'Elevation unavailable for TX or RX. The chosen DEM probably does not cover this area.',
  ],
  'app.warn.cacheCleared': ['Cache d altitudes vide.', 'Elevation cache cleared.'],
  'app.warn.noCandidate': [
    'Aucun emplacement candidat retenu. Elargissez le rayon, ou desactivez le filtre d accessibilite.',
    'No candidate location retained. Widen the radius, or disable the accessibility filter.',
  ],
  'app.warn.overpassUnavailable': [
    'Aucune instance OpenStreetMap Overpass joignable : la vegetation et le bati ne sont pas pris en ' +
      'compte, et la portee est donc surestimee. Le relief, lui, reste exact. Reessayez dans quelques minutes.',
    'No reachable OpenStreetMap Overpass instance: vegetation and buildings are not accounted for, so ' +
      'range is overestimated. Terrain itself stays accurate. Try again in a few minutes.',
  ],
  'app.warn.overpassPartial': [
    '{{failed}} tuile(s) de couverture du sol sur {{total}} sont restees inaccessibles (quota Overpass) : ' +
      'le couvert y est ignore, donc surestime localement. Relancez plus tard pour les completer.',
    '{{failed}} out of {{total}} ground cover tile(s) stayed unreachable (Overpass quota): cover is ' +
      'ignored there, so locally overestimated. Rerun later to complete them.',
  ],
  'app.warn.clutterFailed': [
    'Couverture du sol indisponible : {{msg}}. Calcul sur sol nu.',
    'Ground cover unavailable: {{msg}}. Computing on bare ground.',
  ],
  'app.warn.clutterCoverageFailed': [
    'Couverture du sol indisponible pour la portee : {{msg}}.',
    'Ground cover unavailable for range: {{msg}}.',
  ],
  'app.warn.stale': [
    'Les parametres ont change depuis le dernier balayage : relancez le calcul pour actualiser les resultats.',
    'Settings have changed since the last scan: rerun the calculation to refresh the results.',
  ],
  'app.progress.elevation': ['Telechargement du relief', 'Downloading terrain'],
  'app.progress.elevationCached': ['Relief deja en cache ({{n}} points)', 'Terrain already cached ({{n}} points)'],
  'app.progress.elevationDl': [
    'Telechargement du relief - {{done}}/{{total}} requetes',
    'Downloading terrain - {{done}}/{{total}} requests',
  ],
  'app.progress.clutter': ['Couverture du sol', 'Ground cover'],
  'app.progress.clutterCached': ['Couverture du sol deja en cache', 'Ground cover already cached'],
  'app.progress.clutterQuota': [
    'Couverture du sol - quota Overpass atteint, reprise dans {{s}} s',
    'Ground cover - Overpass quota reached, resuming in {{s}}s',
  ],
  'app.progress.clutterLayer': ['Couverture du sol - {{layer}} {{done}}/{{total}}', 'Ground cover - {{layer}} {{done}}/{{total}}'],
  'app.progress.candidates': ['Analyse des emplacements candidats', 'Analyzing candidate locations'],
  'app.progress.evaluatingPoint': ['Evaluation du point...', 'Evaluating point...'],
  'app.section.tx': ['Emetteur (TX)', 'Transmitter (TX)'],
  'app.section.rx': ['Recepteur (RX)', 'Receiver (RX)'],
  'app.section.radio': ['Parametres radio', 'Radio settings'],
  'app.section.search': ['Recherche du relais', 'Relay search'],
  'app.section.display': ['Affichage', 'Display'],
  'app.display.heatmap': ['Carte de chaleur de la qualite', 'Quality heatmap'],
  'app.display.candidates': ['Marqueurs des candidats alternatifs', 'Alternative candidate markers'],
  'app.display.coverage': ['Enveloppe de portee du relais', 'Relay range envelope'],
  'app.cacheStats': ['Cache MNT : {{tiles}} tuiles, {{kb}} Ko.', 'DEM cache: {{tiles}} tiles, {{kb}} KB.'],
  'app.clearCache': ['Vider le cache', 'Clear cache'],
  'app.resetConfig': ['Reinitialiser', 'Reset'],
  'app.emptyState1': ['Renseignez les deux sites, puis lancez le balayage.', 'Fill in both sites, then run the scan.'],
  'app.emptyState2': [
    'L application echantillonne le relief entre TX et RX et classe les emplacements de relais.',
    'The app samples the terrain between TX and RX and ranks relay locations.',
  ],
  'app.forcedPoint': ['Point force', 'Forced point'],
  'app.backToRanking': ['Revenir au classement', 'Back to ranking'],
  'app.manualCoords': ['{{lat}}, {{lon}} - altitude {{elev}} m', '{{lat}}, {{lon}} - elevation {{elev}} m'],
  'app.chainTitle': ['Chaine de relais', 'Relay chain'],
  'app.bestSitesTitle': [
    'Meilleurs emplacements pour un relais unique',
    'Best locations for a single relay',
  ],
  'app.bestSitesHint': [
    'Classement independant de la chaine ci-dessus : les meilleurs sites si l on ne pose qu un seul ' +
      'relais. Utile quand un second n est pas envisageable.',
    'Independent of the chain above: the best sites if only one relay is placed. Useful when a second ' +
      'one is not an option.',
  ],
  'app.siteN': ['Site #{{n}}', 'Site #{{n}}'],
  'app.height': ['Hauteur :', 'Height:'],
  'app.profilesTitle': ['Profils d elevation', 'Elevation profiles'],
  'app.hop1Title': ['Bond 1 : TX vers relais', 'Hop 1: TX to relay'],
  'app.hop2Title': ['Bond 2 : relais vers RX', 'Hop 2: relay to RX'],
  'app.hopSubtitle': ['{{km}} km - diffraction {{db}} dB', '{{km}} km - diffraction {{db}} dB'],
  'app.heightComparerTitle': ['Comparateur de hauteurs', 'Height comparison'],
  'app.heightComparerHint': [
    'Marge obtenue selon la hauteur d antenne du relais, de 2 a 20 m.',
    'Margin achieved by relay antenna height, from 2 to 20 m.',
  ],
  'app.rangeTitle': ['Portee du relais', 'Relay range'],
  'app.scanStats': [
    '{{candidates}} mailles candidates, {{evaluated}} evaluees en {{ms}} ms.',
    '{{candidates}} candidate cells, {{evaluated}} evaluated in {{ms}} ms.',
  ],
  'app.scanStats.slope': [' {{n}} ecartees pour pente > 30 deg.', ' {{n}} excluded for slope > 30 deg.'],
  'app.scanStats.water': [' {{n}} ecartees comme surfaces en eau.', ' {{n}} excluded as water surfaces.'],
  'app.scanStats.noData': [' {{n}} sans donnee d altitude.', ' {{n}} with no elevation data.'],
  'app.scanStats.source': [' Source : {{label}}.', ' Source: {{label}}.'],

  // --- SitePanel -------------------------------------------------------------
  'site.searchAddress': ['Rechercher une adresse', 'Search an address'],
  'site.searchPlaceholder': ['Commune, lieu-dit, adresse...', 'Town, place name, address...'],
  'site.searchUnavailable': ['Recherche indisponible', 'Search unavailable'],
  'site.searchNoResult': ['Aucun resultat', 'No result'],
  'site.name': ['Nom du site', 'Site name'],
  'site.namePlaceholder': ['Nom', 'Name'],
  'site.latitude': ['Latitude', 'Latitude'],
  'site.longitude': ['Longitude', 'Longitude'],
  'site.groundElevation': ['Altitude sol :', 'Ground elevation:'],
  'site.pickOnMapTitle': ['Definir la position par un clic sur la carte', 'Set position with a click on the map'],
  'site.picking': ['Cliquez...', 'Click...'],
  'site.pickMap': ['Carte', 'Map'],
  'site.antennaHeight': ['Hauteur antenne', 'Antenna height'],
  'site.antennaGain': ['Gain antenne', 'Antenna gain'],

  // --- RadioPanel --------------------------------------------------------
  'radio.device': ['Materiel', 'Hardware'],
  'radio.estimatedNote': ['* valeur estimee. ', '* estimated value. '],
  'radio.outOfBand': ['Frequence hors bande', 'Frequency out of band'],
  'radio.outOfBandMsg': [
    '{{freq}} MHz sort de la plage supportee par ce materiel ({{min}} a {{max}} MHz).',
    '{{freq}} MHz is outside the range supported by this hardware ({{min}} to {{max}} MHz).',
  ],
  'radio.region': ['Region', 'Region'],
  'radio.freq': ['Frequence', 'Frequency'],
  'radio.preset': ['Preset LoRa', 'LoRa preset'],
  'radio.presetHint': [
    'Sensibilite recepteur {{sens}} dBm - SF{{sf}}, BW {{bw}} kHz',
    'Receiver sensitivity {{sens}} dBm - SF{{sf}}, BW {{bw}} kHz',
  ],
  'radio.txPower': ['Puissance TX', 'TX power'],
  'radio.cableLoss': ['Perte cable / site', 'Cable loss / site'],
  'radio.eirp': ['PIRE (EIRP)', 'EIRP'],
  'radio.erp': ['ERP (reference dipole)', 'ERP (dipole reference)'],
  'radio.limit': ['Limite {{region}}', '{{region}} limit'],
  'radio.overLimit': [
    'Depassement de {{db}} dB. Reduisez la puissance ou le gain d antenne.',
    'Exceeds limit by {{db}} dB. Reduce power or antenna gain.',
  ],
  'radio.gainBasis': [
    'Calcul base sur le gain le plus eleve declare ({{gain}} dBi). ',
    'Calculated from the highest declared gain ({{gain}} dBi). ',
  ],
  'radio.desiredMargin': ['Marge de liaison souhaitee', 'Desired link margin'],
  'radio.desiredMarginHint': [
    'Seuil au-dela duquel une liaison est jugee exploitable.',
    'Threshold above which a link is judged usable.',
  ],
  'radio.relayHardware': ['Materiel du relais', 'Relay hardware'],
  'radio.relayGain': ['Gain antenne', 'Antenna gain'],
  'radio.relayPower': ['Puissance TX', 'TX power'],
  'radio.relayNote': [
    'Le relais reemet le message : le bond 2 utilise sa propre puissance et son propre gain.',
    'The relay retransmits the message: hop 2 uses its own power and its own gain.',
  ],
  'radio.unusualFreq': [
    'Frequence inhabituelle pour LoRa. Verifiez qu elle correspond bien a votre materiel.',
    'Unusual frequency for LoRa. Check that it matches your hardware.',
  ],

  // --- SearchPanel ---------------------------------------------------------
  'search.heightsLabel': ['Hauteurs d antenne du relais a tester', 'Relay antenna heights to test'],
  'search.otherHeight': ['Autre hauteur', 'Other height'],
  'search.add': ['Ajouter', 'Add'],
  'search.selectAtLeastOne': ['Selectionnez au moins une hauteur.', 'Select at least one height.'],
  'search.manyHeights': [
    '{{n}} hauteurs : le balayage sera d autant plus long.',
    '{{n}} heights: the scan will take that much longer.',
  ],
  'search.radius': ['Rayon autour de l axe', 'Radius around the axis'],
  'search.step': ['Pas de la grille', 'Grid step'],
  'search.maxRelays': ['Relais au maximum dans la chaine', 'Maximum relays in the chain'],
  'search.maxRelaysHint': [
    'Si un seul relais ne suffit pas, l application en insere d autres dans le bond le plus faible, ' +
      'jusqu a ce que l objectif de marge soit tenu ou que ce plafond soit atteint.',
    'If one relay is not enough, the app inserts more into the weakest hop, until the margin target is ' +
      'met or this ceiling is reached.',
  ],
  'search.dem': ['Modele numerique de terrain', 'Digital elevation model'],
  'search.selfHostTitle': ['Instance auto-hebergee requise', 'Self-hosted instance required'],
  'search.selfHostMsg': [
    'L API publique d OpenTopoData ne renvoie aucun en-tete CORS : le navigateur bloque l appel. ' +
      'Indiquez l adresse de votre propre instance, sinon l application basculera automatiquement sur ' +
      'un fournisseur mondial.',
    'The public OpenTopoData API sends no CORS header: the browser blocks the call. Enter the address ' +
      'of your own instance, otherwise the app will automatically fall back to a global provider.',
  ],
  'search.otdAddress': ['Adresse de l instance OpenTopoData', 'OpenTopoData instance address'],
  'search.tooFine': [
    'Un pas de {{step}} m est plus fin que la resolution du MNT ({{res}} m) : les points supplementaires ' +
      'n apportent pas d information, ils ne font qu allonger le telechargement.',
    'A {{step}} m step is finer than the DEM resolution ({{res}} m): the extra points add no information, ' +
      'they only lengthen the download.',
  ],
  'search.modelGround': ['Modeliser la couverture du sol', 'Model ground cover'],
  'search.modelGroundHint': [
    'Vegetation et bati depuis OpenStreetMap. Sans cette option le calcul porte sur le sol nu, ce qui ' +
      'surestime nettement la portee : un rideau de feuillus coute 10 a 20 dB a 868 MHz.',
    'Vegetation and buildings from OpenStreetMap. Without this option the calculation runs on bare ' +
      'ground, which clearly overestimates range: a stand of broadleaf trees costs 10 to 20 dB at 868 MHz.',
  ],
  'search.includeBuildings': ['Inclure les batiments', 'Include buildings'],
  'search.includeBuildingsHint': [
    'Traites comme obstacles opaques. Volumineux a telecharger, et seuls 8 % portent une hauteur dans ' +
      'OSM : les autres sont estimes a 8 m ou d apres le nombre d etages.',
    'Treated as opaque obstacles. Heavy to download, and only 8% carry a height in OSM: the rest are ' +
      'estimated at 8 m or from the number of floors.',
  ],
  'search.defaultHeights': [
    'Hauteurs par defaut : foret 20 m, verger 5 m, broussaille 3 m, vigne 2 m. OSM ne renseigne pas la ' +
      'hauteur de la vegetation ; ces valeurs sont des hypotheses.',
    'Default heights: forest 20 m, orchard 5 m, scrub 3 m, vineyard 2 m. OSM does not record vegetation ' +
      'height; these values are assumptions.',
  ],
  'search.excludeInaccessible': ['Exclure les zones inaccessibles', 'Exclude inaccessible areas'],
  'search.excludeInaccessibleHint': [
    'Ecarte les mailles dont la pente depasse 30 deg, ainsi que les surfaces detectees comme etant en ' +
      'eau (plateau parfaitement plat dans le MNT, ou altitude nulle). Detection heuristique : une ' +
      'plaine tres plane peut etre ecartee a tort.',
    'Excludes cells with a slope over 30 deg, as well as surfaces detected as water (a perfectly flat ' +
      'plateau in the DEM, or zero elevation). Heuristic detection: a very flat plain may be wrongly excluded.',
  ],
  'search.linkDistance': ['Distance TX - RX', 'TX - RX distance'],
  'search.linkBearing': ['Cap TX vers RX', 'Bearing TX to RX'],
  'search.pointsToCover': ['Points MNT a couvrir', 'DEM points to cover'],
  'search.alreadyCached': ['Deja en cache', 'Already cached'],
  'search.networkRequests': ['Requetes reseau', 'Network requests'],
  'search.wideAreaTitle': ['Zone tres large', 'Very large area'],
  'search.tooBigTitle': ['Zone trop vaste pour ce pas', 'Area too large for this step'],
  'search.tooBigMsg': [
    'La grille depasserait la limite de memoire du navigateur. Corrigez d un clic :',
    'The grid would exceed the browser memory limit. Fix it in one click:',
  ],
  'search.tooBigFixStep': ['Passer le pas a {{step}} m', 'Set step to {{step}} m'],
  'search.tooBigFixRadius': ['Reduire le rayon a {{radius}} m', 'Reduce radius to {{radius}} m'],
  'search.wideAreaMsg': [
    'Le telechargement va prendre plusieurs minutes et solliciter lourdement un service gratuit. ' +
      'Reduisez le rayon ou augmentez le pas d echantillonnage.',
    'The download will take several minutes and put a heavy load on a free service. Reduce the radius ' +
      'or increase the sampling step.',
  ],

  // --- ResultsTable ----------------------------------------------------------
  'results.col.n': ['#', '#'],
  'results.col.verdict': ['Verdict', 'Verdict'],
  'results.col.coords': ['Coordonnees', 'Coordinates'],
  'results.col.alt': ['Alt.', 'Elev.'],
  'results.col.mast': ['Mat', 'Mast'],
  'results.col.hop1': ['Bond 1', 'Hop 1'],
  'results.col.hop2': ['Bond 2', 'Hop 2'],
  'results.col.overall': ['Globale', 'Overall'],
  'results.col.fresnel': ['Fresnel', 'Fresnel'],
  'results.col.road': ['Route', 'Road'],
  'results.rowTitle': [
    'Score de classement : {{score}} dB{{penalty}}',
    'Ranking score: {{score}} dB{{penalty}}',
  ],
  'results.rowTitle.penalty': [
    ' (marge {{margin}} dB moins {{penalty}} dB de penalite de degagement)',
    ' (margin {{margin}} dB minus {{penalty}} dB clearance penalty)',
  ],
  'results.rowTitle.noPenalty': [' (aucune penalite de degagement)', ' (no clearance penalty)'],
  'results.centerMap': ['Centrer la carte', 'Center the map'],
  'results.footer': [
    'Marge globale = min(bond 1, bond 2). Fresnel = degagement minimal des deux bonds. Le classement ' +
      'se fait sur la marge penalisee : en dessous de 60 % de degagement, jusqu a 6 dB sont retranches ' +
      'au bond concerne. Survolez une ligne pour voir le detail du score.',
    'Overall margin = min(hop 1, hop 2). Fresnel = minimum clearance of both hops. Ranking runs on the ' +
      'penalized margin: below 60% clearance, up to 6 dB is deducted from the hop concerned. Hover a ' +
      'row to see the score breakdown.',
  ],
  'results.seeLess': ['Voir moins', 'See less'],
  'results.seeMore': ['Voir {{n}} sites', 'See {{n}} sites'],

  // --- ChainPanel --------------------------------------------------------
  'chain.stop.direct': ['La liaison directe suffit : aucun relais necessaire.', 'The direct link is enough: no relay needed.'],
  'chain.stop.atteint': ['Objectif atteint.', 'Target reached.'],
  'chain.stop.plafond': [
    'Le nombre maximal de relais est atteint sans que l objectif le soit. Relevez le plafond, ou ' +
      'revoyez les hauteurs d antenne et la puissance.',
    'The maximum number of relays was reached without meeting the target. Raise the ceiling, or ' +
      'revisit antenna heights and power.',
  ],
  'chain.stop.sansGain': [
    'Ajouter un relais de plus n ameliorerait pas le maillon faible : le terrain ne s y prete pas dans ' +
      'le corridor explore. Elargissez le rayon de recherche.',
    'Adding another relay would not improve the weak link: the terrain does not allow it within the ' +
      'explored corridor. Widen the search radius.',
  ],
  'chain.stop.aucunCandidat': [
    'Aucune maille candidate exploitable dans ce bond. Elargissez le rayon, ou desactivez le filtre d accessibilite.',
    'No usable candidate cell in this hop. Widen the radius, or disable the accessibility filter.',
  ],
  'chain.stop.profilIndisponible': ['Profil d altitude indisponible sur ce bond.', 'Elevation profile unavailable on this hop.'],
  'chain.noneNeeded': ['Aucun relais necessaire', 'No relay needed'],
  'chain.oneSuffices': ['1 relais {{verb}}', '1 relay {{verb}}'],
  'chain.nSuffice': ['{{n}} relais {{verb}}', '{{n}} relays {{verb}}'],
  'chain.verb.sufficesYes': ['suffit', 'is enough'],
  'chain.verb.sufficesNo': ['ne suffit pas', 'is not enough'],
  'chain.verb.sufficeYes': ['suffisent', 'are enough'],
  'chain.verb.sufficeNo': ['ne suffisent pas', 'are not enough'],
  'chain.reasonSuffix': [
    ' Marge du maillon le plus faible, tenue sur 95 % des emplacements, contre un objectif de {{target}} dB.',
    ' Margin of the weakest link, held on 95% of locations, against a target of {{target}} dB.',
  ],
  'chain.capTx': ['Cap antenne TX', 'TX antenna bearing'],
  'chain.capRx': ['Cap antenne RX', 'RX antenna bearing'],
  'chain.col.hop': ['Bond', 'Hop'],
  'chain.col.cap': ['Cap', 'Bearing'],
  'chain.col.distance': ['Distance', 'Distance'],
  'chain.col.vegetation': ['Vegetation', 'Vegetation'],
  'chain.col.fresnel': ['Fresnel', 'Fresnel'],
  'chain.col.margin95': ['Marge 95 %', 'Margin 95%'],
  'chain.hopCapTitle': ['Cap depuis le premier noeud du bond', 'Bearing from the hop\'s first node'],
  'chain.relay': ['R{{n}}', 'R{{n}}'],
  'chain.node.ground': ['sol {{elev}} m · mat {{mast}} m', 'ground {{elev}} m · mast {{mast}} m'],
  'chain.node.caps': ['cap ← {{back}} · cap → {{fwd}}', 'bearing ← {{back}} · bearing → {{fwd}}'],
  'chain.addOrder': ['Ordre d ajout : ', 'Insertion order: '],
  'chain.addOrderItem': [
    '{{i}}{{ord}} relais, maillon faible de {{before}} a {{after}} dB',
    '{{i}}{{ord}} relay, weak link from {{before}} to {{after}} dB',
  ],
  'chain.addOrderSuffix': [
    '. Les etiquettes R1, R2... suivent l ordre geographique le long du trajet, pas cet ordre d ajout.',
    '. The R1, R2... labels follow the geographic order along the path, not this insertion order.',
  ],
  'chain.footer': [
    'Chaque relais est insere dans le bond le plus faible, puis le calcul recommence. Un relais qui n ' +
      'ameliorerait pas ce maillon est refuse : la chaine s arrete alors plutot que de s allonger sans ' +
      'effet. Les relais sont cherches dans le corridor deja telecharge, donc sans requete ' +
      'supplementaire. Les caps sont des azimuts geographiques (nord vrai), calcules sur le grand ' +
      'cercle : corrigez de la declinaison magnetique locale pour une boussole classique.',
    'Each relay is inserted into the weakest hop, then the calculation restarts. A relay that would not ' +
      'improve that link is rejected: the chain stops there instead of growing to no effect. Relays are ' +
      'searched within the already-downloaded corridor, so at no extra network cost. Bearings are ' +
      'geographic azimuths (true north), computed on the great circle: correct for local magnetic ' +
      'declination on a standard compass.',
  ],

  // --- LinkSummary -----------------------------------------------------------
  'link.capTx': ['Cap antenne TX', 'TX antenna bearing'],
  'link.capRx': ['Cap antenne RX', 'RX antenna bearing'],
  'link.capNote': [
    'Cap geographique (nord vrai), calcule sur le grand cercle. Une boussole magnetique lit le nord ' +
      'magnetique : corrigez de la declinaison locale, ou visez avec le mode « nord vrai » d un GPS ou ' +
      'd une boussole de telephone.',
    'Geographic bearing (true north), computed on the great circle. A magnetic compass reads magnetic ' +
      'north: correct for local declination, or aim using the "true north" mode of a GPS or phone compass.',
  ],
  'link.relayAntenna': ['Antenne relais :', 'Relay antenna:'],
  'link.minClearance': ['Degagement minimal :', 'Minimum clearance:'],
  'link.target': ['Objectif :', 'Target:'],
  'link.hop1': ['Bond 1 (TX-REL)', 'Hop 1 (TX-REL)'],
  'link.hop2': ['Bond 2 (REL-RX)', 'Hop 2 (REL-RX)'],
  'link.row.distance': ['Distance', 'Distance'],
  'link.row.fspl': ['Perte espace libre', 'Free space loss'],
  'link.row.diffraction': ['Diffraction J(v)', 'Diffraction J(v)'],
  'link.row.vegetation': ['Vegetation traversee', 'Vegetation crossed'],
  'link.row.vParam': ['Parametre v', 'v parameter'],
  'link.row.rssi': ['RSSI estime', 'Estimated RSSI'],
  'link.row.fresnelClear': ['Fresnel degagee', 'Fresnel clearance'],
  'link.row.margin95': ['Marge a 95 %', 'Margin at 95%'],
  'link.row.medianMargin': ['Marge mediane', 'Median margin'],
  'link.sensitivity': [
    'Sensibilite du preset {{preset}} : {{sens}} dBm. Les altitudes d antenne sont comptees au-dessus ' +
      'du sol. La marge a 95 % retranche la dispersion d un emplacement a l autre ; c est elle qui ' +
      'fonde le verdict.',
    'Sensitivity of the {{preset}} preset: {{sens}} dBm. Antenna heights are counted above ground. The ' +
      '95% margin removes location-to-location dispersion; it is what the verdict is based on.',
  ],
  'link.noRelay': ['Sans relais', 'Without relay'],
  'link.noRelayIntro': [' — liaison directe TX-RX : ', ' — direct TX-RX link: '],
  'link.noRelayStats': [
    '. Marge {{margin}} dB, diffraction {{diff}} dB, Fresnel {{fresnel}} %. Le relais apporte {{gain}} dB.',
    '. Margin {{margin}} dB, diffraction {{diff}} dB, Fresnel {{fresnel}}%. The relay adds {{gain}} dB.',
  ],

  // --- Verdict -----------------------------------------------------------
  'verdict.median': ['Median', 'Median'],
  'verdict.held95': ['Tenu sur 95 % des emplacements', 'Held on 95% of locations'],
  'verdict.dispersion': ['dispersion', 'dispersion'],

  // --- Disclaimer --------------------------------------------------------
  'disclaimer.title': ['Ce que le modele ignore encore.', 'What the model still ignores.'],
  'disclaimer.collapsedHint': [
    'Toute simulation doit etre validee sur le terrain.',
    'Every simulation must be validated on the ground.',
  ],
  'disclaimer.p1': [
    'Sont desormais pris en compte : le relief, la courbure terrestre, la diffraction sur plusieurs ' +
      'aretes, la {{veg}} et le {{bat}} issus d OpenStreetMap, et la dispersion d un emplacement a l ' +
      'autre (marge a 95 %).',
    'Now accounted for: terrain, Earth curvature, multi-edge diffraction, {{veg}} and {{bat}} from ' +
      'OpenStreetMap, and location-to-location dispersion (95% margin).',
  ],
  'disclaimer.vegetation': ['vegetation', 'vegetation'],
  'disclaimer.buildings': ['bati', 'buildings'],
  'disclaimer.remain': ['Restent hors du modele, ou incertains :', 'Still outside the model, or uncertain:'],
  'disclaimer.li1': [
    'les {{h}}, largement supposees : OSM ne renseigne quasiment jamais la hauteur de la vegetation, et ' +
      'seuls 8 % des batiments portent une hauteur. Une « foret » a 20 m peut etre un taillis de 5 m ;',
    'the {{h}}, largely assumed: OSM almost never records vegetation height, and only 8% of buildings ' +
      'carry a height. A "forest" at 20 m may be a 5 m coppice;',
  ],
  'disclaimer.coverHeights': ['hauteurs de couvert', 'cover heights'],
  'disclaimer.li2': [
    'la {{c}} : un bois non cartographie n existe pas pour le calcul ;',
    'the {{c}}: an unmapped wood does not exist for the calculation;',
  ],
  'disclaimer.osmCompleteness': ['completude d OpenStreetMap', 'completeness of OpenStreetMap'],
  'disclaimer.li3': [
    'le {{n}} et les interferences, qui degradent le seuil de reception reel au-dela de la sensibilite theorique du preset ;',
    'local {{n}} and interference, which degrade the real reception threshold beyond the preset\'s theoretical sensitivity;',
  ],
  'disclaimer.rfNoise': ['bruit RF local', 'RF noise'],
  'disclaimer.li4': [
    'les {{r}} et la diffraction sur terrain lisse au-dela de l horizon, approximee par le bombement et une arete ;',
    'ground {{r}} and diffraction over smooth terrain beyond the horizon, approximated by earth bulge and a single edge;',
  ],
  'disclaimer.groundReflections': ['reflexions sur le sol', 'reflections'],
  'disclaimer.li5': [
    'la {{v}} : pluie, feuillaison, conduits tropospheriques.',
    'temporal {{v}}: rain, foliage cycle, tropospheric ducting.',
  ],
  'disclaimer.timeVariability': ['variabilite temporelle', 'variability'],
  'disclaimer.footer': [
    'Toute simulation doit etre confirmee par un {{test}}.',
    'Every simulation must be confirmed by a {{test}}.',
  ],
  'disclaimer.groundTest': ['test terrain avec deux noeuds reels', 'field test with two real nodes'],

  // --- CoveragePanel -------------------------------------------------------
  'coverage.intro': [
    'Portee du relais dans toutes les directions, calculee sur le relief reel : un rayon est tire tous ' +
      'les {{deg}} degres et s arrete la ou le bilan de liaison decroche.',
    'Relay range in every direction, computed on real terrain: a ray is cast every {{deg}} degrees and ' +
      'stops where the link budget fails.',
  ],
  'coverage.nodeHeight': ['Hauteur antenne du noeud', 'Node antenna height'],
  'coverage.nodeGain': ['Gain antenne du noeud', 'Node antenna gain'],
  'coverage.radius': ['Rayon d exploration', 'Search radius'],
  'coverage.directions': ['Directions', 'Directions'],
  'coverage.dir36': ['36 (tous les 10 deg)', '36 (every 10 deg)'],
  'coverage.dir72': ['72 (tous les 5 deg)', '72 (every 5 deg)'],
  'coverage.dir144': ['144 (tous les 2,5 deg)', '144 (every 2.5 deg)'],
  'coverage.freeSpaceRange': ['Portee en espace libre', 'Free-space range'],
  'coverage.radioHorizon': ['Horizon radio (antennes seules)', 'Radio horizon (antennas alone)'],
  'coverage.pointsToDl': ['Points a telecharger', 'Points to download'],
  'coverage.networkRequests': ['Requetes reseau', 'Network requests'],
  'coverage.freeSpaceNote': [
    'La portee en espace libre ignore totalement le relief et la courbure : sur LoRa elle se compte en ' +
      'centaines de kilometres. Elle n est la que pour rappeler que la portee n est jamais limitee par ' +
      'la puissance, mais par la geometrie.',
    'Free-space range totally ignores terrain and curvature: on LoRa it runs into the hundreds of ' +
      'kilometers. It is only there to remind that range is never limited by power, but by geometry.',
  ],
  'coverage.runDisabled': ['Selectionnez d abord un emplacement de relais', 'Select a relay location first'],
  'coverage.calcRequests': ['{{done}}/{{total}} requetes', '{{done}}/{{total}} requests'],
  'coverage.calculating': ['Calcul...', 'Calculating...'],
  'coverage.recalculate': ['Recalculer la couverture', 'Recalculate coverage'],
  'coverage.calculate': ['Calculer la couverture', 'Calculate coverage'],
  'coverage.col.zone': ['Zone', 'Zone'],
  'coverage.col.mean': ['Moyen', 'Mean'],
  'coverage.col.min': ['Min', 'Min'],
  'coverage.col.max': ['Max', 'Max'],
  'coverage.col.area': ['Surface', 'Area'],
  'coverage.reliableZone': ['Fiable ({{db}} dB)', 'Reliable ({{db}} dB)'],
  'coverage.receptionLimit': ['Limite de reception', 'Reception limit'],
  'coverage.fillRatioPre': ['Le relief ampute la zone fiable a ', 'Terrain cuts the reliable zone down to '],
  'coverage.fillRatioPost': [' du disque de meme portee maximale.', ' of the disc at the same maximum range.'],
  'coverage.blockedDirections': [
    ' {{n}} direction(s) sur {{total}} sont bouchees des les premieres centaines de metres.',
    ' {{n}} direction(s) out of {{total}} are blocked within the first few hundred meters.',
  ],
  'coverage.saturatedTitle': ['Portee bridee par le rayon d exploration', 'Range capped by the search radius'],
  'coverage.saturatedMsg': [
    'La zone atteint la limite des {{km}} km explores dans plusieurs directions : la portee reelle va au-dela.',
    'The zone reaches the limit of the {{km}} km explored in several directions: the real range extends beyond.',
  ],
  'coverage.extendButton': ['Etendre a {{km}} km et recalculer', 'Extend to {{km}} km and recalculate'],
  'coverage.footer': [
    'Chaque rayon s arrete a la premiere rupture durable du bilan. La zone tracee est donc continue ' +
      'depuis le relais : des poches de reception peuvent exister au-dela, derriere une zone d ombre, sans y figurer.',
    'Each ray stops at the first sustained link failure. The drawn zone is therefore continuous from the ' +
      'relay: reception pockets may exist beyond it, behind a shadow zone, without appearing here.',
  ],

  // --- MapView -------------------------------------------------------------
  'map.baseLayer.relief': ['Relief (OpenTopoMap)', 'Terrain (OpenTopoMap)'],
  'map.baseLayer.ignPlan': ['Plan IGN', 'IGN map'],
  'map.baseLayer.ignAerial': ['Photo aerienne IGN', 'IGN aerial photo'],
  'map.baseLayer.osm': ['OpenStreetMap', 'OpenStreetMap'],
  'map.quality': ['Qualite', 'Quality'],
  'map.legend.high': ['marge > 15 dB', 'margin > 15 dB'],
  'map.legend.mid': ['5 a 15 dB', '5 to 15 dB'],
  'map.legend.low': ['< 5 dB', '< 5 dB'],
  'map.legend.reliable': ['portee fiable', 'reliable range'],
  'map.legend.limited': ['reception limite', 'limited reception'],
  'map.placeBothTitle': ['Definir l emetteur puis le recepteur par deux clics sur la carte', 'Set the transmitter then the receiver with two clicks on the map'],
  'map.cancel': ['Annuler', 'Cancel'],
  'map.placeBoth': ['Placer TX + RX', 'Place TX + RX'],
  'map.recenterTitle': ['Recadrer sur toute la liaison, relais compris', 'Fit the whole link, relays included'],
  'map.recenter': ['Recadrer', 'Fit view'],
  'map.toggleCoverageTitle': ['Afficher ou masquer l enveloppe de portee', 'Show or hide the range envelope'],
  'map.runCoverageTitle': ['Calculer la portee du relais sur le relief reel', 'Compute relay range on real terrain'],
  'map.coverageProgress': ['Portee {{done}}/{{total}}', 'Range {{done}}/{{total}}'],
  'map.calculating': ['Calcul...', 'Calculating...'],
  'map.coverageShown': ['Portee affichee', 'Range shown'],
  'map.coverageHidden': ['Portee masquee', 'Range hidden'],
  'map.calculateCoverage': ['Calculer la portee', 'Calculate range'],
  'map.staleParams': ['Les parametres ont change : relancez le calcul.', 'Settings changed: rerun the calculation.'],
  'map.needsDownload': [
    'Necessite un telechargement de relief autour du relais.',
    'Requires downloading terrain around the relay.',
  ],
  'map.pick.tx1of2': ['Cliquez pour placer l emetteur (1 sur 2)', 'Click to place the transmitter (1 of 2)'],
  'map.pick.rx2of2': ['Cliquez pour placer le recepteur (2 sur 2)', 'Click to place the receiver (2 of 2)'],
  'map.pick.escape': ['Echap pour annuler', 'Escape to cancel'],
  'map.pick.manual': ['Cliquez pour evaluer un emplacement precis', 'Click to evaluate a precise location'],
  'map.pick.tx': ['Cliquez pour placer l emetteur', 'Click to place the transmitter'],
  'map.pick.rx': ['Cliquez pour placer le recepteur', 'Click to place the receiver'],
  'map.tooltip.txName': ['{{name}} (TX)', '{{name}} (TX)'],
  'map.tooltip.rxName': ['{{name}} (RX)', '{{name}} (RX)'],
  'map.tooltip.capChain': ['cap chaine ', 'chain bearing '],
  'map.tooltip.capCandidate': ['cap candidat ', 'candidate bearing '],
  'map.tooltip.cap': ['cap ', 'bearing '],
  'map.tooltip.candidateInspected': ['Candidat inspecte (hors chaine)', 'Inspected candidate (outside chain)'],
  'map.tooltip.relay': ['Relais', 'Relay'],
  'map.tooltip.antenna': [' - antenne {{h}} m', ' - antenna {{h}} m'],
  'map.tooltip.margin': ['marge {{m}} dB', 'margin {{m}} dB'],
  'map.tooltip.capToTx': ['cap vers TX {{c}}', 'bearing to TX {{c}}'],
  'map.tooltip.capToRx': ['cap vers RX {{c}}', 'bearing to RX {{c}}'],
  'map.tooltip.forcedPoint': ['Point force', 'Forced point'],
  'map.tooltip.hopN': ['Bond {{n}} : {{km}} km', 'Hop {{n}}: {{km}} km'],
  'map.tooltip.margin95': ['marge 95 % {{m}} dB', 'margin 95% {{m}} dB'],
  'map.tooltip.relayN': ['Relais R{{n}} - antenne {{h}} m', 'Relay R{{n}} - antenna {{h}} m'],
  'map.tooltip.ground': ['sol {{e}} m', 'ground {{e}} m'],
  'map.tooltip.candidateHeader': ['#{{n}} - marge {{m}} dB', '#{{n}} - margin {{m}} dB'],
  'map.tooltip.candidateAntenna': ['antenne {{h}} m - alt. {{e}} m', 'antenna {{h}} m - elev. {{e}} m'],
  'map.tooltip.candidateHops': ['bond 1 {{m1}} dB / bond 2 {{m2}} dB', 'hop 1 {{m1}} dB / hop 2 {{m2}} dB'],

  // --- ProfileChart / HeightChart (Chart.js) --------------------------------
  'chart.fresnelZone1': ['1re zone de Fresnel', '1st Fresnel zone'],
  'chart.los': ['Ligne de visee', 'Line of sight'],
  'chart.fresnelLow': ['Fresnel bas', 'Lower Fresnel'],
  'chart.fresnelThreshold60': ['Seuil 60 % de Fresnel', '60% Fresnel threshold'],
  'chart.canopy': ['Couvert vegetal', 'Vegetation cover'],
  'chart.terrain': ['Relief (corrige 4/3)', 'Terrain (4/3 corrected)'],
  'chart.distanceAxis': ['Distance (km)', 'Distance (km)'],
  'chart.elevationAxis': ['Altitude (m)', 'Elevation (m)'],
  'chart.dominantObstacle': ['obstacle dominant', 'dominant obstacle'],
  'chart.overallMargin': ['Marge globale (maillon faible)', 'Overall margin (weakest link)'],
  'chart.hop1': ['Bond 1 : TX vers relais', 'Hop 1: TX to relay'],
  'chart.hop2': ['Bond 2 : relais vers RX', 'Hop 2: relay to RX'],
  'chart.antennaHeightAxis': ['Hauteur d antenne du relais (m)', 'Relay antenna height (m)'],
  'chart.marginAxis': ['Marge (dB)', 'Margin (dB)'],
  'chart.antennaAt': ['Antenne a {{h}} m', 'Antenna at {{h}} m'],
  'chart.desiredMarginLabel': ['marge souhaitee {{db}} dB', 'desired margin {{db}} dB'],
  'height.reachedAt': [
    'La marge souhaitee de {{margin}} est atteinte des {{height}} de hauteur d antenne.',
    'The desired margin of {{margin}} is reached from {{height}} of antenna height.',
  ],
  'height.neverReached': [
    'La marge souhaitee de {{margin}} n est jamais atteinte sur cette plage : le meilleur resultat est {{best}} a {{bestHeight}}.',
    'The desired margin of {{margin}} is never reached over this range: the best result is {{best}} at {{bestHeight}}.',
  ],
  'height.gain': [
    ' Passer de {{from}} a {{to}} rapporte {{gain}}.',
    ' Going from {{from}} to {{to}} gains {{gain}}.',
  ],

  // --- ui.jsx generic --------------------------------------------------------
  'ui.close': ['Fermer', 'Close'],

  // --- radio.js : verdicts, regions, devices --------------------------------
  'verdict.impossible.label': ['Liaison impossible', 'Link impossible'],
  'verdict.impossible.short': ['Impossible', 'Impossible'],
  'verdict.obstrue.label': ['Sans visibilite directe', 'No direct visibility'],
  'verdict.obstrue.short': ['Obstrue', 'Blocked'],
  'verdict.limite.label': ['Liaison a la limite', 'Link at the limit'],
  'verdict.limite.short': ['Limite', 'Marginal'],
  'verdict.fragile.label': ['Liaison possible mais fragile', 'Link possible but fragile'],
  'verdict.fragile.short': ['Fragile', 'Fragile'],
  'verdict.possible.label': ['Liaison possible', 'Link possible'],
  'verdict.possible.short': ['Possible', 'Possible'],
  'verdict.reason.foliageSuffix': [
    ' Dont {{db}} dB attribues a la vegetation traversee.',
    ' Of which {{db}} dB attributed to vegetation crossed.',
  ],
  'verdict.reason.impossible.noData': ['Bilan de liaison indisponible.', 'Link budget unavailable.'],
  'verdict.reason.impossible': [
    'Le signal arrive {{gap}} dB sous le seuil de sensibilite du recepteur, et ce des la valeur ' +
      'mediane. Aucun reglage de puissance realiste ne comblera cet ecart : il faut surelever les ' +
      'antennes, deplacer un site ou ajouter un relais.',
    'The signal arrives {{gap}} dB below the receiver sensitivity threshold, even at the median value. ' +
      'No realistic power setting will close that gap: antennas need to be raised, a site moved, or a ' +
      'relay added.',
  ],
  'verdict.reason.obstrue': [
    'Le relief coupe la ligne de visee et la depasse de {{ratio}} fois le rayon de Fresnel. Le signal ' +
      'ne passe plus que par diffraction, mecanisme dont l estimation reste incertaine sur un relief ' +
      'massif : la marge de {{margin}} dB affichee est a prendre avec precaution.',
    'Terrain cuts the line of sight and exceeds it by {{ratio}} times the Fresnel radius. The signal ' +
      'now only gets through by diffraction, a mechanism whose estimate stays uncertain over massive ' +
      'terrain: the displayed margin of {{margin}} dB should be taken with caution.',
  ],
  'verdict.reason.limite': [
    'La liaison passe au niveau median ({{margin}} dB) mais pas de facon fiable : sur 95 % des ' +
      'emplacements il ne resterait que {{m95}} dB. Autrement dit, elle tiendra certains jours et pas d autres.',
    'The link gets through at the median level ({{margin}} dB) but not reliably: on 95% of locations ' +
      'only {{m95}} dB would remain. In other words, it will hold on some days and not others.',
  ],
  'verdict.reason.fragile.belowTarget': [
    'Marge fiable de {{m95}} dB, en dessous de l objectif de {{target}} dB.',
    'Reliable margin of {{m95}} dB, below the {{target}} dB target.',
  ],
  'verdict.reason.fragile.grazing': [
    'Marge fiable de {{m95}} dB, mais le relief affleure la ligne de visee.',
    'Reliable margin of {{m95}} dB, but terrain grazes the line of sight.',
  ],
  'verdict.reason.fragile.clearance': [
    'Marge fiable de {{m95}} dB, mais seulement {{pct}} % de la premiere zone de Fresnel est degagee la ou il en faudrait 60 %.',
    'Reliable margin of {{m95}} dB, but only {{pct}}% of the first Fresnel zone is clear where 60% would be needed.',
  ],
  'verdict.reason.fragile.suffix': [
    ' Le resultat ne laisse pas de reserve pour ce que le modele ignore.',
    ' The result leaves no margin for what the model ignores.',
  ],
  'verdict.reason.possible': [
    'Marge de {{margin}} dB en median, {{m95}} dB tenus sur 95 % des emplacements, et {{pct}} % de la zone de Fresnel degagee.',
    'Margin of {{margin}} dB at the median, {{m95}} dB held on 95% of locations, and {{pct}}% of the Fresnel zone clear.',
  ],

  'radio.region.EU_868.label': ['EU 868 (Europe)', 'EU 868 (Europe)'],
  'radio.region.EU_868.note': [
    'Sous-bande g4 869,4-869,65 MHz : 20 dBm ERP retenu (EN 300 220 autorise 27 dBm ERP a 10 % de ' +
      'rapport cyclique). Ailleurs en 868 : 14 dBm ERP.',
    'g4 sub-band 869.4-869.65 MHz: 20 dBm ERP used (EN 300 220 allows 27 dBm ERP at 10% duty cycle). ' +
      'Elsewhere in 868: 14 dBm ERP.',
  ],
  'radio.region.US.label': ['US 915', 'US 915'],
  'radio.region.US.note': [
    'FCC part 15.247 : 30 dBm conduits, reduction requise au-dela de 6 dBi de gain.',
    'FCC part 15.247: 30 dBm conducted, reduction required beyond 6 dBi of gain.',
  ],
  'radio.region.ANZ.label': ['ANZ 923', 'ANZ 923'],
  'radio.region.ANZ.note': ['Australie / Nouvelle-Zelande, classe LIPD.', 'Australia / New Zealand, LIPD class.'],
  'radio.region.IN.label': ['IN 866', 'IN 866'],
  'radio.region.IN.note': ['Inde, bande 865-867 MHz.', 'India, 865-867 MHz band.'],
  'radio.region.RU.label': ['RU 869', 'RU 869'],
  'radio.region.RU.note': ['Russie, bande 868,7-869,2 MHz.', 'Russia, 868.7-869.2 MHz band.'],
  'radio.region.CUSTOM.label': ['Personnalise', 'Custom'],
  'radio.region.CUSTOM.note': ['Verifiez la reglementation locale applicable.', 'Check the applicable local regulations.'],

  'radio.deviceLabel.custom': ['Personnalise / autre materiel', 'Custom / other hardware'],
  'radio.deviceNote.custom': [
    'Saisissez vous-meme la puissance et les gains d antenne.',
    'Enter power and antenna gains yourself.',
  ],
  'radio.deviceLabel.xiao_wio_sx1262': ['Seeed XIAO nRF52840 + Wio-SX1262', 'Seeed XIAO nRF52840 + Wio-SX1262'],
  'radio.deviceSummary.xiao_wio_sx1262': [
    'nRF52840 Cortex-M4 64 MHz, BLE 5.0 / NFC - Wio-SX1262, 862 a 930 MHz',
    'nRF52840 Cortex-M4 64 MHz, BLE 5.0 / NFC - Wio-SX1262, 862 to 930 MHz',
  ],
  'radio.deviceNote.xiao_wio_sx1262': [
    'Puissance de 22 dBm reprise de la fiche du SX1262 (amplificateur haute puissance) : la description ' +
      'du kit ne la precise pas, verifiez le reglage effectif de votre firmware. Gain de 2 dBi estime ' +
      'pour l antenne fournie, a remplacer si vous connaissez la votre. Antenne montee directement sur ' +
      'le module : perte de cable nulle.',
    'Power of 22 dBm taken from the SX1262 datasheet (high-power amplifier): the kit description does ' +
      'not specify it, check your firmware\'s actual setting. Gain of 2 dBi estimated for the supplied ' +
      'antenna, replace it if you know your actual figure. Antenna mounted directly on the module: zero cable loss.',
  ],
  'radio.deviceLabel.generic_sx1262': ['Module SX1262 generique', 'Generic SX1262 module'],
  'radio.deviceSummary.generic_sx1262': [
    'Semtech SX1262, sortie haute puissance jusqu a 22 dBm',
    'Semtech SX1262, high-power output up to 22 dBm',
  ],
  'radio.deviceNote.generic_sx1262': [
    'Valeur maximale du SX1262. Le gain depend entierement de l antenne montee.',
    'Maximum SX1262 value. Gain depends entirely on the mounted antenna.',
  ],
  'radio.deviceLabel.generic_sx127x': ['Module SX1276 / SX1278 generique', 'Generic SX1276 / SX1278 module'],
  'radio.deviceSummary.generic_sx127x': [
    'Semtech SX1276/78, sortie PA_BOOST jusqu a 20 dBm',
    'Semtech SX1276/78, PA_BOOST output up to 20 dBm',
  ],
  'radio.deviceNote.generic_sx127x': [
    'Valeur maximale sur la broche PA_BOOST. Le gain depend de l antenne montee.',
    'Maximum value on the PA_BOOST pin. Gain depends on the mounted antenna.',
  ],

  // --- exporters.js (GPX / KML / PDF) --------------------------------------
  'export.disclaimerShort': [
    'Relief IGN, vegetation et bati OpenStreetMap. Les hauteurs de couvert sont des valeurs par ' +
      'defaut : OSM ne renseigne presque jamais la hauteur de la vegetation, et seuls 8 % des ' +
      'batiments portent une hauteur. Le bruit radio local, les reflexions et la variabilite ' +
      'temporelle ne sont pas modelises. Toute simulation doit etre confirmee par un test terrain ' +
      'avec deux noeuds reels.',
    'IGN terrain, OpenStreetMap vegetation and buildings. Cover heights are default assumptions: OSM ' +
      'almost never records vegetation height, and only 8% of buildings carry a height. Local RF ' +
      'noise, reflections and temporal variability are not modeled. Every simulation must be ' +
      'confirmed by a field test with two real nodes.',
  ],
  'export.tx': ['Emetteur', 'Transmitter'],
  'export.rx': ['Recepteur', 'Receiver'],
  'export.relayName': ['RELAIS', 'RELAY'],
  'export.relayNameN': ['RELAIS {{n}}', 'RELAY {{n}}'],
  'export.relayRoleN': ['Relais {{n}} sur {{total}} (antenne {{h}} m)', 'Relay {{n}} of {{total}} (antenna {{h}} m)'],
  'export.relayRole': ['Relais (antenne {{h}} m)', 'Relay (antenna {{h}} m)'],
  'export.capTowards': ['vers {{name}} : {{cap}}', 'to {{name}}: {{cap}}'],
  'export.antennaCap': [' - Cap antenne (nord vrai) {{caps}}', ' - Antenna bearing (true north) {{caps}}'],
  'export.linkName': ['Liaison LoRa {{tx}} - {{rx}}', 'LoRa link {{tx}} - {{rx}}'],
  'export.radioTrack': ['Trajet radio', 'Radio path'],
  'export.groundAltitude': ['Altitude sol : {{e}} m', 'Ground elevation: {{e}} m'],
  'export.kml.hop1Margin': ['Marge bond 1 : {{v}} dB', 'Hop 1 margin: {{v}} dB'],
  'export.kml.hop2Margin': ['Marge bond 2 : {{v}} dB', 'Hop 2 margin: {{v}} dB'],
  'export.kml.overallMedian': ['Marge globale mediane : {{v}} dB', 'Overall median margin: {{v}} dB'],
  'export.kml.held95': ['Marge tenue sur 95 % des emplacements : {{v}} dB', 'Margin held on 95% of locations: {{v}} dB'],
  'export.kml.foliage': ['Vegetation traversee : {{v}} dB', 'Vegetation crossed: {{v}} dB'],
  'export.pdf.studyTitle': ['Etude d implantation de relais - {{date}}', 'Relay placement study - {{date}}'],
  'export.pdf.medianMarginLine': [
    'Marge mediane {{m50}} dB, tenue sur 95 % des emplacements {{m95}} dB (dispersion {{sigma}} dB). {{foliage}}',
    'Median margin {{m50}} dB, held on 95% of locations {{m95}} dB (dispersion {{sigma}} dB). {{foliage}}',
  ],
  'export.pdf.foliageCrossed': ['Vegetation traversee : {{v}} dB.', 'Vegetation crossed: {{v}} dB.'],
  'export.pdf.noFoliage': ['Aucune vegetation traversee sur le trajet.', 'No vegetation crossed along the path.'],
  'export.pdf.sites': ['Sites', 'Sites'],
  'export.pdf.txLine': [
    '{{name}} - {{lat}}, {{lon}} - sol {{elev}} - antenne {{h}} m / {{gain}} dBi - cap antenne {{cap}}',
    '{{name}} - {{lat}}, {{lon}} - ground {{elev}} - antenna {{h}} m / {{gain}} dBi - antenna bearing {{cap}}',
  ],
  'export.pdf.tx': ['Emetteur (TX)', 'Transmitter (TX)'],
  'export.pdf.rx': ['Recepteur (RX)', 'Receiver (RX)'],
  'export.pdf.relayRetained': ['Relais retenu', 'Retained relay'],
  'export.pdf.relayLine': [
    '{{lat}}, {{lon}} - sol {{elev}} - antenne {{h}} m / {{gain}} dBi - cap vers TX {{capTx}} / cap vers RX {{capRx}}',
    '{{lat}}, {{lon}} - ground {{elev}} - antenna {{h}} m / {{gain}} dBi - bearing to TX {{capTx}} / bearing to RX {{capRx}}',
  ],
  'export.pdf.distances': ['Distances', 'Distances'],
  'export.pdf.distancesLine': [
    'TX {{d1}} - RX {{d2}} (trajet total {{total}})',
    'TX {{d1}} - RX {{d2}} (total path {{total}})',
  ],
  'export.pdf.declinationNote': [
    'Caps en azimut geographique (nord vrai) : corrigez de la declinaison magnetique locale pour une boussole classique.',
    'Bearings are geographic azimuths (true north): correct for local magnetic declination on a standard compass.',
  ],
  'export.pdf.chainTitle': ['Chaine de relais', 'Relay chain'],
  'export.pdf.chainRelaysN': ['{{n}} relais', '{{n}} relays'],
  'export.pdf.chainAtteint': ['Objectif de marge atteint', 'Margin target reached'],
  'export.pdf.chainNonAtteint': ['Objectif non atteint', 'Target not reached'],
  'export.pdf.chainSummaryLine': [
    ' - maillon le plus faible {{margin}} a 95 % (objectif {{target}} dB)',
    ' - weakest link {{margin}} at 95% (target {{target}} dB)',
  ],
  'export.pdf.nodeLine': [
    '{{lat}}, {{lon}} - sol {{elev}} - mat {{h}} m - a {{dPrev}} de {{prevLabel}} et {{dNext}} de {{nextLabel}} - cap vers {{prevLabel}} {{capPrev}} / cap vers {{nextLabel}} {{capNext}}',
    '{{lat}}, {{lon}} - ground {{elev}} - mast {{h}} m - {{dPrev}} from {{prevLabel}} and {{dNext}} from {{nextLabel}} - bearing to {{prevLabel}} {{capPrev}} / bearing to {{nextLabel}} {{capNext}}',
  ],
  'export.pdf.col.hop': ['Bond', 'Hop'],
  'export.pdf.col.cap': ['Cap', 'Bearing'],
  'export.pdf.col.distance': ['Distance', 'Distance'],
  'export.pdf.col.vegetation': ['Vegetation', 'Vegetation'],
  'export.pdf.col.fresnel': ['Fresnel', 'Fresnel'],
  'export.pdf.col.margin95': ['Marge 95 %', 'Margin 95%'],
  'export.pdf.chainFooter': [
    'Longueur cumulee du trajet : {{total}}, contre {{direct}} a vol d oiseau. Caps en azimut ' +
      'geographique (nord vrai) : corrigez de la declinaison magnetique locale pour une boussole classique.',
    'Cumulative path length: {{total}}, versus {{direct}} as the crow flies. Bearings are geographic ' +
      'azimuths (true north): correct for local magnetic declination on a standard compass.',
  ],
  'export.pdf.radioParams': ['Parametres radio', 'Radio settings'],
  'export.pdf.regionFreq': ['Region / frequence', 'Region / frequency'],
  'export.pdf.regionFreqLine': ['{{region}} - {{freq}} MHz', '{{region}} - {{freq}} MHz'],
  'export.pdf.presetLine': [
    '{{preset}} (SF{{sf}}, BW {{bw}} kHz, sensibilite {{sens}} dBm)',
    '{{preset}} (SF{{sf}}, BW {{bw}} kHz, sensitivity {{sens}} dBm)',
  ],
  'export.pdf.power': ['Puissance', 'Power'],
  'export.pdf.powerLine': [
    '{{power}} dBm conduits - PIRE {{eirp}} - ERP {{erp}}',
    '{{power}} dBm conducted - EIRP {{eirp}} - ERP {{erp}}',
  ],
  'export.pdf.regLimit': ['Limite reglementaire', 'Regulatory limit'],
  'export.pdf.regLimitLine': ['{{limit}} dBm ERP{{over}}', '{{limit}} dBm ERP{{over}}'],
  'export.pdf.overSuffix': ['  -- DEPASSEMENT --', '  -- EXCEEDED --'],
  'export.pdf.cableLoss': ['Perte cable', 'Cable loss'],
  'export.pdf.cableLossLine': ['{{db}} dB par site', '{{db}} dB per site'],
  'export.pdf.desiredMargin': ['Marge souhaitee', 'Desired margin'],
  'export.pdf.dem': ['Modele numerique de terrain', 'Digital elevation model'],
  'export.pdf.search': ['Recherche', 'Search'],
  'export.pdf.searchLine': [
    'rayon {{radius}} m - pas {{step}} m - hauteurs testees {{heights}} m',
    'radius {{radius}} m - step {{step}} m - heights tested {{heights}} m',
  ],
  'export.pdf.linkSummary': ['Bilan de la liaison retenue', 'Retained link summary'],
  'export.pdf.hop1Col': ['Bond 1 (TX -> relais)', 'Hop 1 (TX -> relay)'],
  'export.pdf.hop2Col': ['Bond 2 (relais -> RX)', 'Hop 2 (relay -> RX)'],
  'export.pdf.rowDistance': ['Distance', 'Distance'],
  'export.pdf.rowFspl': ['Perte espace libre', 'Free space loss'],
  'export.pdf.rowDiffraction': ['Diffraction J(v)', 'Diffraction J(v)'],
  'export.pdf.rowRssi': ['RSSI estime', 'Estimated RSSI'],
  'export.pdf.rowVegetation': ['Vegetation', 'Vegetation'],
  'export.pdf.rowMedianMargin': ['Marge mediane', 'Median margin'],
  'export.pdf.rowMargin95': ['Marge a 95 %', 'Margin at 95%'],
  'export.pdf.rowFresnel': ['Fresnel degagee', 'Fresnel clearance'],
  'export.pdf.overallMargin': ['Marge globale (maillon faible) : {{v}}', 'Overall margin (weakest link): {{v}}'],
  'export.pdf.directRef': [
    'Pour memoire, liaison directe TX-RX sans relais : marge {{margin}}, diffraction {{diff}}.',
    'For reference, direct TX-RX link without relay: margin {{margin}}, diffraction {{diff}}.',
  ],
  'export.pdf.ranking': ['Classement des emplacements', 'Location ranking'],
  'export.pdf.col.n': ['#', '#'],
  'export.pdf.col.lat': ['Latitude', 'Latitude'],
  'export.pdf.col.lon': ['Longitude', 'Longitude'],
  'export.pdf.col.alt': ['Alt.', 'Elev.'],
  'export.pdf.col.ht': ['Ht', 'Ht'],
  'export.pdf.col.dTx': ['d TX', 'd TX'],
  'export.pdf.col.dRx': ['d RX', 'd RX'],
  'export.pdf.col.b1': ['B1', 'H1'],
  'export.pdf.col.b2': ['B2', 'H2'],
  'export.pdf.col.overall': ['Globale', 'Overall'],
  'export.pdf.col.fresnel': ['Fresnel', 'Fresnel'],
  'export.pdf.rankingNote': [
    'Marges en dB, distances en km. Ht = hauteur d antenne retenue pour ce site, d TX et d RX = distances aux deux extremites.',
    'Margins in dB, distances in km. Ht = antenna height retained for this site, d TX and d RX = distances to both ends.',
  ],
  'export.pdf.mapTitle': ['Carte - liaison et portee du relais', 'Map - link and relay range'],
  'export.pdf.mapNote': [
    'Carte schematique (sans fond cartographique) : distances et positions exactes, relief non represente ici.',
    'Schematic map (no basemap): exact distances and positions, terrain not represented here.',
  ],
  'export.pdf.profile1Title': ['Profil bond 1 : TX -> relais', 'Profile hop 1: TX -> relay'],
  'export.pdf.profile2Title': ['Profil bond 2 : relais -> RX', 'Profile hop 2: relay -> RX'],
  'export.pdf.heightsTitle': [
    'Marge en fonction de la hauteur d antenne du relais',
    'Margin as a function of relay antenna height',
  ],
  'export.pdf.warningTitle': ['Avertissement', 'Warning'],

  // --- Couverture d une zone -------------------------------------------------
  'app.section.area': ['Couvrir une zone', 'Cover an area'],
  'area.intro': [
    'Definissez une zone : l application cherche l emplacement de relais qui en couvre la plus ' +
      'grande part. Les emplacements testes sont pris dans la zone elle-meme.',
    'Define an area: the app searches for the relay location that covers the largest share of it. ' +
      'Candidate locations are taken from within the area itself.',
  ],
  'area.define': ['Definir la zone', 'Define the area'],
  'area.redefine': ['Redefinir la zone', 'Redefine the area'],
  'area.cancel': ['Annuler', 'Cancel'],
  'area.clear': ['Effacer', 'Clear'],
  'area.pickHint': [
    'Cliquez deux coins opposes de la zone sur la carte.',
    'Click two opposite corners of the area on the map.',
  ],
  'area.pick1': ['Cliquez le premier coin de la zone (1 sur 2)', 'Click the first corner of the area (1 of 2)'],
  'area.pick2': ['Cliquez le coin oppose (2 sur 2)', 'Click the opposite corner (2 of 2)'],
  'area.noZone': ['Aucune zone definie.', 'No area defined.'],
  'area.size': ['Zone', 'Area'],
  'area.sizeValue': ['{{w}} x {{h}} km - {{a}} km2', '{{w}} x {{h}} km - {{a}} km2'],
  'area.relayHeight': ['Hauteur antenne du relais', 'Relay antenna height'],
  'area.candidateStep': ['Pas entre emplacements testes', 'Spacing between tested locations'],
  'area.candidateStepHint': [
    'Plus le pas est fin, plus la recherche est precise - et longue : le nombre de liaisons a ' +
      'evaluer varie comme le carre de ce reglage.',
    'The finer the spacing, the more precise the search - and the longer: the number of links to ' +
      'evaluate varies as the square of this setting.',
  ],
  'area.testStep': ['Pas entre points de test', 'Spacing between test points'],
  'area.testStepHint': [
    'Maille representant la surface a couvrir. Chaque point compte pour un carre de cette taille.',
    'Cell representing the surface to cover. Each point stands for a square of this size.',
  ],
  'area.gridStep': ['Pas du relief', 'Terrain step'],
  'area.candidates': ['Emplacements testes', 'Locations tested'],
  'area.targets': ['Points de test', 'Test points'],
  'area.links': ['Liaisons a evaluer', 'Links to evaluate'],
  'area.demPoints': ['Points MNT a telecharger', 'DEM points to download'],
  'area.run': ['Chercher le meilleur emplacement', 'Find the best location'],
  'area.running': ['Recherche...', 'Searching...'],
  'area.tooHeavyTitle': ['Calcul trop lourd', 'Computation too heavy'],
  'area.tooHeavyMsg': [
    'Ce reglage demande {{n}} liaisons a evaluer, bien au-dela de ce qui reste interactif. ' +
      'Augmentez les pas, ou reduisez la zone.',
    'This setting requires {{n}} links to evaluate, far beyond what stays interactive. Increase the ' +
      'spacings, or shrink the area.',
  ],
  'area.heavyWarn': [
    '{{n}} liaisons a evaluer : le calcul prendra un moment.',
    '{{n}} links to evaluate: the computation will take a while.',
  ],
  'area.resultsTitle': ['Meilleurs emplacements pour couvrir la zone', 'Best locations to cover the area'],
  'area.resultsHint': [
    'Part de la zone couverte depuis chaque emplacement, au seuil de marge retenu ({{db}} dB, ' +
      'tenu sur 95 % des emplacements).',
    'Share of the area covered from each location, at the retained margin threshold ({{db}} dB, ' +
      'held on 95% of locations).',
  ],
  'area.col.rank': ['#', '#'],
  'area.col.coords': ['Coordonnees', 'Coordinates'],
  'area.col.elev': ['Alt.', 'Elev.'],
  'area.col.covered': ['Zone couverte', 'Area covered'],
  'area.col.areaKm2': ['Surface', 'Surface'],
  'area.col.margin': ['Marge moyenne', 'Mean margin'],
  'area.best': [
    'Le meilleur emplacement couvre {{pct}} % de la zone, soit {{km}} km2.',
    'The best location covers {{pct}}% of the area, i.e. {{km}} km2.',
  ],
  'area.stats': [
    '{{candidates}} emplacements testes contre {{targets}} points de test, {{evaluated}} liaisons ' +
      'evaluees en {{ms}} ms.',
    '{{candidates}} locations tested against {{targets}} test points, {{evaluated}} links evaluated ' +
      'in {{ms}} ms.',
  ],
  'area.showHeat': ['Carte de couverture', 'Coverage map'],
  'area.footer': [
    'Les emplacements candidats sont pris dans la zone : un sommet situe juste en dehors, qui la ' +
      'couvrirait peut-etre mieux, n est pas teste - elargissez la zone pour l inclure. Chaque ' +
      'liaison est evaluee sur le relief reel, avec la meme physique que le reste de l application.',
    'Candidate locations are taken from within the area: a summit just outside it, which might cover ' +
      'it better, is not tested - widen the area to include it. Every link is evaluated on real ' +
      'terrain, with the same physics as the rest of the application.',
  ],
  'area.progress.dem': ['Relief de la zone - {{done}}/{{total}} requetes', 'Area terrain - {{done}}/{{total}} requests'],
  'area.progress.scan': ['Recherche du meilleur emplacement', 'Searching for the best location'],
  'area.error.noZone': ['Definissez d abord une zone sur la carte.', 'Define an area on the map first.'],
  'area.error.tooBig': [
    'Zone trop vaste pour ce pas de relief : augmentez le pas, ou reduisez la zone.',
    'Area too large for this terrain step: increase the step, or shrink the area.',
  ],
  'area.tooltip.spot': [
    'Emplacement #{{n}}<br>{{pct}} % de la zone ({{km}} km2)<br>alt. {{elev}} m',
    'Location #{{n}}<br>{{pct}}% of the area ({{km}} km2)<br>elev. {{elev}} m',
  ],
  'area.tooltip.zone': ['Zone a couvrir', 'Area to cover'],

  // --- Classeur de calcul (.xlsx) -------------------------------------------
  'app.export.xlsx.label': ['Feuille de calcul', 'Spreadsheet'],
  'app.export.xlsx.hint': ['Tous les calculs, feuille par feuille', 'Every calculation, sheet by sheet'],
  'app.error.xlsxUnavailable': ['Feuille de calcul indisponible : {{msg}}', 'Spreadsheet unavailable: {{msg}}'],

  'xlsx.sheet.summary': ['Synthese', 'Summary'],
  'xlsx.sheet.linkBudget': ['Bilan de liaison', 'Link budget'],
  'xlsx.sheet.chain': ['Chaine de relais', 'Relay chain'],
  'xlsx.sheet.ranking': ['Classement', 'Ranking'],
  'xlsx.sheet.rankingByHeight': ['Classement par hauteur', 'Ranking by height'],
  'xlsx.sheet.heights': ['Hauteurs d antenne', 'Antenna heights'],
  'xlsx.sheet.profile1': ['Profil bond 1', 'Profile hop 1'],
  'xlsx.sheet.profile2': ['Profil bond 2', 'Profile hop 2'],
  'xlsx.sheet.profileDirect': ['Profil liaison directe', 'Profile direct link'],
  'xlsx.sheet.coverage': ['Portee par azimut', 'Range by azimuth'],

  'xlsx.col.parameter': ['Parametre', 'Parameter'],
  'xlsx.col.value': ['Valeur', 'Value'],
  'xlsx.col.quantity': ['Grandeur', 'Quantity'],
  'xlsx.col.rank': ['Rang', 'Rank'],
  'xlsx.col.lat': ['Latitude', 'Latitude'],
  'xlsx.col.lon': ['Longitude', 'Longitude'],
  'xlsx.col.elevM': ['Altitude sol (m)', 'Ground elevation (m)'],
  'xlsx.col.slopeDeg': ['Pente (deg)', 'Slope (deg)'],
  'xlsx.col.dTxKm': ['Distance TX (km)', 'Distance TX (km)'],
  'xlsx.col.dRxKm': ['Distance RX (km)', 'Distance RX (km)'],
  'xlsx.col.mastM': ['Hauteur antenne (m)', 'Antenna height (m)'],
  'xlsx.col.m1': ['Marge bond 1 (dB)', 'Margin hop 1 (dB)'],
  'xlsx.col.m2': ['Marge bond 2 (dB)', 'Margin hop 2 (dB)'],
  'xlsx.col.marginDb': ['Marge globale (dB)', 'Overall margin (dB)'],
  'xlsx.col.margin95Db': ['Marge 95 % (dB)', 'Margin 95% (dB)'],
  'xlsx.col.scoreDb': ['Score de classement (dB)', 'Ranking score (dB)'],
  'xlsx.col.c1': ['Fresnel bond 1 (%)', 'Fresnel hop 1 (%)'],
  'xlsx.col.c2': ['Fresnel bond 2 (%)', 'Fresnel hop 2 (%)'],
  'xlsx.col.rssi1': ['RSSI bond 1 (dBm)', 'RSSI hop 1 (dBm)'],
  'xlsx.col.rssi2': ['RSSI bond 2 (dBm)', 'RSSI hop 2 (dBm)'],
  'xlsx.col.diff1': ['Diffraction bond 1 (dB)', 'Diffraction hop 1 (dB)'],
  'xlsx.col.diff2': ['Diffraction bond 2 (dB)', 'Diffraction hop 2 (dB)'],
  'xlsx.col.foliageDb': ['Vegetation (dB)', 'Vegetation (dB)'],
  'xlsx.col.isBest': ['Hauteur retenue', 'Retained height'],
  'xlsx.col.hop': ['Bond', 'Hop'],
  'xlsx.col.from': ['De', 'From'],
  'xlsx.col.to': ['Vers', 'To'],
  'xlsx.col.latFrom': ['Latitude de', 'Latitude from'],
  'xlsx.col.lonFrom': ['Longitude de', 'Longitude from'],
  'xlsx.col.elevFrom': ['Altitude de (m)', 'Elevation from (m)'],
  'xlsx.col.mastFrom': ['Mat de (m)', 'Mast from (m)'],
  'xlsx.col.latTo': ['Latitude vers', 'Latitude to'],
  'xlsx.col.lonTo': ['Longitude vers', 'Longitude to'],
  'xlsx.col.elevTo': ['Altitude vers (m)', 'Elevation to (m)'],
  'xlsx.col.mastTo': ['Mat vers (m)', 'Mast to (m)'],
  'xlsx.col.bearingDeg': ['Cap (deg, nord vrai)', 'Bearing (deg, true north)'],
  'xlsx.col.distKm': ['Distance (km)', 'Distance (km)'],
  'xlsx.col.fresnelPct': ['Fresnel degagee (%)', 'Fresnel clearance (%)'],
  'xlsx.col.diffractionDb': ['Diffraction (dB)', 'Diffraction (dB)'],
  'xlsx.col.rssiDbm': ['RSSI (dBm)', 'RSSI (dBm)'],
  'xlsx.col.index': ['Echantillon', 'Sample'],
  'xlsx.col.terrainM': ['Relief 4/3 + bati (m)', 'Terrain 4/3 + buildings (m)'],
  'xlsx.col.canopyM': ['Sommet de canopee (m)', 'Canopy top (m)'],
  'xlsx.col.losM': ['Ligne de visee (m)', 'Line of sight (m)'],
  'xlsx.col.fresnelUpM': ['Fresnel haut (m)', 'Fresnel upper (m)'],
  'xlsx.col.fresnelDownM': ['Fresnel bas (m)', 'Fresnel lower (m)'],
  'xlsx.col.fresnelRadiusM': ['Rayon 1re zone Fresnel (m)', '1st Fresnel zone radius (m)'],
  'xlsx.col.clearanceM': ['Degagement (m)', 'Clearance (m)'],
  'xlsx.col.clearanceRatioPct': ['Degagement (% de Fresnel)', 'Clearance (% of Fresnel)'],
  'xlsx.col.azimuthDeg': ['Azimut (deg)', 'Azimuth (deg)'],
  'xlsx.col.rangeReliableKm': ['Portee fiable (km)', 'Reliable range (km)'],
  'xlsx.col.rangeLimitKm': ['Portee limite de reception (km)', 'Reception limit range (km)'],

  'xlsx.row.generatedAt': ['Date de l export', 'Export date'],
  'xlsx.row.verdict': ['Verdict', 'Verdict'],
  'xlsx.row.verdictReason': ['Motif du verdict', 'Verdict rationale'],
  'xlsx.row.marginMedian': ['Marge mediane (dB)', 'Median margin (dB)'],
  'xlsx.row.margin95': ['Marge tenue sur 95 % des emplacements (dB)', 'Margin held on 95% of locations (dB)'],
  'xlsx.row.sigma': ['Dispersion sigma (dB)', 'Dispersion sigma (dB)'],
  'xlsx.row.minClearance': ['Degagement Fresnel minimal (%)', 'Minimum Fresnel clearance (%)'],
  'xlsx.row.relayHeight': ['Hauteur antenne du relais (m)', 'Relay antenna height (m)'],
  'xlsx.row.directMargin': ['Marge liaison directe sans relais (dB)', 'Direct link margin without relay (dB)'],
  'xlsx.row.directDiffraction': ['Diffraction liaison directe (dB)', 'Direct link diffraction (dB)'],
  'xlsx.row.relayGainDb': ['Gain du relais (dB)', 'Relay gain (dB)'],
  'xlsx.row.chainRelays': ['Relais dans la chaine', 'Relays in the chain'],
  'xlsx.row.chainMargin95': ['Marge du maillon le plus faible a 95 % (dB)', 'Weakest link margin at 95% (dB)'],
  'xlsx.row.chainFeasible': ['Objectif de marge atteint', 'Margin target reached'],
  'xlsx.row.yes': ['oui', 'yes'],
  'xlsx.row.no': ['non', 'no'],
  'xlsx.row.candidates': ['Mailles candidates', 'Candidate cells'],
  'xlsx.row.evaluated': ['Mailles evaluees', 'Cells evaluated'],
  'xlsx.row.excludedSlope': ['Ecartees pour pente > 30 deg', 'Excluded for slope > 30 deg'],
  'xlsx.row.excludedWater': ['Ecartees comme surfaces en eau', 'Excluded as water surfaces'],
  'xlsx.row.excludedNoData': ['Ecartees sans donnee d altitude', 'Excluded with no elevation data'],
  'xlsx.row.computeMs': ['Duree du calcul (ms)', 'Computation time (ms)'],
  'xlsx.row.heightsTested': ['Hauteurs testees (m)', 'Heights tested (m)'],
  'xlsx.row.gridStep': ['Pas de la grille (m)', 'Grid step (m)'],
  'xlsx.row.searchRadius': ['Rayon de recherche (m)', 'Search radius (m)'],
  'xlsx.row.clutter': ['Couverture du sol modelisee', 'Ground cover modeled'],
  'xlsx.row.buildings': ['Batiments inclus', 'Buildings included'],
  'xlsx.row.section.sites': ['-- SITES --', '-- SITES --'],
  'xlsx.row.section.radio': ['-- RADIO --', '-- RADIO --'],
  'xlsx.row.section.result': ['-- RESULTAT --', '-- RESULT --'],
  'xlsx.row.section.chain': ['-- CHAINE --', '-- CHAIN --'],
  'xlsx.row.section.scan': ['-- BALAYAGE --', '-- SCAN --'],
  'xlsx.note.disclaimer': ['Avertissement', 'Disclaimer'],

  // --- Feuille « Formules » : le bilan refait pas a pas, en formules vivantes
  'xlsx.sheet.formulas': ['Formules', 'Formulas'],
  'xlsx.f.col.quantity': ['Grandeur', 'Quantity'],
  'xlsx.f.col.symbol': ['Symbole', 'Symbol'],
  'xlsx.f.col.unit': ['Unite', 'Unit'],
  'xlsx.f.col.formula': ['Formule appliquee', 'Formula applied'],
  'xlsx.f.section.inputs': ['-- ENTREES (modifiables) --', '-- INPUTS (editable) --'],
  'xlsx.f.section.obstacle': ['-- ARETE DOMINANTE --', '-- DOMINANT EDGE --'],
  'xlsx.f.section.geometry': ['-- GEOMETRIE --', '-- GEOMETRY --'],
  'xlsx.f.section.losses': ['-- PERTES --', '-- LOSSES --'],
  'xlsx.f.section.budget': ['-- BILAN --', '-- LINK BUDGET --'],
  'xlsx.f.freq': ['Frequence', 'Frequency'],
  'xlsx.f.lambda': ['Longueur d onde', 'Wavelength'],
  'xlsx.f.dist': ['Longueur du bond', 'Hop length'],
  'xlsx.f.txPower': ['Puissance d emission', 'Transmit power'],
  'xlsx.f.gA': ['Gain antenne emission', 'Transmit antenna gain'],
  'xlsx.f.gB': ['Gain antenne reception', 'Receive antenna gain'],
  'xlsx.f.cableLoss': ['Perte cable par site', 'Cable loss per site'],
  'xlsx.f.sensitivity': ['Sensibilite du recepteur', 'Receiver sensitivity'],
  'xlsx.f.kFactor': ['Facteur de rayon terrestre k', 'Earth radius factor k'],
  'xlsx.f.d1': ['Distance depuis l emetteur', 'Distance from transmitter'],
  'xlsx.f.d2': ['Distance jusqu au recepteur', 'Distance to receiver'],
  'xlsx.f.obstacleH': ['Hauteur de l obstacle au-dessus de la visee', 'Obstacle height above line of sight'],
  'xlsx.f.foliageDepth': ['Profondeur de vegetation traversee', 'Depth of vegetation crossed'],
  'xlsx.f.bulge': ['Bombement terrestre a cette abscisse', 'Earth bulge at this abscissa'],
  'xlsx.f.fresnelR': ['Rayon de la 1re zone de Fresnel', '1st Fresnel zone radius'],
  'xlsx.f.vParam': ['Parametre de diffraction v', 'Diffraction parameter v'],
  'xlsx.f.jv': ['Perte de l arete dominante J(v)', 'Dominant edge loss J(v)'],
  'xlsx.f.diffTotal': ['Diffraction totale (Deygout, multi-aretes)', 'Total diffraction (Deygout, multi-edge)'],
  'xlsx.f.fsplRow': ['Perte en espace libre', 'Free space path loss'],
  'xlsx.f.foliageRow': ['Perte de feuillage (Weissberger)', 'Foliage loss (Weissberger)'],
  'xlsx.f.rssi': ['Puissance recue estimee', 'Estimated received power'],
  'xlsx.f.marginRow': ['Marge mediane', 'Median margin'],
  'xlsx.f.sigmaRow': ['Dispersion de lieu', 'Location variability'],
  'xlsx.f.margin95Row': ['Marge tenue sur 95 % des emplacements', 'Margin held on 95% of locations'],
  'xlsx.f.clearanceRow': ['Degagement de Fresnel au point critique', 'Fresnel clearance at the critical point'],
  'xlsx.f.penaltyRow': ['Penalite de degagement', 'Clearance penalty'],
  'xlsx.f.scoreRow': ['Score de classement', 'Ranking score'],
  'xlsx.f.note.live': [
    'Les cellules des colonnes Bond 1 et Bond 2 sont de vraies formules : modifiez une entree ' +
      '(frequence, puissance, gain...) et tout le bilan se recalcule dans le tableur.',
    'Cells in the Hop 1 and Hop 2 columns are live formulas: change an input (frequency, power, ' +
      'gain...) and the whole budget recomputes in the spreadsheet.',
  ],
  'xlsx.f.note.deygout': [
    'Seule exception : la diffraction totale ne se met pas en formule. La construction de Deygout ' +
      'parcourt le profil et se rappelle recursivement sur les sous-troncons de part et d autre de ' +
      'l arete dominante ; la ligne J(v) ci-dessus ne reproduit que cette arete dominante, et ' +
      'l ecart entre les deux est exactement ce qu apportent les aretes secondaires.',
    'One exception: total diffraction cannot be expressed as a formula. The Deygout construction ' +
      'walks the profile and recurses on the sub-sections either side of the dominant edge; the ' +
      'J(v) row above reproduces only that dominant edge, and the gap between the two is exactly ' +
      'what the secondary edges contribute.',
  ],
  'xlsx.f.note.profile': [
    'Le rayon de Fresnel, le bombement et le parametre v sont donnes a l abscisse de l arete ' +
      'dominante. Les feuilles Profil donnent ces memes grandeurs en chaque point du trajet.',
    'Fresnel radius, earth bulge and the v parameter are given at the dominant edge abscissa. The ' +
      'Profile sheets give the same quantities at every point along the path.',
  ],
  'xlsx.f.noEdge': ['aucune arete obstruante', 'no obstructing edge'],

  // --- mapRender.js (carte schematique du PDF) ------------------------------
  'mapRender.legend.reliable': ['Portee fiable', 'Reliable range'],
  'mapRender.legend.limited': ['Reception limite', 'Limited reception'],
  'mapRender.legend.horizon': ['Horizon radio (geometrique)', 'Radio horizon (geometric)'],
  'mapRender.legend.txRx': ['TX / RX', 'TX / RX'],
  'mapRender.legend.relay': ['Relais', 'Relay'],
  'mapRender.north': ['N', 'N'],
};

export { STORAGE_KEY };

/** Traduction sans contexte React, pour les modules purs (radio.js, exporters.js, mapRender.js). */
export function tFor(lang, key, vars) {
  const idx = lang === 'fr' ? 0 : 1;
  const entry = STRINGS[key];
  let str = entry ? entry[idx] : key;
  if (vars) for (const k in vars) str = str.split(`{{${k}}}`).join(String(vars[k]));
  return str;
}
