# Accuracy Profile API v2 — Documentation complète

Backend industriel Python pour la **validation analytique du profil d'exactitude**.

---

## 🏗️ Structure du projet

```
backend/
├── main.py                        ← Point d'entrée FastAPI
├── requirements.txt               ← Dépendances Python
│
├── models/
│   └── schemas.py                 ← Modèles Pydantic (I/O typé strict)
│
├── routes/
│   └── accuracy.py                ← Tous les endpoints REST
│
├── services/
│   ├── accuracy_profile.py        ← Orchestrateur (pipeline complet)
│   ├── statistics.py              ← Calculs ISO 5725-2, Mee, Grubbs
│   ├── validation.py              ← Conformité ICH Q2, ISO, SFSTP
│   └── ai_interpretation.py      ← Moteur de règles + LLM (Gemini/Claude)
│
└── utils/
    └── helpers.py                 ← Graphiques matplotlib/plotly, PDF, formatage
```

---

## ⚙️ Installation

```bash
# 1. Cloner / copier le projet
cd backend

# 2. Créer un environnement virtuel
python -m venv .venv
source .venv/bin/activate        # Linux/Mac
.venv\Scripts\activate           # Windows

# 3. Installer les dépendances
pip install -r requirements.txt

# 4. Lancer le serveur
python main.py
# ou en mode développement avec rechargement automatique :
uvicorn main:app --reload --port 8000
```

L'API est disponible sur **http://localhost:8000**  
Documentation interactive : **http://localhost:8000/docs**

---

## 📡 Endpoints

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| `POST` | `/accuracy-profile` | **Analyse complète** (endpoint principal) |
| `POST` | `/api/simple` | Format simplifié `{concentration, replicate, measured, reference}` |
| `POST` | `/api/analyze` | Alias rétrocompatibilité |
| `POST` | `/api/grubbs` | Test de Grubbs seul |
| `POST` | `/api/calibration` | Modèles d'étalonnage seuls |
| `POST` | `/api/interpret` | Interprétation IA (règles ou LLM) |
| `POST` | `/api/chat` | Assistant analytique contextuel |
| `POST` | `/api/report/pdf` | Génération PDF |
| `GET`  | `/api/health` | Santé du service |
| `GET`  | `/api/norms` | Critères normatifs (ISO, ICH, SFSTP) |

---

## 📦 Format d'entrée — `POST /accuracy-profile`

### Méthode indirecte (avec étalonnage)

```json
{
  "planValidation": [
    {"niveau": "A", "serie": "Jour 1", "rep": 1, "xRef": 0.40, "yResponse": 22.6},
    {"niveau": "A", "serie": "Jour 1", "rep": 2, "xRef": 0.40, "yResponse": 22.1},
    {"niveau": "A", "serie": "Jour 1", "rep": 3, "xRef": 0.40, "yResponse": 22.4},
    {"niveau": "A", "serie": "Jour 2", "rep": 1, "xRef": 0.40, "yResponse": 23.3},
    {"niveau": "A", "serie": "Jour 2", "rep": 2, "xRef": 0.40, "yResponse": 24.1},
    {"niveau": "A", "serie": "Jour 2", "rep": 3, "xRef": 0.40, "yResponse": 23.9},
    {"niveau": "A", "serie": "Jour 3", "rep": 1, "xRef": 0.40, "yResponse": 23.8},
    {"niveau": "A", "serie": "Jour 3", "rep": 2, "xRef": 0.40, "yResponse": 23.6},
    {"niveau": "A", "serie": "Jour 3", "rep": 3, "xRef": 0.40, "yResponse": 23.5},
    {"niveau": "B", "serie": "Jour 1", "rep": 1, "xRef": 2.0,  "yResponse": 135.0},
    {"niveau": "B", "serie": "Jour 2", "rep": 1, "xRef": 2.0,  "yResponse": 137.6}
  ],
  "planEtalonnage": [
    {"serie": "Jour 1", "niveau": "Bas",  "rep": 1, "xEtalon": 0.4, "yResponse": 22.7},
    {"serie": "Jour 1", "niveau": "Haut", "rep": 1, "xEtalon": 4.0, "yResponse": 281.6},
    {"serie": "Jour 2", "niveau": "Bas",  "rep": 1, "xEtalon": 0.4, "yResponse": 22.9},
    {"serie": "Jour 2", "niveau": "Haut", "rep": 1, "xEtalon": 4.0, "yResponse": 275.3}
  ],
  "config": {
    "methode":    "Dosage nicotinamide HPLC",
    "materiau":   "Nicotinamide",
    "unite":      "mg/L",
    "methodType": "indirect",
    "modelType":  "linear",
    "beta":       0.80,
    "lambdaVal":  0.10,
    "alpha":      0.05,
    "framework":  "iso5725"
  }
}
```

