/**
 * ================================================================
 * statistics.js — Calculs statistiques pour le Profil d'Exactitude
 *
 * Implémente la méthodologie de :
 *  - Feinberg M. (2010) — Validation analytique par profil d'exactitude
 *  - ISO 5725-2 (2002)  — Justesse et fidélité des méthodes de mesure
 *  - Mee R.W. (1984)    — Intervalles de tolérance β-expectation
 *
 * Structures de données :
 *  planValidation : [{ niveau, serie, repetition, xRef, yResponse }]
 *  planEtalonnage : [{ niveau, serie, repetition, xEtalon, yResponse }]
 *  modeles        : [{ serie, a0, a1, r2 }]      (un par série)
 *  concentrations : [{ niveau, serie, rep, xRef, zRetrouvee, bAbs, bRel }]
 *  criteria       : [{ niveau, xMean, zMean, sr, sB, sFI, cv, biasMoy, recouvMoy }]
 *  tolerances     : [{ niveau, xMean, sIT, ktol, nu, ltbAbs, lthAbs, ltbRel, lthRel, accept }]
 * ================================================================
 */
"use strict";

// ─── Distribution t de Student ────────────────────────────────────────────────

/**
 * Quantile de la distribution t de Student (approximation Cornish-Fisher)
 * @param {number} nu - degrés de liberté
 * @param {number} p  - probabilité (ex: 0.90 pour t_{ν,0.90})
 */
function tQuantile(nu, p) {
  if (nu <= 0) return Infinity;
  if (p >= 1)  return Infinity;
  if (p <= 0)  return -Infinity;

  // Approximation par la méthode de Hill (1970) - précise pour nu >= 2
  // Pour nu = 1: Cauchy
  if (nu === 1) return Math.tan(Math.PI * (p - 0.5));

  // Normaliser p en z-score normal
  const z = normalQuantile(p);
  const g1 = (z ** 3 + z) / (4 * nu);
  const g2 = (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * nu ** 2);
  const g3 = (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * nu ** 3);
  return z + g1 + g2 + g3;
}

/**
 * Quantile de la distribution normale standard (Beasley & Springer, 1977)
 */
function normalQuantile(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return  Infinity;
  if (p === 0.5) return 0;

  const a = [2.515517, 0.802853, 0.010328];
  const b = [1.432788, 0.189269, 0.001308];
  const t = p < 0.5
    ? Math.sqrt(-2 * Math.log(p))
    : Math.sqrt(-2 * Math.log(1 - p));

  const num = a[0] + a[1] * t + a[2] * t ** 2;
  const den = 1 + b[0] * t + b[1] * t ** 2 + b[2] * t ** 3;
  const z   = t - num / den;
  return p < 0.5 ? -z : z;
}

// ─── Régressions linéaires ────────────────────────────────────────────────────

/**
 * Régression linéaire simple : Y = a1*X + a0 (moindres carrés)
 * @returns {{ a0, a1, r2, r }}
 */
function linearRegression(xArr, yArr) {
  const n  = xArr.length;
  if (n < 2) return { a0: 0, a1: 0, r2: 0, r: 0 };

  const sumX  = xArr.reduce((s, v) => s + v, 0);
  const sumY  = yArr.reduce((s, v) => s + v, 0);
  const sumXY = xArr.reduce((s, v, i) => s + v * yArr[i], 0);
  const sumX2 = xArr.reduce((s, v) => s + v ** 2, 0);
  const sumY2 = yArr.reduce((s, v) => s + v ** 2, 0);

  const denom = n * sumX2 - sumX ** 2;
  if (Math.abs(denom) < 1e-14) return { a0: 0, a1: sumY / sumX, r2: 1, r: 1 };

  const a1 = (n * sumXY - sumX * sumY) / denom;
  const a0 = (sumY - a1 * sumX) / n;

  const numR = n * sumXY - sumX * sumY;
  const denR = Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));
  const r    = Math.abs(denR) < 1e-14 ? 1 : numR / denR;
  const r2   = r ** 2;

  return { a0, a1, r2, r };
}

