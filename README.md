# LoRa Relay Planner

Application web mono-page qui détermine l'emplacement optimal d'un relais
LoRa / Meshtastic entre deux nœuds fixes, à partir du relief réel.

Trois marqueurs : **TX** → **RELAIS** (calculé) → **RX**. L'application balaie
un corridor entre les deux sites, calcule les deux bonds pour chaque maille et
classe les emplacements par qualité de liaison.

Tout tourne côté client : aucun backend, déployable tel quel sur GitHub Pages
ou Vercel.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ prêt à publier
```

---

## Écarts assumés par rapport au cahier des charges

Trois points de la spécification d'origine ne pouvaient pas être appliqués
tels quels.

### 1. Le bombement terrestre était exprimé en millimètres

La formule `bulge(d1, d2) = (d1 × d2) / (2 × 8500)` avec `d` en km donne des
kilomètres, soit un résultat 1000 fois trop petit. La forme correcte pour
k = 4/3 est :

```
h(m) = d1 × d2 / (12,75 × k) = d1 × d2 / 17      (d en km)
```

Vérification : 1,47 m à mi-parcours d'une liaison de 10 km, valeur de
référence classique.

### 2. La constante de Fresnel 17,31 impose des GHz

`r = 17,31 × √(d1·d2 / (f·D))` n'est valable que pour **f en GHz**. Avec des
MHz, le rayon sortait 31 fois trop petit — la zone de Fresnel devenait
négligeable et toute liaison paraissait dégagée. L'implémentation convertit
donc en GHz.

Vérification : 29,4 m à mi-parcours d'une liaison de 10 km à 868 MHz.

Les autres formules (FSPL, paramètre `v`, `J(v)`, bilan de liaison) sont
reprises telles quelles et vérifiées numériquement.

### 3. OpenTopoData est inutilisable depuis un navigateur

L'API publique `api.opentopodata.org` **n'envoie aucun en-tête
`Access-Control-Allow-Origin`**. Elle répond correctement en `curl`, mais tout
appel depuis une page web est bloqué par la politique CORS — ce qui est
incompatible avec la contrainte « aucun backend ». Idem pour l'ancien hôte
`wxs.ign.fr`, fermé depuis 2024.

Les fournisseurs retenus ont tous été testés depuis le navigateur :

| Fournisseur | Couverture | Résolution | Lot | CORS |
|---|---|---|---|---|
| **IGN RGE ALTI** (défaut) | France + DROM | 1–5 m | 200 pts | ✅ |
| **Open-Elevation** (SRTM) | 60 N – 56 S | 30 m | 500 pts | ✅ |
| **Copernicus GLO-90** (Open-Meteo) | mondiale | 90 m | 100 pts | ✅ |
| OpenTopoData EU-DEM / SRTM | — | 25 / 30 m | 100 pts | ❌ auto-hébergement requis |

Le repli est automatique et décidé **lot par lot** : une erreur réseau, mais
aussi un lot entièrement hors couverture (cas de l'IGN au-delà des
frontières, qui renvoie `-99999`), fait basculer sur le fournisseur suivant.

OpenTopoData reste sélectionnable pour qui héberge sa propre instance :
l'adresse se saisit dans le panneau « Recherche du relais ».

---

## Moteur de calcul

Pour chaque maille candidate, les deux bonds sont analysés séparément :

1. **Profil de terrain** échantillonné sur la grille MNT locale.
2. **Courbure terrestre** k = 4/3 ajoutée au relief, puis géométrie plane.
3. **Première zone de Fresnel** en chaque point, et pourcentage de dégagement.
4. **Perte en espace libre** `20·log10(D_km) + 20·log10(f_MHz) + 32,44`.
5. **Diffraction par arêtes multiples**, construction de Deygout (ITU-R P.526),
   sur le relief augmenté du bâti.
6. **Atténuation de feuillage** (Weissberger) sur la végétation traversée.
7. **Bilan** `RSSI = P_tx + G_tx + G_rx − 2·pertes_câble − FSPL − J(v) − L_feuillage`,
   puis `marge = RSSI − sensibilité_preset`.
8. **Marges statistiques** : médiane et valeur tenue sur 95 % des emplacements.
9. **Score** = `min(marge95_bond1, marge95_bond2)` après pénalité de dégagement.

### Diffraction : pourquoi plusieurs arêtes

Le modèle ne retenait au départ que l'**arête dominante**, l'obstacle le plus
pénalisant du profil. C'est la simplification habituelle, et elle est
insuffisante ici : avec le budget de liaison très large de LoRa (plus de
150 dB), sous-estimer la perte donne des portées qui ne s'arrêtent jamais. La
zone de couverture dégénérait alors en **cercle parfait** calé sur la limite
d'exploration — un résultat qui ne décrit plus rien du terrain.

La construction de **Deygout** isole l'arête dominante, puis recommence de part
et d'autre en prenant son sommet comme extrémité, jusqu'à trois arêtes. Les
pertes s'additionnent.

Une correction était nécessaire : appliquée telle quelle, la méthode découpe
aussi le sol lisse d'une plaine en lames de couteau successives et ajoute une
dizaine de décibels fictifs — un trajet plat de 20 km rasant le sol ressortait
à 17,7 dB au lieu des ~6 dB d'une obstruction rasante unique. La récursion
n'est donc déclenchée que si l'arête **coupe réellement** la ligne de visée
(`v > 0`).

Vérification sur profils synthétiques, mât 15 m vers nœud 2 m à 22 dBm :

| Profil | Diffraction | Marge |
|---|---|---|
| Plat 5 km | 3,1 dB | +48,7 dB |
| Plat 20 km | 5,7 dB | +34,0 dB |
| Plat 40 km | 23,1 dB | +10,6 dB |
| Colline de 120 m à 20 km | 40,7 dB | −0,9 dB |
| Vallonné 20 km | 50,5 dB | −10,7 dB |
| Vallonné 30 km | 70,9 dB | −34,7 dB |

Les valeurs en terrain plat retrouvent les ordres de grandeur classiques d'un
trajet rasant, et le relief fait maintenant réellement échouer les liaisons.

### Couverture du sol

Le MNT ne connaît que le sol nu, et c'était la première source d'erreur du
modèle. La végétation et le bâti viennent d'**OpenStreetMap**, avec une règle
de séparation qui évite tout double comptage et correspond à la physique :

- le **feuillage est un milieu absorbant** — à 868 MHz il est partiellement
  transparent. Modèle de Weissberger sur la profondeur réellement traversée,
  saturé à 400 m : 50 m de forêt coûtent 12,8 dB, 200 m en coûtent 28,8 ;
- le **bâti est un obstacle opaque** — sa hauteur s'ajoute au relief et
  alimente la diffraction. Jamais aux extrémités du trajet : la hauteur
  d'antenne saisie fait foi, sans quoi un site poserait son antenne sur son
  propre toit.

Un rayon qui passe **au-dessus** de la canopée ne subit aucune perte de
feuillage : la profondeur n'est accumulée que là où la ligne de visée passe
sous la cime tout en restant au-dessus du sol.

| OSM | Classe | Hauteur retenue |
|---|---|---|
| `natural=wood`, `landuse=forest` | forêt | 20 m |
| `landuse=orchard` | verger | 5 m |
| `natural=scrub`, `natural=heath` | broussaille | 3 m |
| `landuse=vineyard` | vigne | 2 m |
| `building=*` | bâti | `height`, sinon `levels`×3+2, sinon 8 m |

**Ces hauteurs sont des hypothèses.** OSM ne renseigne quasiment jamais la
hauteur de la végétation, et seuls 8 % des bâtiments portent une hauteur —
mesuré sur le corridor de test. Une « forêt » à 20 m peut être un taillis de
5 m. L'interface le dit à l'endroit où on règle l'option.

#### Respect des quotas Overpass

Overpass n'accorde que **deux créneaux simultanés** et refuse par HTTP 429 dès
qu'ils sont pris. Enchaîner les tuiles sans espacement — ce que faisait la
première version — les épuise immédiatement.

Trois mesures, dans l'ordre d'efficacité :

1. **Espacement de 1,5 s** entre requêtes. C'est ce qui évite le refus ;
   réessayer après coup ne fait que le reproduire.
2. **Attente du délai annoncé.** L'endpoint `/api/status` publie le nombre de
   créneaux libres et la seconde exacte de libération (`Slot available after:
   …, in 16 seconds`). On l'interroge plutôt que de deviner un temps d'attente,
   et l'attente est affichée à l'utilisateur au lieu de ressembler à un blocage.
3. **Tuiles dimensionnées par couche** : 0,12° pour la végétation (légère — une
   boîte de 15 km ne pèse que 6 Mo), 0,04° pour le bâti (17 Mo par corridor).
   Moins de requêtes vaut mieux que des requêtes plus petites, puisque c'est la
   fréquence qui déclenche le refus.

Mesure après correction, cache vide : 9 requêtes au total pour un balayage
complet plus une enveloppe de portée de 8 km, **aucun refus**.

#### Rastérisation au fil de l'eau et cache par tuile

Les volumes interdisent de garder les polygones en mémoire : 17 Mo de bâtiments
pour un seul corridor. Chaque tuile est donc téléchargée, **dessinée
immédiatement** sur un canvas aux dimensions de la grille MNT, puis libérée. La
mémoire reste à `nx·ny` octets quel que soit le volume cumulé.

Deux niveaux de cache dans IndexedDB : le **raster** final par grille, et la
géométrie de **chaque tuile** séparément. Ce second niveau est celui qui rend
l'option supportable — changer le rayon de recherche ne retélécharge que les
tuiles nouvelles. Les coordonnées y tiennent en Float32 : à 45° de latitude
cela vaut 0,3 m de précision, très en dessous de la maille de 50 m, pour deux
fois moins de volume.

Mesure : second balayage identique en **1,2 s, zéro requête réseau**.

Les identifiants de classe sont espacés de 40 : le remplissage de polygones
sur un canvas est anticrénelé, et des identifiants consécutifs seraient
confondus sur les pixels de bordure. Avec cet écart, l'arrondi retrouve la
bonne classe partout sauf sur un liseré d'une maille.

### Marges statistiques

Deux liaisons géométriquement identiques ne donnent pas le même niveau reçu :
le champ varie de façon log-normale d'un emplacement à l'autre. ITU-R P.1812
retient environ 5,5 dB sur terre entre 100 MHz et 3 GHz ; la dispersion monte
vers 8 dB sous couvert dense. L'application interpole entre les deux selon la
végétation traversée et publie deux chiffres :

```
marge médiane  = résultat déterministe
marge à 95 %   = médiane − 1,6449 · σ
```

**Le verdict et le classement se prononcent sur la marge à 95 %**, pas sur la
médiane : c'est la seule des deux sur laquelle on puisse décider. Annoncer
« +12,4 dB » sans dispersion donnait une fausse impression de précision.

### Chaîne de relais

Un seul relais ne suffit pas toujours. L'application construit donc une chaîne
**TX → R1 → … → Rn → RX**, en n'ajoutant des relais que tant que la liaison ne
passe pas.

L'algorithme est une insertion dans le maillon faible :

1. évaluer tous les bonds de la chaîne courante (au départ, la liaison directe) ;
2. si le plus faible tient l'objectif de marge à 95 %, s'arrêter ;
3. sinon, chercher le meilleur relais **sur ce bond précis** et l'y insérer ;
4. recommencer, jusqu'à l'objectif ou au plafond de relais.

Deux garde-fous :

- un relais qui n'améliorerait pas le maillon faible d'au moins 0,5 dB est
  **refusé**, et la chaîne s'arrête. Mieux vaut une chaîne courte qui échoue
  franchement qu'une chaîne longue qui prétend passer ;
- le panneau indique toujours *pourquoi* la construction s'est arrêtée :
  objectif atteint, plafond de relais, aucun candidat, ou absence de gain.

Point de conception qui rend l'opération gratuite : le corridor TX–RX est une
capsule **convexe**, donc tout sous-segment y est inclus. Les relais
supplémentaires sont cherchés dans la grille MNT déjà téléchargée — approfondir
une chaîne ne déclenche **aucune requête réseau**.

Le classement « meilleurs emplacements pour un relais unique » reste affiché
séparément : il répond à une autre question, celle du meilleur compromis quand
un second relais n'est pas envisageable.

Les étiquettes R1, R2… suivent l'ordre géographique le long du trajet, alors
que le journal de construction suit l'ordre d'ajout — un relais posé en premier
peut se retrouver étiqueté R2 si un autre vient ensuite se placer avant lui.
Le panneau le précise.

### Verdict de faisabilité

Chaque liaison reçoit une conclusion explicite, affichée en tête du bilan, dans
la colonne « Verdict » du classement, et reprise dans le PDF et le KML.

| Verdict | Condition | Lecture |
|---|---|---|
| **Liaison impossible** | médiane < 0 | Le signal arrive sous le seuil de sensibilité, et ce dès la valeur médiane. |
| **Sans visibilité directe** | dégagement < −100 % | Le relief coupe la ligne de visée de plus d'un rayon de Fresnel. |
| **Liaison à la limite** | marge à 95 % < 0 | Passe au médian, pas de façon fiable : tiendra certains jours et pas d'autres. |
| **Possible mais fragile** | 95 % < objectif, ou dégagement < 60 % | Aucune réserve pour ce que le modèle ignore. |
| **Liaison possible** | 95 % ≥ objectif et dégagement ≥ 60 % | Bilan et géométrie corrects. |

« Sans visibilité directe » mérite une explication. Quand le relief dépasse
franchement la ligne de visée, le signal ne passe plus que par diffraction. La
construction de Deygout tient compte de plusieurs arêtes, mais un relief massif
reste modélisé comme une succession de lames de couteau : la perte réelle
dépend de la forme des sommets et de la nature du sol, que le MNT ne dit pas.
C'est le seul cas où l'application refuse de conclure et renvoie explicitement
à un essai terrain.

Chaque verdict affiche la médiane, la marge à 95 % et la dispersion retenue.
La perte attribuée à la végétation est isolée dans le bilan, avec la
profondeur de couvert traversée.

### Pénalité de dégagement

`J(v)` est quasi nul entre 0 et 60 % de dégagement — une liaison à 20 % de
Fresnel dégagée s'y verrait attribuer la même note qu'une liaison parfaitement
dégagée. Une pénalité linéaire est donc retranchée à la marge de chaque bond
pour le **classement uniquement** : 0 dB à 60 %, jusqu'à 6 dB à 0 %.

Conséquence visible : deux sites de marge brute identique peuvent être classés
différemment. Survoler une ligne du tableau affiche le détail du score.

### Cohérence classement / profils

Le worker et l'affichage détaillé utilisent la **même** fonction
`profileSampleCount()`. Un échantillonnage plus fin dans le détail que dans le
balayage ferait apparaître des obstacles que le classement avait manqués, et
le tableau contredirait le graphique.

### Portée du relais

Un cercle de rayon constant ne dirait rien du relief. L'application trace une
**enveloppe de portée** : un rayon est tiré tous les 5° (36, 72 ou 144
directions au choix), le terrain est échantillonné le long de chacun, et le
bilan de liaison est recalculé à chaque distance jusqu'à ce qu'il décroche.

Deux contours sont tracés :

- **zone fiable** (vert plein) — la marge souhaitée est tenue ;
- **limite de réception** (orange pointillé) — marge nulle, au-delà plus rien
  n'arrive.

Un troisième cercle gris, en pointillé fin, marque l'**horizon radio**
`d(km) = 4,12·(√h₁ + √h₂)` : la limite purement géométrique des deux antennes,
sans aucun relief. L'écart entre ce cercle et l'enveloppe est exactement ce que
coûte le terrain.

Le panneau affiche aussi la **portée en espace libre**, obtenue en inversant
la FSPL. Sur LoRa elle dépasse le millier de kilomètres — elle n'est là que
pour rappeler que la portée n'est jamais limitée par la puissance, mais par la
géométrie.

Deux limites assumées :

- Chaque rayon s'arrête à la **première rupture durable** du bilan (deux
  échantillons consécutifs sous le seuil, pour absorber les artefacts du MNT).
  Un polygone ne sait représenter qu'une région étoilée : inclure une poche de
  réception isolée derrière une zone d'ombre reviendrait à colorier l'ombre.
  Des poches peuvent donc exister au-delà sans figurer sur la carte.
- Si la zone atteint le rayon d'exploration dans plusieurs directions, un
  avertissement le signale : la portée affichée est alors bridée par le
  paramètre, pas par le terrain.

Le calcul télécharge son propre relief, bien au-delà du corridor TX–RX. Il est
donc déclenché explicitement, avec son coût affiché à l'avance : 72 directions
sur 15 km représentent ~10 700 points, 54 requêtes IGN, environ 25 secondes.
Le calcul lui-même prend une dizaine de millisecondes.

La commande est le bouton **« Calculer la portée »** en haut à gauche de la
carte, qui affiche sa progression et sert ensuite à afficher ou masquer
l'enveloppe. Le panneau « Portée du relais », sous le comparateur de hauteurs,
donne les réglages et les chiffres détaillés.

**Attention à l'échelle.** L'enveloppe fait couramment 30 à 50 km de large,
soit bien plus que le cadrage du corridor TX–RX. Sans recadrage elle déborde
entièrement de la vue et se lit comme une teinte de fond plutôt que comme une
forme — la carte se recadre donc automatiquement dessus à la fin du calcul.

### Corridor de recherche

La zone téléchargée est une capsule (segment TX–RX dilaté du rayon). C'est un
convexe : tout trajet TX → candidat → RX y reste inclus, ce qui garantit
qu'aucun profil ne sort des données disponibles.

---

## Cache

Les altitudes sont mises en cache en `localStorage`, par tuiles de 0,01°
(~1,1 km), indexées sur le fournisseur réellement interrogé. Un second
balayage sur la même zone est instantané. En cas de dépassement de quota, la
moitié des tuiles les plus volumineuses est purgée automatiquement.

Volume typique : liaison de 5,3 km, rayon 500 m, pas 50 m → 2 864 points,
15 requêtes IGN, environ 4 secondes. Le calcul des 2 400 mailles candidates
prend ensuite ~60 ms dans le Web Worker.

---

## Saisie des deux sites

Le bouton **« Placer TX + RX »**, en haut à gauche de la carte, enchaîne les
deux placements : premier clic = émetteur, second clic = récepteur, puis la
carte se recadre sur la liaison. `Échap` annule à tout moment.

Les autres méthodes restent disponibles : saisie des coordonnées, recherche
d'adresse (Nominatim), bouton « Carte » propre à chaque site, et
glisser-déposer des marqueurs.

Une fois un balayage effectué, un clic libre sur la carte évalue
l'emplacement pointé — pratique pour tester un pylône ou un toit précis que la
grille n'a pas retenu.

## Profils matériel

Le sélecteur **Matériel** renseigne d'un geste la puissance, le gain d'antenne
et la perte de câble des trois nœuds.

| Profil | Puissance | Gain | Bande |
|---|---|---|---|
| Seeed XIAO nRF52840 + Wio-SX1262 | 22 dBm * | 2 dBi * | 862–930 MHz |
| Module SX1262 générique | 22 dBm | 2 dBi * | 150–960 MHz |
| Module SX1276 / SX1278 générique | 20 dBm | 2 dBi * | 137–1020 MHz |

`*` **valeur estimée, à vérifier.** La description du kit Seeed ne donne
aucune puissance d'émission : les 22 dBm viennent de la fiche du SX1262
(amplificateur haute puissance), et le firmware Meshtastic applique en plus un
plafond régional. Le gain de l'antenne fournie n'est pas documenté non plus ;
2 dBi est une estimation prudente pour une antenne de cette taille. Ces deux
valeurs sont signalées par un astérisque dans l'interface.

Conséquence à connaître pour ce kit en Europe : à 22 dBm avec 2 dBi,
l'ERP atteint **21,9 dBm**, soit 7,9 dB au-dessus de la limite de 14 dBm sur
la majeure partie de la bande 868, et encore 1,9 dB au-dessus des 20 dBm
tolérés sur la sous-bande g4 (869,4–869,65 MHz). L'application le signale en
rouge dès la sélection du profil.

Modifier manuellement une puissance ou un gain fait repasser le sélecteur en
« Personnalisé » : afficher un nom de matériel dont les caractéristiques ont
été changées serait trompeur. En revanche, changer de fréquence ou de preset
LoRa conserve le profil — ce sont des réglages firmware, pas du matériel.

Ajouter un modèle se fait en une entrée dans `DEVICES`, dans
[`src/lib/radio.js`](src/lib/radio.js).

## Cap d'antenne

Chaque site affiche le **cap exact** (azimut, 0–360°) à viser pour pointer une
antenne directionnelle vers l'autre extrémité du bond : TX vers RX en liaison
directe, TX vers le premier relais et RX vers le dernier s'il y a une chaîne,
et chaque relais intermédiaire vers ses deux voisins s'il est lui-même
directionnel.

Calculé par [`bearing()`](src/lib/geo.js) — un cap **orthodromique exact** sur
le grand cercle, pas une approximation plane ni une simple réciproque à 180° :
vérifié numériquement, l'écart à 180° entre un cap et son retour correspond à
l'excès sphérique réel, pas à une erreur d'arrondi. Affiché en degrés avec le
point cardinal le plus proche sur 16 directions (`134° (SE)`), avant même le
premier balayage (case « Cap TX vers RX »), dans le résumé d'un relais unique,
dans le tableau et la liste de la chaîne de relais, en infobulle sur chaque
marqueur de la carte, et dans les trois exports.

**C'est un azimut géographique (nord vrai), pas magnétique.** Une boussole
lit le nord magnétique, qui diffère du nord vrai de plusieurs degrés selon le
lieu (déclinaison) : corrigez-en, ou visez avec le mode « nord vrai » d'un GPS
ou d'une boussole de téléphone. L'interface et les exports le rappellent à
chaque affichage du cap.

Un vrai bug trouvé et corrigé en vérifiant le rendu réel du PDF plutôt que la
seule présence du texte : les flèches Unicode (`←` `→`) utilisées pour noter
« cap vers » dans le rapport forçaient jsPDF à basculer ces lignes en
encodage Identity-H (2 octets par caractère), un mode que les polices
standard de PDF (Helvetica Type 1) ne savent pas dessiner — ces flèches
n'ont aucun glyphe dans ces polices. Remplacées par du texte simple
(« cap vers TX », « cap vers RX »), en `us-ascii` intégral, sans ambiguïté
d'encodage. Le signe degré (`°`), lui, est resté : vérifié par inspection
directe de l'octet écrit dans le flux PDF (`0xB0`, exactement le point
WinAnsi du signe degré) plutôt que sur une extraction de texte naïve — lire
un PDF binaire comme de l'UTF-8 corrompt n'importe quel octet non-ASCII
valide sans que le PDF réel soit en cause.

## Sorties

- **Carte** — fonds OpenTopoMap, Plan IGN, photo aérienne IGN, OSM. Carte de
  chaleur de la qualité, candidats alternatifs, segments colorés selon la
  marge, clic libre pour forcer un emplacement.
- **Classement** des meilleurs sites : coordonnées, altitude, mât retenu,
  marge par bond, marge globale, dégagement de Fresnel minimal, distance à la
  route la plus proche (Overpass).
- **Profils d'élévation** par bond : relief corrigé 4/3, ligne de visée,
  enveloppe de Fresnel, seuil 60 %, repère sur l'obstacle dominant.
- **Enveloppe de portée** du relais sur le relief réel, avec zone fiable,
  limite de réception et cercle d'horizon radio en référence.
- **Comparateur de hauteurs** de 2 à 20 m, avec la hauteur minimale atteignant
  la marge souhaitée — la réponse à « faut-il investir dans un mât ? ».
- **Exports** GPX, KML et rapport PDF (~140 Ko, verdict en première page).

### Fiabilité du téléchargement

Un clic sur une ancre `download` **déclenché par script** est refusé par
plusieurs navigateurs dès qu'il ne se rattache plus clairement à une action
humaine : blocage des téléchargements automatiques, ou simple perte du geste
utilisateur après un `await` — ce qui était le cas du PDF, dont la génération
attendait le chargement de jsPDF. L'échec est silencieux : aucune erreur,
aucun fichier.

L'application ne déclenche donc **aucun clic par script**. Les fichiers sont
construits dès l'ouverture du menu et les trois entrées sont de vraies ancres
`<a download href="blob:…">`, avec leur taille affichée, sur lesquelles
l'utilisateur clique lui-même. C'est le seul chemin de téléchargement qu'aucun
navigateur ne bloque.

GPX et KML sont instantanés ; le PDF demande environ une seconde, pendant
laquelle son entrée affiche sa préparation. jsPDF est préchargé dès qu'un
résultat existe, ce qui rend le délai généralement imperceptible. Toute erreur
de préparation est remontée dans l'interface au lieu de disparaître dans la
console.

Le menu lui-même est rendu dans un **portail** attaché à `document.body`, en
position fixe. Rendu à l'intérieur de son bouton, un menu absolu dépend du
`overflow` et du contexte d'empilement de tous ses ancêtres : il suffit d'un
conteneur qui rogne pour qu'il devienne invisible sans qu'aucune erreur ne soit
levée. La fermeture passe par un voile plein écran plutôt qu'un écouteur
`mousedown` sur le document — pas d'ordre d'événements à démêler.

Le bouton n'est **jamais désactivé** : quand il n'y a rien à exporter, le menu
s'ouvre et le dit. Un bouton inerte est indiscernable d'une panne.

---

## Limites du modèle

Sont pris en compte : le relief, la courbure terrestre (k = 4/3), la zone de
Fresnel, la diffraction sur plusieurs arêtes, la végétation et le bâti issus
d'OpenStreetMap, et la dispersion d'un emplacement à l'autre.

Restent hors du modèle, ou incertains :

- les **hauteurs de couvert**, largement supposées (voir plus haut) ;
- la **complétude d'OpenStreetMap** : un bois non cartographié n'existe pas
  pour le calcul ;
- la **sensibilité récepteur**, issue d'une table figée — sans facteur de bruit
  ni bruit radio ambiant, qui relève le seuil réel de 10 à 15 dB en urbain ;
- les **réflexions sur le sol** et la diffraction sur terrain lisse au-delà de
  l'horizon, approximée par le bombement et une arête ;
- la **variabilité temporelle** : pluie, feuillaison, conduits troposphériques.

La détection des plans d'eau est **heuristique** : un voisinage 3×3
rigoureusement plat, ou une altitude nulle. Une plaine très plane peut être
écartée à tort.

**Toute simulation doit être confirmée par un test terrain avec deux nœuds
réels.**

---

## Pile technique

React 18 + Vite 6, Tailwind 3, Leaflet 1.9, Chart.js 4, jsPDF (chargé à la
demande). Calculs dans un Web Worker ES module. Cache MNT en localStorage,
rasters de couverture du sol en IndexedDB. Aucune clé d'API.
