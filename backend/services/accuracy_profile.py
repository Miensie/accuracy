"""
================================================================
services/accuracy_profile.py — Orchestrateur du profil d'exactitude
Coordonne tous les calculs et produit la réponse complète.
================================================================
"""
from __future__ import annotations
import logging
from typing import Dict, Any, List, Optional

from services.statistics import (
    compute_calibration_models,
    compute_found_concentrations,
    compute_criteria,
    compute_tolerance_intervals,
    compute_outliers_by_level,
    shapiro_wilk_by_level,
    homogeneity_of_variance,
    compute_validity,
    compute_quality_score,
    basic_stats,
)
from utils.helpers import (
    plot_accuracy_profile,
    plot_calibration,
    plot_variance_decomposition,
    now_iso,
)

logger = logging.getLogger(__name__)


# ─── Pipeline principal ───────────────────────────────────────────────────────

def run_full_analysis(
    plan_validation:  List[Dict[str, Any]],
    plan_etalonnage:  List[Dict[str, Any]],
    config:           Dict[str, Any],
    include_charts:   bool = True,
    chart_format:     str  = "png_base64",
) -> Dict[str, Any]:
    """
    Pipeline complet du profil d'exactitude :
    1. Étalonnage (si méthode indirecte)
    2. Calcul des concentrations retrouvées
    3. Critères ISO 5725-2 (sr, sB, sFI, biais, recouvrement)
    4. Intervalles β-expectation (Mee, 1984)
    5. Détection aberrants (Grubbs)
    6. Tests statistiques (Shapiro, Levene)
    7. Synthèse de validité + score qualité
    8. Graphiques optionnels

    Parameters
    ----------
    plan_validation : liste de dicts (ValidationRow)
    plan_etalonnage : liste de dicts (EtalonnageRow), vide si direct
    config          : dict issu de ValidationConfig
    include_charts  : générer les graphiques
    chart_format    : "png_base64" | "plotly_json"

    Returns
    -------
    dict complet conforme à AnalysisResponse
    """
    method_type = config.get("methodType", "indirect")
    model_type  = config.get("modelType",  "linear")
    beta        = float(config.get("beta",      0.80))
    lambda_val  = float(config.get("lambdaVal", 0.10))
    alpha       = float(config.get("alpha",     0.05))
    unite       = config.get("unite", "")

    result: Dict[str, Any] = {
        "status":  "ok",
        "version": "2.0",
        "meta": {
            "timestamp": now_iso(),
            "config":    config,
            "n_validation": len(plan_validation),
            "n_etalonnage": len(plan_etalonnage),
        },
    }

    # ── 1. Modèles d'étalonnage ────────────────────────────────────────────
    models: Dict[str, Dict] = {}
    if method_type == "indirect":
        if not plan_etalonnage:
            return {**result, "status": "error",
                    "detail": "planEtalonnage requis pour méthode indirecte"}
        models = compute_calibration_models(plan_etalonnage, model_type)
        logger.info("Étalonnage : %d modèles calculés", len(models))

    result["models"] = models

    # ── 2. Concentrations retrouvées ───────────────────────────────────────
    found = compute_found_concentrations(plan_validation, models, method_type)
    if not found:
        return {**result, "status": "error",
                "detail": "Aucune concentration retrouvée — vérifiez les données"}
    result["found"] = found[:200]   # Limité pour la réponse JSON

    # ── 3. Statistiques descriptives globales ──────────────────────────────
    all_z = [r["zRetrouvee"] for r in found]
    all_b = [r["bRel"] for r in found if r["bRel"] is not None]
    result["statistics"] = {
        "global_z": basic_stats(all_z, alpha),
        "global_bias_pct": basic_stats(all_b, alpha) if all_b else {},
    }

    # ── 4. Critères ISO 5725-2 ─────────────────────────────────────────────
    criteria = compute_criteria(found)
    result["criteria"] = criteria
    logger.info("Critères : %d niveaux traités", len(criteria))

    # ── 5. Intervalles β-expectation ──────────────────────────────────────
    tolerances = compute_tolerance_intervals(criteria, beta, lambda_val)
    result["tolerances"] = tolerances

    # ── 6. Détection des aberrants ─────────────────────────────────────────
    outliers = compute_outliers_by_level(found, alpha)
    result["outliers"] = outliers

    # ── 7. Tests statistiques ──────────────────────────────────────────────
    normality   = shapiro_wilk_by_level(found)
    homogeneity = homogeneity_of_variance(found, alpha)
    result["normality"]   = normality
    result["homogeneity"] = homogeneity

    # ── 8. Validité et score ───────────────────────────────────────────────
    validity = compute_validity(tolerances)
    result["validity"] = validity

    quality_score = compute_quality_score(criteria, tolerances, normality, homogeneity)
    result["qualityScore"] = quality_score
    logger.info("Score qualité : %.1f/100 (%s)", quality_score["overall"], quality_score["label"])

    # ── 9. Graphiques ──────────────────────────────────────────────────────
    charts: Dict[str, Optional[str]] = {
        "profile":     None,
        "calibration": None,
        "residuals":   None,
        "anova":       None,
        "format":      chart_format,
    }
    if include_charts and tolerances:
        try:
            charts["profile"] = plot_accuracy_profile(tolerances, config, chart_format)
        except Exception as e:
            logger.warning("Graphique profil échoué : %s", e)

        if method_type == "indirect" and models:
            try:
                # Calibration de la première série comme exemple
                first_serie = next(iter(models))
                m = models[first_serie]
                charts["calibration"] = plot_calibration(
                    m.get("x_data", []), m.get("y_data", []),
                    m, serie=first_serie, unite=unite
                )
            except Exception as e:
                logger.warning("Graphique étalonnage échoué : %s", e)

        if criteria:
            try:
                charts["anova"] = plot_variance_decomposition(criteria)
            except Exception as e:
                logger.warning("Graphique ANOVA échoué : %s", e)

    result["charts"] = charts

    return result


# ─── Conversion format simplifié → format interne ─────────────────────────────

def convert_simple_to_internal(
    simple_rows: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Convertit le format simplifié { concentration, replicate, measured, reference }
    en format interne { niveau, serie, rep, xRef, yResponse }.
    Crée un niveau par concentration unique et une seule série.
    """
    # Grouper par concentration
    by_conc: Dict[float, List] = {}
    for r in simple_rows:
        c = r.get("concentration") or r.get("reference", 0)
        if c not in by_conc:
            by_conc[c] = []
        by_conc[c].append(r)

    internal = []
    for i, (conc, rows) in enumerate(sorted(by_conc.items())):
        niveau = f"N{i+1}"
        for j, r in enumerate(rows):
            internal.append({
                "niveau":    niveau,
                "serie":     "Série 1",
                "rep":       j + 1,
                "xRef":      r.get("reference") or conc,
                "yResponse": r.get("measured", 0),
            })
    return internal