/**
 * Régression à l'origine : Y = a1*X
 */
function linearRegressionOrigin(xArr, yArr) {
  const sumXY = xArr.reduce((s, v, i) => s + v * yArr[i], 0);
  const sumX2 = xArr.reduce((s, v) => s + v ** 2, 0);
  const a1    = sumX2 > 0 ? sumXY / sumX2 : 0;

  const yPred = xArr.map(x => a1 * x);
  const ssTot = yArr.reduce((s, v) => s + (v - yArr.reduce((a, b) => a + b, 0) / yArr.length) ** 2, 0);
  const ssRes = yArr.reduce((s, v, i) => s + (v - yPred[i]) ** 2, 0);
  const r2    = ssTot > 0 ? 1 - ssRes / ssTot : 1;

  return { a0: 0, a1, r2, r: Math.sqrt(Math.max(0, r2)) };
}

// ─── Prédiction inverse ───────────────────────────────────────────────────────

/**
 * Calcule la concentration retrouvée par prédiction inverse (droite)
 * z = (Y - a0) / a1
 */
function inversePrediction(y, a0, a1) {
  if (Math.abs(a1) < 1e-14) return null;
  return (y - a0) / a1;
}

// ─── Calcul des modèles d'étalonnage (par série) ─────────────────────────────

/**
 * Calcule les modèles d'étalonnage pour chaque série.
 * @param {Array} planEtalonnage - [{ serie, xEtalon, yResponse }]
 * @param {string} modelType - "linear" | "origin"
 * @returns {Object} - { serie: { a0, a1, r2, r } }
 */
function computeCalibrationModels(planEtalonnage, modelType = "linear") {
  const bySerie = {};
  planEtalonnage.forEach(row => {
    if (!bySerie[row.serie]) bySerie[row.serie] = { x: [], y: [] };
    bySerie[row.serie].x.push(parseFloat(row.xEtalon));
    bySerie[row.serie].y.push(parseFloat(row.yResponse));
  });

  const models = {};
  Object.entries(bySerie).forEach(([serie, { x, y }]) => {
    models[serie] = modelType === "origin"
      ? linearRegressionOrigin(x, y)
      : linearRegression(x, y);
    models[serie].n  = x.length;
    models[serie].type = modelType;
  });

  return models;
}

// ─── Concentrations retrouvées ────────────────────────────────────────────────

/**
 * Calcule les concentrations retrouvées pour le plan de validation.
 * @param {Array}  planValidation - [{ niveau, serie, rep, xRef, yResponse }]
 * @param {Object} models         - { serie: { a0, a1 } } (optionnel pour méthode directe)
 * @param {string} methodType     - "indirect" | "direct"
 * @returns {Array} [{ niveau, serie, rep, xRef, zRetrouvee, bAbs, bRel }]
 */
function computeFoundConcentrations(planValidation, models, methodType) {
  return planValidation.map(row => {
    const xRef = parseFloat(row.xRef);
    let   z;

    if (methodType === "direct") {
      // Méthode directe : la réponse Y est directement la concentration
      z = parseFloat(row.yResponse);
    } else {
      // Méthode indirecte : prédiction inverse via le modèle de la série
      const m = models[row.serie];
      if (!m) return null;
      z = inversePrediction(parseFloat(row.yResponse), m.a0, m.a1);
      if (z === null) return null;
    }

    const bAbs = z - xRef;
    const bRel = xRef !== 0 ? (bAbs / xRef) * 100 : null;

    return {
      niveau:      row.niveau,
      serie:       row.serie,
      rep:         row.rep,
      xRef:        xRef,
      zRetrouvee:  z,
      bAbs:        bAbs,
      bRel:        bRel,
      yResponse:   parseFloat(row.yResponse),
    };
  }).filter(Boolean);
}

// ─── Critères de justesse et fidélité par niveau (ISO 5725-2) ─────────────────

