"""
================================================================
services/validation.py — Conformité normative
ICH Q2(R1) · ISO 5725-2 · NF V03-110 · SFSTP/Feinberg (2010)
================================================================
"""
from __future__ import annotations
from typing import List, Dict, Any, Optional


# ─── Référentiels normatifs ───────────────────────────────────────────────────

ICH_Q2_CRITERIA = {
    "linearity_r2_min":         0.9990,  # R² courbe d'étalonnage
    "precision_cv_max":         2.0,     # CV% répétabilité (HPLC pharmaceutique)
    "precision_cv_rsd_max":     2.0,     # RSD% max
    "accuracy_recovery_low":    98.0,    # Taux de recouvrement minimum (%)
    "accuracy_recovery_high":  102.0,   # Taux de recouvrement maximum (%)
    "accuracy_bias_max":         2.0,    # Biais absolu max (%)
    "lod_snr":                   3.0,    # Signal/bruit LOD
    "loq_snr":                  10.0,   # Signal/bruit LOQ
    "specificity_resolution":    1.5,    # Résolution entre pics
}

ISO_5725_CRITERIA = {
    "cv_repeatability_max":     5.0,    # CV% répétabilité acceptable (général)
    "cv_intermediate_max":     10.0,   # CV% fidélité intermédiaire
    "bias_max":                 5.0,    # Biais relatif max (%)
    "recovery_low":            95.0,
    "recovery_high":          105.0,
}

SFSTP_CRITERIA = {
    # Feinberg (2010) — profil d'exactitude
    "lambda_default":           0.10,   # Limite d'acceptabilité par défaut (±10%)
    "beta_default":             0.80,   # Proportion β par défaut
    "k_levels_min":             3,      # Nombre minimal de niveaux
    "i_series_min":             3,      # Nombre minimal de séries
    "j_reps_min":               2,      # Répétitions minimales
}

NF_V03_110_CRITERIA = {
    "cv_max_food":              5.0,    # CV% max en agroalimentaire
    "recovery_low":            90.0,
    "recovery_high":          110.0,
}


# ─── Règles ICH Q2(R1) ────────────────────────────────────────────────────────