### Méthode directe (sans étalonnage)

```json
{
  "planValidation": [
    {"niveau": "N1", "serie": "Jour 1", "rep": 1, "xRef": 50.0, "yResponse": 49.82},
    {"niveau": "N1", "serie": "Jour 2", "rep": 1, "xRef": 50.0, "yResponse": 50.31},
    {"niveau": "N2", "serie": "Jour 1", "rep": 1, "xRef": 150.0,"yResponse": 149.45}
  ],
  "config": {
    "methodType": "direct",
    "beta":       0.80,
    "lambdaVal":  0.05
  }
}
```

### Format simplifié (`POST /api/simple`)

```json
{
  "data": [
    {"concentration": 1.0, "replicate": 1, "measured": 1.05, "reference": 1.00},
    {"concentration": 1.0, "replicate": 2, "measured": 0.98, "reference": 1.00},
    {"concentration": 2.0, "replicate": 1, "measured": 2.03, "reference": 2.00}
  ],
  "config": {"lambdaVal": 0.10, "beta": 0.80}
}
```

---

## 📤 Format de sortie

```json
{
  "status": "ok",
  "version": "2.0",

  "models": {
    "Jour 1": {"a0": 0.123, "a1": 68.45, "r2": 0.99987, "r": 0.99993, "n": 4, "modelType": "linear"},
    "Jour 2": {"a0": 0.245, "a1": 68.12, "r2": 0.99991, "r": 0.99996, "n": 4, "modelType": "linear"}
  },

  "statistics": {
    "global_z":        {"n": 9, "mean": 0.4012, "std": 0.0061, "cv": 1.52, "ci_low": 0.3965, "ci_high": 0.4059},
    "global_bias_pct": {"mean": 0.30, "std": 0.91}
  },

  "criteria": [
    {
      "niveau": "A", "xMean": 0.40, "zMean": 0.4012,
      "sr": 0.0031, "sB": 0.0045, "sFI": 0.0055,
      "cv": 1.37, "cvR": 0.77,
      "biasMoy": 0.0012, "bRel": 0.30, "recouvMoy": 100.30,
      "I": 3, "J": 3, "N": 9,
      "shapiro_p": 0.423, "shapiro_normal": true
    }
  ],

  "tolerances": [
    {
      "niveau": "A", "xMean": 0.40, "zMean": 0.4012,
      "recouvRel": 100.30,
      "sIT": 0.0078, "ktol": 1.895, "nu": 8, "R": 2.1,
      "ltbAbs": 0.3864, "lthAbs": 0.4160,
      "ltbRel": 96.60, "lthRel": 104.00,
      "laBasse": 90.0, "laHaute": 110.0,
      "accept": true, "errorTotal": 2.09
    }
  ],

  "outliers": [
    {
      "niveau": "A", "n": 9, "xMean": 0.40,
      "G": 1.412, "Gcrit": 2.215, "suspect": false,
      "mean": 0.4012, "std": 0.0055, "classification": "ok"
    }
  ],

  "normality": [
    {"niveau": "A", "stat": 0.9612, "p_value": 0.423, "normal": true}
  ],

  "homogeneity": {
    "levene":   {"test": "levene",   "stat": 0.312, "p_value": 0.734, "homogeneous": true},
    "bartlett": {"test": "bartlett", "stat": 0.198, "p_value": 0.905, "homogeneous": true},
    "conclusion": "Variances homogènes"
  },

  "validity": {
    "valid": true, "partial": false, "invalid": false,
    "nValid": 3, "nTotal": 3, "pct": 100.0,
    "validDomain": {"xMin": 0.40, "xMax": 4.00, "nLevels": 3, "levels": ["A","B","C"]}
  },

  "qualityScore": {
    "overall": 92.5, "justesse": 96.0, "fidelite": 89.0,
    "profil": 100.0, "normalite": 100.0, "homogeneite": 100.0,
    "label": "Excellent", "details": []
  },

  "interpretation": [
    {
      "severity": "success", "category": "Statut global",
      "message": "Méthode VALIDÉE sur les 3 niveaux. Tous les intervalles 80%-expectation respectent λ=±10%.",
      "value": 3, "threshold": 3
    }
  ],

  "normativeChecks": [
    {"category": "Fidélité intermédiaire ISO 5725", "severity": "success",
     "message": "Niveau A : sFI CV = 1.37% (seuil ≤ 10%)", "value": 1.37, "threshold": 10.0}
  ],

  "charts": {
    "profile":     "data:image/png;base64,iVBORw0K...",
    "calibration": "data:image/png;base64,iVBORw0K...",
    "anova":       "data:image/png;base64,iVBORw0K...",
    "format":      "png_base64"
  },

  "meta": {
    "timestamp": "2025-03-27T10:00:00Z",
    "duration_s": 0.312,
    "n_validation": 27,
    "n_etalonnage": 12
  }
}
```