/**
 * Calcule les critères de fidélité et de justesse pour chaque niveau.
 * Basé sur les formules (8)–(13) de Feinberg (2010).
 *
 * @param {Array} found - sorties de computeFoundConcentrations
 * @returns {Array} [{ niveau, xMean, zMean, sr, sB, sFI, cv, biasMoy, bRel, recouvMoy, I, J }]
 */
function computeCriteria(found) {
  // Grouper par niveau
  const byNiveau = {};
  found.forEach(row => {
    if (!byNiveau[row.niveau]) byNiveau[row.niveau] = [];
    byNiveau[row.niveau].push(row);
  });

  const results = [];

  Object.entries(byNiveau).forEach(([niv, rows]) => {
    // Grouper par série
    const bySerie = {};
    rows.forEach(r => {
      if (!bySerie[r.serie]) bySerie[r.serie] = [];
      bySerie[r.serie].push(r);
    });

    const series = Object.values(bySerie);
    const I = series.length;

    // Vérifier J constant (sinon prendre la valeur de la première série)
    const J = series[0].length;
    const N = I * J;

    // Moyennes globales
    const xMean = rows.reduce((s, r) => s + r.xRef,       0) / N;
    const zMean = rows.reduce((s, r) => s + r.zRetrouvee, 0) / N;

    // Moyennes par série Z̄_i
    const serieMeans = series.map(s => s.reduce((a, r) => a + r.zRetrouvee, 0) / s.length);

    // SCEr = Σ_i Σ_j (z_ij - Z̄_i)²    [formule 10]
    let SCEr = 0;
    series.forEach((s, i) => {
      s.forEach(r => { SCEr += (r.zRetrouvee - serieMeans[i]) ** 2; });
    });

    // SCEB = Σ_i J × (Z̄_i - Z̄)²       [formule 11]
    let SCEB = 0;
    serieMeans.forEach(zm => { SCEB += J * (zm - zMean) ** 2; });

    // Variances
    const Sr2 = I * (J - 1) > 0 ? SCEr / (I * (J - 1)) : 0;  // [formule 12]
    const SB2Raw = (I - 1) > 0  ? SCEB / (I - 1) - Sr2 / J : 0;
    const SB2  = Math.max(0, SB2Raw);                            // [formule 13]
    const SFI2 = Sr2 + SB2;

    const sr  = Math.sqrt(Sr2);
    const sB  = Math.sqrt(SB2);
    const sFI = Math.sqrt(SFI2);
    const cv  = zMean !== 0 ? (sFI / Math.abs(zMean)) * 100 : 0;

    // Justesse
    const biasMoy = zMean - xMean;
    const bRel    = xMean !== 0 ? (biasMoy / xMean) * 100 : 0;
    const recouvMoy = xMean !== 0 ? (zMean / xMean) * 100 : 0;

    results.push({
      niveau:     niv,
      xMean, zMean,
      sr, sB, sFI, cv,
      biasMoy, bRel, recouvMoy,
      SCEr, SCEB, Sr2, SB2, SFI2,
      I, J, N,
      serieMeans,
      rows,
    });
  });

  // Trier par niveau (valeur numérique de xMean)
  results.sort((a, b) => a.xMean - b.xMean);
  return results;
}

// ─── Intervalles de tolérance β-expectation (Mee, 1984) ──────────────────────

/**
 * Calcule les intervalles de tolérance selon la méthode de Mee (1984).
 * Formules (14)–(17) de Feinberg (2010).
 *
 * @param {Array}  criteria - sorties de computeCriteria
 * @param {number} beta     - proportion (ex: 0.80)
 * @param {number} lambda   - limite d'acceptabilité (ex: 0.10 pour 10%)
 * @returns {Array} [{ niveau, xMean, sIT, ktol, nu, ltbAbs, lthAbs, ltbRel, lthRel, accept }]
 */