def check_ich_q2(
    criteria:   List[Dict[str, Any]],
    tolerances: List[Dict[str, Any]],
    models:     Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    """
    Vérifie la conformité ICH Q2(R1) et retourne une liste d'items
    avec severity : 'success' | 'info' | 'warning' | 'critical'.
    """
    items = []

    # --- Linéarité (R²) ---
    if models:
        for serie, m in models.items():
            r2 = m.get("r2", 0)
            thr = ICH_Q2_CRITERIA["linearity_r2_min"]
            sev = "success" if r2 >= thr else "critical"
            items.append({
                "category":  "Linéarité ICH Q2",
                "severity":  sev,
                "message":   f"Série {serie} : R² = {r2:.6f} (seuil ≥ {thr})",
                "value":     r2,
                "threshold": thr,
            })

    # --- Précision (CV répétabilité) ---
    for c in criteria:
        cv_r = c.get("cvR", c.get("cv", 0))
        thr  = ICH_Q2_CRITERIA["precision_cv_rsd_max"]
        sev  = "success" if cv_r <= thr else ("warning" if cv_r <= thr * 1.5 else "critical")
        items.append({
            "category":  "Précision ICH Q2",
            "severity":  sev,
            "message":   f"Niveau {c['niveau']} : CV répétabilité = {cv_r:.2f}% (seuil ≤ {thr}%)",
            "value":     cv_r,
            "threshold": thr,
        })

    # --- Exactitude (taux de recouvrement) ---
    for c in criteria:
        rec = c.get("recouvMoy", 100)
        lo  = ICH_Q2_CRITERIA["accuracy_recovery_low"]
        hi  = ICH_Q2_CRITERIA["accuracy_recovery_high"]
        sev = "success" if lo <= rec <= hi else ("warning" if lo - 2 <= rec <= hi + 2 else "critical")
        items.append({
            "category":  "Exactitude ICH Q2",
            "severity":  sev,
            "message":   f"Niveau {c['niveau']} : Recouvrement = {rec:.2f}% (plage [{lo}–{hi}%])",
            "value":     rec,
            "threshold": (lo + hi) / 2,
        })

    return items


# ─── Règles ISO 5725-2 ───────────────────────────────────────────────────────

def check_iso_5725(
    criteria:   List[Dict[str, Any]],
    tolerances: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Vérifie la conformité ISO 5725-2."""
    items = []

    for c in criteria:
        # CV fidélité intermédiaire
        cv  = c.get("cv", 0)
        thr = ISO_5725_CRITERIA["cv_intermediate_max"]
        sev = "success" if cv <= thr else ("warning" if cv <= thr * 1.5 else "critical")
        items.append({
            "category":  "Fidélité intermédiaire ISO 5725",
            "severity":  sev,
            "message":   f"Niveau {c['niveau']} : sFI CV = {cv:.2f}% (seuil ≤ {thr}%)",
            "value":     cv,
            "threshold": thr,
        })

        # Biais
        bias = abs(c.get("bRel", 0))
        thr2 = ISO_5725_CRITERIA["bias_max"]
        sev2 = "success" if bias <= thr2 else ("warning" if bias <= thr2 * 2 else "critical")
        items.append({
            "category":  "Justesse ISO 5725",
            "severity":  sev2,
            "message":   f"Niveau {c['niveau']} : |Biais| = {bias:.2f}% (seuil ≤ {thr2}%)",
            "value":     bias,
            "threshold": thr2,
        })

    # Intervalles de tolérance
    n_valid = sum(1 for t in tolerances if t.get("accept", False))
    n_total = len(tolerances)
    sev     = "success" if n_valid == n_total else ("warning" if n_valid > 0 else "critical")
    items.append({
        "category":  "Profil d'exactitude ISO 5725",
        "severity":  sev,
        "message":   f"{n_valid}/{n_total} niveaux dans les limites β-expectation",
        "value":     float(n_valid),
        "threshold": float(n_total),
    })

    return items


# ─── Règles SFSTP / Feinberg ──────────────────────────────────────────────────

def check_sfstp(
    plan_info:  Dict[str, Any],
    tolerances: List[Dict[str, Any]],
    lambda_val: float = 0.10,
    beta:       float = 0.80,
) -> List[Dict[str, Any]]:
    """Vérifie la conformité SFSTP / Feinberg (2010)."""
    items = []

    # Plan expérimental
    K = plan_info.get("K", 0)
    I = plan_info.get("I", 0)
    J = plan_info.get("J", 0)

    if K < SFSTP_CRITERIA["k_levels_min"]:
        items.append({
            "category": "Plan SFSTP",
            "severity": "critical",
            "message":  f"Nombre de niveaux K={K} insuffisant (min {SFSTP_CRITERIA['k_levels_min']})",
            "value": K, "threshold": SFSTP_CRITERIA["k_levels_min"],
        })
    else:
        items.append({
            "category": "Plan SFSTP",
            "severity": "success",
            "message":  f"Plan : K={K} niveaux, I={I} séries, J={J} répétitions — conforme",
            "value": K, "threshold": SFSTP_CRITERIA["k_levels_min"],
        })

    # β et λ raisonnables
    if beta < 0.80:
        items.append({
            "category": "Paramètres SFSTP",
            "severity": "warning",
            "message":  f"β={beta*100:.0f}% < 80% (valeur recommandée ≥ 80%)",
            "value": beta, "threshold": 0.80,
        })
    if lambda_val > 0.20:
        items.append({
            "category": "Paramètres SFSTP",
            "severity": "warning",
            "message":  f"λ={lambda_val*100:.0f}% > 20% — critère d'acceptabilité très large",
            "value": lambda_val, "threshold": 0.20,
        })

    return items


# ─── Agrégateur normatif ──────────────────────────────────────────────────────

def run_normative_checks(
    framework:  str,
    criteria:   List[Dict[str, Any]],
    tolerances: List[Dict[str, Any]],
    models:     Optional[Dict[str, Any]] = None,
    plan_info:  Optional[Dict[str, Any]] = None,
    lambda_val: float = 0.10,
    beta:       float = 0.80,
) -> List[Dict[str, Any]]:
    """
    Lance les vérifications normatives selon le référentiel choisi.

    Parameters
    ----------
    framework : "iso5725" | "ichq2" | "sfstp" | "nf_v03" | "all"
    """
    items: List[Dict[str, Any]] = []

    if framework in ("iso5725", "all"):
        items += check_iso_5725(criteria, tolerances)

    if framework in ("ichq2", "all"):
        items += check_ich_q2(criteria, tolerances, models)

    if framework in ("sfstp", "all"):
        pi = plan_info or {}
        items += check_sfstp(pi, tolerances, lambda_val, beta)

    # Si aucun framework spécifique, ISO 5725 par défaut
    if not items:
        items += check_iso_5725(criteria, tolerances)

    # Tri : critical → warning → info → success
    order = {"critical": 0, "warning": 1, "info": 2, "success": 3}
    items.sort(key=lambda x: order.get(x.get("severity", "info"), 2))

    return items
