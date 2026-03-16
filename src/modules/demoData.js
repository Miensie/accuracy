/**
 * ================================================================
 * demoData.js — Données de démonstration (Feinberg, 2010)
 * Dosage du nicotinamide (vitamine B3) dans le lait par HPLC
 * Méthode indirecte, I=3 séries, J=3 répétitions, K=3 niveaux
 * ================================================================
 */
"use strict";

/**
 * Plan de validation — Feinberg (2010)
 * Réponses instrumentales Y mesurées pour 3 niveaux × 3 jours × 3 répétitions
 */
const FEINBERG_VALIDATION = [
  // Niveau A — 0.40 mg/L
  { niveau: "A", serie: "Jour 1", rep: 1, xRef: 0.40, yResponse: 22.6 },
  { niveau: "A", serie: "Jour 1", rep: 2, xRef: 0.40, yResponse: 22.1 },
  { niveau: "A", serie: "Jour 1", rep: 3, xRef: 0.40, yResponse: 22.4 },
  { niveau: "A", serie: "Jour 2", rep: 1, xRef: 0.40, yResponse: 23.3 },
  { niveau: "A", serie: "Jour 2", rep: 2, xRef: 0.40, yResponse: 24.1 },
  { niveau: "A", serie: "Jour 2", rep: 3, xRef: 0.40, yResponse: 23.9 },
  { niveau: "A", serie: "Jour 3", rep: 1, xRef: 0.40, yResponse: 23.8 },
  { niveau: "A", serie: "Jour 3", rep: 2, xRef: 0.40, yResponse: 23.6 },
  { niveau: "A", serie: "Jour 3", rep: 3, xRef: 0.40, yResponse: 23.5 },
  // Niveau B — 2.0 mg/L
  { niveau: "B", serie: "Jour 1", rep: 1, xRef: 2.0, yResponse: 135.0 },
  { niveau: "B", serie: "Jour 1", rep: 2, xRef: 2.0, yResponse: 135.1 },
  { niveau: "B", serie: "Jour 1", rep: 3, xRef: 2.0, yResponse: 129.9 },
  { niveau: "B", serie: "Jour 2", rep: 1, xRef: 2.0, yResponse: 137.6 },
  { niveau: "B", serie: "Jour 2", rep: 2, xRef: 2.0, yResponse: 135.2 },
  { niveau: "B", serie: "Jour 2", rep: 3, xRef: 2.0, yResponse: 138.8 },
  { niveau: "B", serie: "Jour 3", rep: 1, xRef: 2.0, yResponse: 136.3 },
  { niveau: "B", serie: "Jour 3", rep: 2, xRef: 2.0, yResponse: 135.1 },
  { niveau: "B", serie: "Jour 3", rep: 3, xRef: 2.0, yResponse: 134.4 },
  // Niveau C — 4.0 mg/L
  { niveau: "C", serie: "Jour 1", rep: 1, xRef: 4.0, yResponse: 275.2 },
  { niveau: "C", serie: "Jour 1", rep: 2, xRef: 4.0, yResponse: 276.9 },
  { niveau: "C", serie: "Jour 1", rep: 3, xRef: 4.0, yResponse: 261.3 },
  { niveau: "C", serie: "Jour 2", rep: 1, xRef: 4.0, yResponse: 268.1 },
  { niveau: "C", serie: "Jour 2", rep: 2, xRef: 4.0, yResponse: 269.7 },
  { niveau: "C", serie: "Jour 2", rep: 3, xRef: 4.0, yResponse: 276.9 },
  { niveau: "C", serie: "Jour 3", rep: 1, xRef: 4.0, yResponse: 271.6 },
  { niveau: "C", serie: "Jour 3", rep: 2, xRef: 4.0, yResponse: 273.3 },
  { niveau: "C", serie: "Jour 3", rep: 3, xRef: 4.0, yResponse: 275.0 },
];

/**
 * Plan d'étalonnage — Feinberg (2010)
 * Deux niveaux d'étalon (0.4 et 4.0 mg/L), 3 séries, 2 répétitions chacune
 */
const FEINBERG_ETALONNAGE = [
  // Niveau bas — 0.4 mg/L
  { serie: "Jour 1", niveau: "Bas", rep: 1, xEtalon: 0.4, yResponse: 22.7 },
  { serie: "Jour 1", niveau: "Bas", rep: 2, xEtalon: 0.4, yResponse: 23.1 },
  { serie: "Jour 2", niveau: "Bas", rep: 1, xEtalon: 0.4, yResponse: 22.9 },
  { serie: "Jour 2", niveau: "Bas", rep: 2, xEtalon: 0.4, yResponse: 23.2 },
  { serie: "Jour 3", niveau: "Bas", rep: 1, xEtalon: 0.4, yResponse: 21.9 },
  { serie: "Jour 3", niveau: "Bas", rep: 2, xEtalon: 0.4, yResponse: 22.1 },
  // Niveau haut — 4.0 mg/L
  { serie: "Jour 1", niveau: "Haut", rep: 1, xEtalon: 4.0, yResponse: 281.6 },
  { serie: "Jour 1", niveau: "Haut", rep: 2, xEtalon: 4.0, yResponse: 275.3 },
  { serie: "Jour 2", niveau: "Haut", rep: 1, xEtalon: 4.0, yResponse: 275.3 },
  { serie: "Jour 2", niveau: "Haut", rep: 2, xEtalon: 4.0, yResponse: 274.6 },
  { serie: "Jour 3", niveau: "Haut", rep: 1, xEtalon: 4.0, yResponse: 272.0 },
  { serie: "Jour 3", niveau: "Haut", rep: 2, xEtalon: 4.0, yResponse: 273.0 },
];

/**
 * Configuration du cas Feinberg
 */
const FEINBERG_CONFIG = {
  methode:    "Dosage du nicotinamide (vitamine B3) dans le lait par HPLC fluorimétrique",
  materiau:   "Nicotinamide",
  unite:      "mg/L",
  methodType: "indirect",
  modelType:  "linear",
  beta:       0.80,  // 80%
  lambda:     0.10,  // ±10%
  K: 3, I: 3, J: 3,
  niveaux: [
    { code: "A", xRef: 0.40, label: "Niveau bas (0.40 mg/L)" },
    { code: "B", xRef: 2.00, label: "Niveau moyen (2.00 mg/L)" },
    { code: "C", xRef: 4.00, label: "Niveau haut (4.00 mg/L)" },
  ],
  reference: "Feinberg M. (2010). Interprétation du profil d'exactitude. SFSTP."
};

window.DemoData = {
  FEINBERG_VALIDATION,
  FEINBERG_ETALONNAGE,
  FEINBERG_CONFIG,
};