function computeToleranceIntervals(criteria, beta = 0.80, lambda = 0.10) {
  return criteria.map(c => {
    const { xMean, zMean, Sr2, SB2, SFI2, I, J } = c;
    const sFI = Math.sqrt(SFI2);

    // R = SB² / Sr²    [formule 16]
    const R = Sr2 > 0 ? SB2 / Sr2 : 0;

    // B = sqrt((R+1)/(J*R+1))    [formule 15]
    const B = Math.sqrt((R + 1) / (J * R + 1));

    // sIT = sFI * sqrt(1 + 1/(I*J*B²))    [formule 14]
    const denom14 = I * J * B ** 2;
    const sIT = sFI * Math.sqrt(1 + (denom14 > 0 ? 1 / denom14 : 0));

    // Degrés de liberté ν (approximation Welch-Satterthwaite)    [formule 17]
    const numNu  = (R + 1) ** 2;
    const denNu  = ((R + 1 / J) ** 2) / (I - 1) + (1 - 1 / J) / (I * J);
    const nu     = denNu > 0 ? Math.round(numNu / denNu) : I * J * (J - 1);

    // Facteur de couverture k_tol = t_{ν, (1+β)/2}
    const pStudent = (1 + beta) / 2;
    const ktol     = Math.abs(tQuantile(nu, pStudent));

    // Limites de tolérance (absolues)
    const ltbAbs = zMean - ktol * sIT;
    const lthAbs = zMean + ktol * sIT;

    // Limites relatives (en % par rapport à xMean)
    const ltbRel = xMean !== 0 ? (ltbAbs / xMean) * 100 : null;
    const lthRel = xMean !== 0 ? (lthAbs / xMean) * 100 : null;

    // Taux de recouvrement moyen relatif
    const recouvRel = xMean !== 0 ? (zMean / xMean) * 100 : 100;

    // Limites d'acceptabilité (relative à xMean)
    const laBasse = (1 - lambda) * 100;
    const laHaute = (1 + lambda) * 100;

    // Décision de validation : les deux limites de tolérance doivent être
    // incluses dans les limites d'acceptabilité
    const accept = ltbRel !== null && lthRel !== null
      ? (ltbRel >= laBasse && lthRel <= laHaute)
      : false;

    return {
      niveau:   c.niveau,
      xMean, zMean, recouvRel,
      sIT, ktol, nu, R, B,
      ltbAbs, lthAbs,
      ltbRel, lthRel,
      laBasse, laHaute,
      accept,
      lambda: lambda * 100,
      beta:   beta * 100,
    };
  });
}

// ─── Détection des aberrants (test de Grubbs) ────────────────────────────────

/**
 * Test de Grubbs pour la détection d'une valeur aberrante.
 * H0 : pas d'aberrant. Rejet si G > G_crit(α, n).
 *
 * @param {number[]} data - tableau de valeurs
 * @param {number}   alpha - seuil de signification (défaut 0.05)
 * @returns {{ G, Gcrit, suspect, suspectIdx, suspectVal }}
 */
function grubbsTest(data, alpha = 0.05) {
  const n    = data.length;
  if (n < 3) return { G: 0, Gcrit: Infinity, suspect: false };

  const mean = data.reduce((s, v) => s + v, 0) / n;
  const std  = Math.sqrt(data.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  if (std === 0) return { G: 0, Gcrit: Infinity, suspect: false };

  const Gvals = data.map(v => Math.abs(v - mean) / std);
  const G     = Math.max(...Gvals);
  const idx   = Gvals.indexOf(G);

  // Valeur critique de Grubbs (approximation t de Student)
  const t2 = tQuantile(n - 2, 1 - alpha / (2 * n));
  const Gcrit = ((n - 1) / Math.sqrt(n)) * Math.sqrt(t2 ** 2 / (n - 2 + t2 ** 2));

  return {
    G:          +G.toFixed(4),
    Gcrit:      +Gcrit.toFixed(4),
    suspect:    G > Gcrit,
    suspectIdx: idx,
    suspectVal: data[idx],
    mean:       +mean.toFixed(6),
    std:        +std.toFixed(6),
  };
}

/**
 * Applique le test de Grubbs par niveau sur les concentrations retrouvées.
 * @param {Array} criteria - sorties de computeCriteria
 * @returns {Array} [{ niveau, xMean, grubbs, outliers }]
 */
function detectOutliers(criteria, alpha = 0.05) {
  return criteria.map(c => {
    const zVals  = c.rows.map(r => r.zRetrouvee);
    const grubbs = grubbsTest(zVals, alpha);

    return {
      niveau:  c.niveau,
      xMean:   c.xMean,
      n:       zVals.length,
      grubbs,
      outlierVal: grubbs.suspect ? grubbs.suspectVal : null,
    };
  });
}

// ─── Statistiques descriptives ────────────────────────────────────────────────

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(arr.length - 1, 1));
}

