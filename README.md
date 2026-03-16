# Accuracy Profile Add-in Excel

## Add-in Excel professionnel — Validation analytique par Profil d'Exactitude

Basé sur :
- **Feinberg M. (2010)** — Interprétation du profil d'exactitude
- **ISO 5725-2 (2002)** — Justesse et fidélité des méthodes de mesure
- **Mee R.W. (1984)**   — Intervalles de tolérance β-expectation
- **ICH Q2(R1)**        — Validation des méthodes analytiques (pharmaceutique)

---

## Fonctionnalités

| Module            | Description |
|-------------------|-------------|
| **Données**       | Import Excel, génération du plan (K×I×J), aperçu |
| **Calculs**       | Modèles d'étalonnage (linéaire/origine), critères ISO 5725-2, intervalles β-expectation Mee 1984 |
| **Profil**        | Graphique complet avec LTB/LTH et limites d'acceptabilité, verdict de validation |
| **IA Gemini**     | Diagnostic, interprétation, recommandations, chat analytique |
| **Rapport**       | HTML téléchargeable + export Excel multi-onglets |

---

## Installation

### Prérequis
- Node.js ≥ 18
- Microsoft Excel (Desktop ou Online)

### 1. Dépendances
```bash
npm install
```

### 2. Certificats HTTPS (une fois)
```bash
npx office-addin-dev-certs install --machine
```

### 3. Démarrer
```bash
npm start
```

### 4. Charger dans Excel
**Fichier → Options → Centre de gestion de la confidentialité → Catalogues de compléments → Ajouter** :
```
https://localhost:3000/manifest.xml
```
Puis **Insertion → Mes compléments → Accuracy Profile**.

---

## Backend Python (optionnel)

Pour les grands jeux de données (>500 mesures) :

```bash
cd src/backend
pip install -r requirements.txt
python main.py
```
API disponible sur `http://127.0.0.1:8000/docs`.

---

## Déploiement GitHub Pages

```bash
npm run build
git add . && git commit -m "Accuracy Profile v2.0"
git remote add origin https://github.com/miensie/Accuracy.git
git push -u origin main
```
Activer GitHub Pages sur `/dist` dans les Settings.

---

## Structure du projet

```
accuracy-profile-addin/
├── manifest.xml
├── package.json
├── webpack.config.js
├── src/
│   ├── taskpane/
│   │   ├── taskpane.html     — Interface utilisateur (5 panneaux)
│   │   ├── taskpane.css      — Thème instrument analytique
│   │   └── taskpane.js       — Orchestrateur principal
│   ├── modules/
│   │   ├── statistics.js     — Calculs ISO 5725-2 / Mee 1984 (tQuantile, β-expectation)
│   │   ├── excelBridge.js    — Interface Office.js / Excel
│   │   ├── geminiAI.js       — Interprétation IA spécialisée analytique
│   │   ├── demoData.js       — Données Feinberg (2010) — vitamine B3 HPLC
│   │   └── reportGenerator.js— Rapport HTML professionnel
│   ├── backend/
│   │   ├── main.py           — API FastAPI (Python + SciPy)
│   │   └── requirements.txt
│   └── commands/
│       └── commands.js
└── README.md
```

---

## Utilisation rapide

1. Ouvrir l'add-in → **onglet Données**
2. Cliquer **▶ Charger Feinberg (2010)** pour tester
3. Le profil d'exactitude s'affiche automatiquement
4. Aller dans **IA** → configurer la clé Gemini → **Diagnostic complet**
5. **Rapport** → Télécharger en HTML

## Références

- Feinberg M. (2007). *Validation of analytical methods based on accuracy profiles*. J. Chromatogr. A, 1158, 174–183.
- ISO 5725-2 (2002). *Accuracy (trueness and precision) of measurement methods and results — Part 2*.
- Mee R.W. (1984). *β-expectation and β-content tolerance limits for balanced one-way ANOVA random model*. Technometrics, 26(3), 251–254.
- ICH Q2(R1) (2005). *Validation of Analytical Procedures: Text and Methodology*.
