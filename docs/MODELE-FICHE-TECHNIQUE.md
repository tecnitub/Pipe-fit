# Modèle de fiche technique Pipe-Fit (Études)

Ce modèle sert à **réécrire une fiche technique de fabricant** (PDF, catalogue, fiche de sélection) dans un format que l'application Études lit à coup sûr. Une fois la fiche réécrite :

- dans le calcul concerné, bouton **📄 Fiche technique** (ou **📄 Charger** dans le tableau des fiches de l'installation) ;
- ouvrir **« 📋 Coller une fiche au format Pipe-Fit »**, coller le texte, puis **« Lire le texte collé »** ;
- ou enregistrer le texte dans un fichier `.txt` et le choisir comme un PDF.

Les valeurs reconnues sont proposées une par une avant d'être reprises dans le calcul.

---

## Consigne à donner à Claude (dans une autre conversation)

Copier le bloc ci-dessous, puis joindre la fiche du fabricant (PDF ou capture) :

```text
Tu vas réécrire la fiche technique jointe au format « fiche Pipe-Fit ».
Règles strictes :
1. Une seule valeur par ligne, sous la forme « Libellé : valeur unité ».
2. Reprends EXACTEMENT les libellés du modèle ci-dessous pour le type d'équipement concerné (même orthographe).
3. Écris toujours l'unité après le nombre (kW, W, m3/h, mCE, kPa, Pa, °C, %, L, bar, dB(A), L/s).
4. Virgule ou point décimal acceptés ; pas de séparateur de milliers (écris 6000 et non 6 000).
5. Si une valeur n'est pas dans la fiche, SUPPRIME la ligne (n'invente rien, n'écris pas « NC »).
6. Les trois premières lignes sont toujours « Type : … » (CTA, Pompe, Terminal, Générateur, Vase d'expansion, Ballon ECS, Bouche, Vanne…, Appareil sanitaire), « Fabricant : … » et « Référence : … ».
7. Pour les courbes (pompe) et abaques (vanne), écris les points sur une seule ligne : « x:y ; x:y ; x:y ».
8. Réponds uniquement avec le texte de la fiche, sans commentaire.
Type d'équipement : [CTA | Pompe | Terminal | Générateur | Vase | Ballon ECS | Bouche | Vanne / robinetterie | Appareil sanitaire]
[coller ici la section du modèle correspondant au type]
```

---

## 1. Centrale de traitement d'air (CTA)

Calcul **Centrale de traitement d'air**, et schéma aéraulique relié. Les puissances de batteries passent la CTA en « puissances saisies » (sans calcul depuis les conditions extérieures).

<!-- fiche: cta -->
```text
Type : CTA
Fabricant : Exemplair
Référence : CTA-DF 4500
Débit soufflage : 4500 m3/h
Débit reprise : 4300 m3/h
Efficacité du récupérateur à plaques : 78 %
Batterie chaude : régime 70/50 °C
Batterie chaude : puissance 32 kW
Batterie chaude : perte de charge côté eau 12 kPa
Batterie chaude : perte de charge côté air 55 Pa
Batterie froide : régime 7/12 °C
Batterie froide : puissance 41 kW
Batterie froide : perte de charge côté eau 28 kPa
Batterie froide : perte de charge côté air 110 Pa
Filtre air neuf ePM1 : perte de charge 140 Pa
Filtre reprise ePM10 : perte de charge 90 Pa
Récupérateur à plaques : perte de charge 160 Pa
Pression disponible soufflage : 300 Pa
Pression disponible reprise : 250 Pa
Ventilateur soufflage : puissance absorbée 2,4 kW
Ventilateur reprise : puissance absorbée 1,8 kW
Rendement des ventilateurs : 62 %
SFP : 1700 W/(m3/s)
Puissance acoustique soufflage : 78 dB(A)
Puissance acoustique reprise : 74 dB(A)
Batterie électrique : 9 kW
```

Optionnel : `Température de soufflage hiver : 20 °C`, `Température de soufflage été : 16 °C`, `Humidificateur vapeur` (ligne seule si présent), `Sans batterie froide` (ligne seule si la CTA n'en a pas).

---

## 2. Pompe ou circulateur

Calculs **Réseau / pompe**, **Réseau arborescent**, pompes du **Schéma de principe** (pompes retenues par circuit) et terminaux de type pompe.

<!-- fiche: pompe -->
```text
Type : Pompe
Fabricant : Exemplair
Référence : CX 40-8
Point de fonctionnement : 4,2 m3/h à 6,5 mCE
Débit maximal : 9 m3/h
Hauteur maximale : 9,5 mCE
Puissance absorbée P1 : 320 W
Rendement de la pompe : 48 %
Courbe Q:H (m3/h : mCE) : 0:9,5 ; 2:9 ; 4:7,8 ; 6:6 ; 8:3,5
```

La courbe peut aussi porter la puissance absorbée : `Courbe Q:H (m3/h : mCE) : 0:9,5:150 ; 2:9:220 ; …` (troisième valeur en W).

---

## 3. Terminal (cassette, ventilo-convecteur, gainable, aérotherme, poutre…)

Calcul **Terminaux** : une fiche par modèle, reprise sur la ligne choisie.

<!-- fiche: terminal -->
```text
Type : Terminal (cassette)
Fabricant : Exemplair
Référence : CK-36
Puissance chaud : 3,2 kW
Puissance froid : 3,6 kW
Puissance électrique absorbée du ventilateur : 45 W
Batterie électrique : 1,5 kW
Perte de charge côté eau chaud : 18 kPa
Perte de charge côté eau froid : 22 kPa
Débit d'air : 650 m3/h
Kvs vanne : 1,6
Alimentation : 230 V mono
```

---

## 4. Générateur (chaudière, PAC, groupe froid)

Calcul **Schéma de principe** (production).

<!-- fiche: generateur -->
```text
Type : Générateur (pompe à chaleur)
Fabricant : Exemplair
Référence : PAC-AE 150
Puissance calorifique nominale : 150 kW
Puissance frigorifique nominale : 130 kW
Puissance électrique absorbée : 38 kW
```

---

## 5. Vase d'expansion

Calcul **Vase d'expansion**.

<!-- fiche: vase -->
```text
Type : Vase d'expansion
Fabricant : Exemplair
Référence : VX 80
Volume nominal : 80 L
Pression de gonflage : 1,5 bar
Pression maximale de service : 6 bar
```

---

## 6. Ballon ou échangeur d'ECS

Calcul **Production d'eau chaude sanitaire**.

<!-- fiche: ecs -->
```text
Type : Ballon ECS
Fabricant : Exemplair
Référence : BS 500
Volume nominal : 500 L
Puissance de l'échangeur : 45 kW
Pression maximale de service : 10 bar
```

---

## 7. Bouche, diffuseur, grille

Schéma aéraulique en arborescence (une fiche par bouche).

<!-- fiche: bouche -->
```text
Type : Bouche (diffuseur plafonnier)
Fabricant : Exemplair
Référence : DF4-200
Débit : 300 m3/h
Perte de charge : 25 Pa
Puissance acoustique Lw : 32 dB(A)
```

---

## 8. Vanne et robinetterie (isolement, équilibrage, clapet, filtre, compteur…)

Robinetterie du **Schéma de principe** et du **Réseau arborescent**. Pour une vanne d'équilibrage, l'abaque donne le préréglage exact.

<!-- fiche: robinet -->
```text
Type : Vanne d'équilibrage
Fabricant : Exemplair
Référence : EQ-40
DN 40
Kvs : 25,9
Nombre de tours : 4
Abaque (tours : Kv) : 0,5:2,1 ; 1:4,3 ; 1,5:6,8 ; 2:9,6 ; 2,5:13 ; 3:16,8 ; 3,5:21 ; 4:25,9
```

Organe sans Kv (filtre, clapet…) : remplacer les lignes Kvs, tours et abaque par `Perte de charge : 6 kPa` (au débit nominal).

---

## 9. Appareil sanitaire (robinetterie, WC, douche…)

Calcul **Eau froide et eau chaude sanitaires** (une fiche par point de puisage).

<!-- fiche: sanitaire -->
```text
Type : Appareil sanitaire (mitigeur lavabo)
Fabricant : Exemplair
Référence : MT-200
Débit : 0,15 l/s
Pression minimale : 1,5 bar
```

Le débit peut aussi s'écrire en L/min (`Débit : 9 l/min`).