// ─── Domaine de validité ──────────────────────────────────────────────────────

/**
 * Détermine le domaine de validité (plage de concentrations où la méthode est validée).
 * @param {Array} tolerances - sorties de computeToleranceIntervals
 * @returns {{ valid, domain, nValid, nTotal }}
 */
function computeValidityDomain(tolerances) {
  const nValid    = tolerances.filter(t => t.accept).length;
  const nTotal    = tolerances.length;
  const validLvls = tolerances.filter(t => t.accept).map(t => t.xMean);

  let domain = null;
  if (validLvls.length > 0) {
    domain = {
      min: Math.min(...validLvls),
      max: Math.max(...validLvls),
      nLevels: validLvls.length,
    };
  }

  return {
    valid:   nValid === nTotal,
    partial: nValid > 0 && nValid < nTotal,
    invalid: nValid === 0,
    domain,
    nValid,
    nTotal,
    pct: Math.round((nValid / nTotal) * 100),
  };
}

// ─── Point d'entrée principal ──────────────────────────────────────────────────

/**
 * Exécute le pipeline complet de calcul du profil d'exactitude.
 *
 * @param {Object} config
 *   config.planValidation  : [{ niveau, serie, rep, xRef, yResponse }]
 *   config.planEtalonnage  : [{ serie, xEtalon, yResponse }] (si indirect)
 *   config.methodType      : "indirect" | "direct"
 *   config.modelType       : "linear" | "origin"
 *   config.beta            : 0.80
 *   config.lambda          : 0.10
 *   config.alpha           : 0.05 (Grubbs)
 *
 * @returns {Object} résultat complet
 */
function runFullAnalysis(config) {
  const {
    planValidation,
    planEtalonnage  = [],
    methodType      = "indirect",
    modelType       = "linear",
    beta            = 0.80,
    lambda          = 0.10,
    alpha           = 0.05,
  } = config;

  // 1. Modèles d'étalonnage
  let models = {};
  if (methodType === "indirect" && planEtalonnage.length > 0) {
    models = computeCalibrationModels(planEtalonnage, modelType);
  }

  // 2. Concentrations retrouvées
  const found = computeFoundConcentrations(planValidation, models, methodType);

  // 3. Critères de justesse et fidélité
  const criteria = computeCriteria(found);

  // 4. Intervalles de tolérance β-expectation
  const tolerances = computeToleranceIntervals(criteria, beta, lambda);

  // 5. Détection des aberrants (Grubbs)
  const outliers = detectOutliers(criteria, alpha);

  // 6. Domaine de validité
  const validity = computeValidityDomain(tolerances);

  return {
    models,
    found,
    criteria,
    tolerances,
    outliers,
    validity,
    config: { methodType, beta, lambda, alpha },
  };
}

window.AccuracyStats = {
  runFullAnalysis,
  computeCalibrationModels,
  computeFoundConcentrations,
  computeCriteria,
  computeToleranceIntervals,
  detectOutliers,
  computeValidityDomain,
  linearRegression,
  linearRegressionOrigin,
  grubbsTest,
  tQuantile,
  normalQuantile,
  mean, stdDev,
};