---

## 🔧 Paramètres de requête optionnels

Pour `POST /accuracy-profile` :

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `charts` | bool | `true` | Générer les graphiques PNG base64 |
| `chart_format` | str | `png_base64` | `png_base64` ou `plotly_json` |
| `normative` | bool | `true` | Vérifications ISO/ICH/SFSTP |
| `interpret` | bool | `true` | Interprétation par moteur de règles |
| `api_key` | str | `null` | Clé Gemini ou Claude pour LLM |
| `provider` | str | `auto` | `gemini`, `claude` ou `auto` |

---

## 🐳 Déploiement Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV HOST=0.0.0.0
ENV PORT=8000
EXPOSE 8000
CMD ["python", "main.py"]
```

```bash
docker build -t accuracy-profile .
docker run -p 8000:8000 accuracy-profile
```

### Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `PORT` | `8000` | Port d'écoute |
| `HOST` | `0.0.0.0` | Adresse d'écoute |
| `DEBUG` | `false` | Mode debug (rechargement auto) |
| `CORS_ORIGINS` | `*` | Origines CORS autorisées (séparées par `,`) |

---

## ☁️ Déploiement Render.com

1. Créer un nouveau **Web Service** sur [render.com](https://render.com)
2. Connecter votre dépôt Git
3. Build command : `pip install -r requirements.txt`
4. Start command : `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Variables d'environnement : `DEBUG=false`, `CORS_ORIGINS=https://your-app.com`

---

## 🔌 Intégration avec l'Excel Add-in

Le code a été adapté pour supporter un mode "backend distant" (Render ou serveur Docker) avec champ URL et checkbox dans l'UI :

- `cfg-api-url` : URL du backend (ex : `https://mon-backend.onrender.com`)
- `cfg-use-backend` : cas d'utilisation du backend au lieu des calculs JS locaux

Les données sont postées vers :

`POST /accuracy-profile?charts=true&normative=true&interpret=true`

Payload :

```json
{
  "planValidation": [...],
  "planEtalonnage": [...],
  "config": {
    "methode": "...",
    "materiau": "...",
    "unite": "...",
    "methodType": "indirect",
    "modelType": "linear",
    "beta": 0.8,
    "lambdaVal": 0.1,
    "alpha": 0.05
  }
}
```

Le frontend conserve un fallback local en cas d’erreur API.

---

## 📊 Fonctionnalités scientifiques

### Statistiques implémentées
- Moyenne, médiane, écart-type, variance, IC 95%, erreur standard
- Skewness et kurtosis
- Coefficients de variation (répétabilité et fidélité intermédiaire)
- Taux de recouvrement et biais relatif

### Modèles d'étalonnage
- Régression linéaire (y = a₀ + a₁x) avec p-value, SE, RMSE
- Régression par l'origine (y = a₁x)
- Régression quadratique (y = a₀ + a₁x + a₂x²)
- Sélection automatique par critère AIC (`modelType: "auto"`)

### Profil d'exactitude
- Décomposition de la variance ISO 5725-2 : s²r (répétabilité) + s²B (inter-séries)
- Intervalles β-expectation selon **Mee (1984)** formalisés par **Feinberg (2010)**
- Calcul de k_tol via quantile t(ν) avec degrés de liberté Welch-Satterthwaite

### Tests statistiques
- **Test de Grubbs** (bilatéral, itératif) avec classification ok/suspect/aberrant
- **Test de Shapiro-Wilk** (normalité des résidus par niveau)
- **Test de Levene** (homogénéité des variances, robuste)
- **Test de Bartlett** (homogénéité, sensible à la normalité)
- **ANOVA à un facteur** avec η² et ω²

### Conformité normative
- **ISO 5725-2** : biais max 5%, CV répétabilité max 5%, CV FI max 10%
- **ICH Q2(R1)** : R² ≥ 0.9990, recouvrement 98–102%, CV ≤ 2%
- **SFSTP/Feinberg** : plan K≥3/I≥3/J≥2, β≥80%, λ recommandé ±10%

### IA et interprétation
- **Moteur de règles expert** (sans clé API) : 15+ règles paramétrables
- **Gemini 2.5 Flash** (API Google) : diagnostic complet, recommandations
- **Claude Sonnet** (API Anthropic) : interprétation normative avancée
- Génération automatique de recommandations pratiques

---

## 📄 Licence

MIT — Usage libre en laboratoire et en production.
