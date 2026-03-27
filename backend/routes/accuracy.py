"""
================================================================
routes/accuracy.py — Endpoints de l'API Accuracy Profile
POST /accuracy-profile    → Analyse complète
POST /api/analyze         → Alias (rétrocompatibilité)
POST /api/grubbs          → Test de Grubbs seul
POST /api/calibration     → Modèles d'étalonnage seuls
POST /api/interpret       → Interprétation IA
POST /api/report/pdf      → Génération PDF
POST /api/simple          → Endpoint format simplifié
GET  /api/health          → Santé du service
GET  /api/norms           → Critères normatifs
================================================================
"""
from __future__ import annotations
import logging
import os
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from fastapi.responses import Response

from models.schemas import (
    AnalysisRequest, SimpleAnalysisRequest,
    GrubbsRequest, ChatRequest,
    AnalysisResponse,
)
from services.accuracy_profile import run_full_analysis, convert_simple_to_internal
from services.statistics import (
    compute_calibration_models,
    grubbs_test,
    compute_criteria,
    compute_tolerance_intervals,
    compute_found_concentrations,
    compute_outliers_by_level,
    shapiro_wilk_by_level,
    homogeneity_of_variance,
    compute_validity,
    compute_quality_score,
    basic_stats,
)
from services.validation import run_normative_checks
from services.ai_interpretation import (
    rule_based_interpretation,
    get_ai_interpretation,
)
from utils.helpers import generate_pdf_report, now_iso

logger = logging.getLogger(__name__)

router = APIRouter()


# ─── Helpers locaux ───────────────────────────────────────────────────────────

def _row_to_dict(row) -> Dict[str, Any]:
    """Convertit un objet Pydantic Row en dict."""
    return row.model_dump() if hasattr(row, "model_dump") else dict(row)


def _config_to_dict(cfg) -> Dict[str, Any]:
    """Convertit ValidationConfig en dict sérialisable."""
    d = cfg.model_dump() if hasattr(cfg, "model_dump") else dict(cfg)
    # Convertir les enums en strings
    d["methodType"] = str(d.get("methodType", "indirect")).replace("MethodType.", "").split(".")[-1]
    d["modelType"]  = str(d.get("modelType",  "linear")).replace("ModelType.",  "").split(".")[-1]
    d["framework"]  = str(d.get("framework",  "iso5725")).split(".")[-1]
    return d


# ─── POST /accuracy-profile — Endpoint principal ──────────────────────────────

@router.post(
    "/accuracy-profile",
    summary="Analyse complète du profil d'exactitude",
    response_description="Résultats statistiques, profil, graphiques et interprétation",
    tags=["Profil d'exactitude"],
)
async def accuracy_profile_endpoint(
    req:           AnalysisRequest,
    charts:        bool   = Query(True,        description="Générer les graphiques (PNG base64)"),
    chart_format:  str    = Query("png_base64", description="Format graphiques: png_base64 | plotly_json"),
    normative:     bool   = Query(True,        description="Inclure les vérifications normatives"),
    interpret:     bool   = Query(True,        description="Inclure l'interprétation par règles"),
    api_key:       Optional[str] = Query(None, description="Clé API Gemini pour interprétation LLM"),
    provider:      str    = Query("auto",      description="Fournisseur LLM: gemini | claude | auto"),
) -> Dict[str, Any]:

    t0 = time.perf_counter()

    # Conversion des modèles Pydantic en dicts
    plan_val  = [_row_to_dict(r) for r in req.planValidation]
    plan_etal = [_row_to_dict(r) for r in (req.planEtalonnage or [])]
    config    = _config_to_dict(req.config)

    try:
        # Pipeline complet
        result = run_full_analysis(
            plan_validation = plan_val,
            plan_etalonnage = plan_etal,
            config          = config,
            include_charts  = charts,
            chart_format    = chart_format,
        )
    except Exception as e:
        logger.exception("Erreur pipeline analyse")
        raise HTTPException(status_code=422, detail=str(e))

    if result.get("status") == "error":
        raise HTTPException(status_code=422, detail=result.get("detail", "Erreur de calcul"))

    # Vérifications normatives
    if normative and result.get("criteria") and result.get("tolerances"):
        plan_info = {
            "K": len(result["criteria"]),
            "I": result["criteria"][0].get("I", 0) if result["criteria"] else 0,
            "J": result["criteria"][0].get("J", 0) if result["criteria"] else 0,
        }
        norm_items = run_normative_checks(
            framework  = config.get("framework", "iso5725"),
            criteria   = result.get("criteria", []),
            tolerances = result.get("tolerances", []),
            models     = result.get("models"),
            plan_info  = plan_info,
            lambda_val = config.get("lambdaVal", 0.10),
            beta       = config.get("beta", 0.80),
        )
        result["normativeChecks"] = norm_items

    # Interprétation
    if interpret and result.get("criteria"):
        interpretation = rule_based_interpretation(
            criteria    = result.get("criteria",    []),
            tolerances  = result.get("tolerances",  []),
            outliers    = result.get("outliers",    []),
            normality   = result.get("normality",   []),
            homogeneity = result.get("homogeneity"),
            quality     = result.get("qualityScore"),
            config      = config,
        )
        result["interpretation"] = interpretation

        # Interprétation LLM si clé fournie
        if api_key:
            try:
                llm_text = await get_ai_interpretation(
                    result, config, api_key, provider, "full"
                )
                result["llmInterpretation"] = llm_text
            except Exception as e:
                logger.warning("LLM interpretation failed: %s", e)
                result["llmInterpretation"] = f"[Erreur LLM: {e}]"

    elapsed = round(time.perf_counter() - t0, 3)
    result["meta"] = {**result.get("meta", {}), "duration_s": elapsed}

    logger.info("Analyse terminée en %.3fs (niveaux=%d, valides=%d/%d)",
                elapsed,
                len(result.get("criteria", [])),
                result.get("validity", {}).get("nValid", 0),
                result.get("validity", {}).get("nTotal", 0))

    return result


# ─── POST /api/analyze — Alias rétrocompatibilité ────────────────────────────

@router.post("/api/analyze", tags=["Rétrocompatibilité"])
async def analyze_legacy(req: AnalysisRequest) -> Dict[str, Any]:
    """Alias de /accuracy-profile pour compatibilité avec l'ancien frontend."""
    return await accuracy_profile_endpoint(req)


# ─── POST /api/simple — Format simplifié ─────────────────────────────────────

@router.post(
    "/api/simple",
    summary="Analyse (format simplifié)",
    tags=["Profil d'exactitude"],
)
async def simple_analysis(req: SimpleAnalysisRequest) -> Dict[str, Any]:
    """
    Accepte le format { data: [{concentration, replicate, measured, reference}] }.
    Convertit en format interne et lance le pipeline.
    """
    plan_val = convert_simple_to_internal([_row_to_dict(r) for r in req.data])
    config   = _config_to_dict(req.config)
    config["methodType"] = "direct"  # Format simple → méthode directe

    try:
        result = run_full_analysis(
            plan_validation = plan_val,
            plan_etalonnage = [],
            config          = config,
            include_charts  = True,
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    return result


# ─── POST /api/grubbs — Test de Grubbs seul ──────────────────────────────────

@router.post(
    "/api/grubbs",
    summary="Test de Grubbs (détection d'aberrants)",
    tags=["Tests statistiques"],
)
def grubbs_endpoint(req: GrubbsRequest) -> Dict[str, Any]:
    if len(req.data) < 3:
        raise HTTPException(400, "Minimum 3 valeurs requises")
    try:
        result = grubbs_test(req.data, alpha=req.alpha, iterative=True)
        result["alpha"] = req.alpha
        result["n_input"] = len(req.data)
        return result
    except Exception as e:
        raise HTTPException(422, str(e))


# ─── POST /api/calibration — Modèles d'étalonnage ────────────────────────────

@router.post(
    "/api/calibration",
    summary="Calcul des modèles d'étalonnage",
    tags=["Étalonnage"],
)
def calibration_endpoint(
    etalonnage: List[Dict[str, Any]],
    model_type: str = Query("linear", description="linear | origin | quad | auto"),
    include_charts: bool = Query(False),
) -> Dict[str, Any]:
    if not etalonnage:
        raise HTTPException(400, "Données d'étalonnage manquantes")
    try:
        models = compute_calibration_models(etalonnage, model_type)
        return {"status": "ok", "models": models, "n_series": len(models)}
    except Exception as e:
        raise HTTPException(422, str(e))


# ─── POST /api/interpret — Interprétation IA ─────────────────────────────────

@router.post(
    "/api/interpret",
    summary="Interprétation IA du profil d'exactitude",
    tags=["IA"],
)
async def interpret_endpoint(
    analysis_data: Dict[str, Any],
    config:        Dict[str, Any],
    api_key:       Optional[str] = Query(None),
    provider:      str           = Query("auto"),
    prompt_type:   str           = Query("full", description="full | profile | outliers | recommendations"),
) -> Dict[str, Any]:
    try:
        # Utiliser la clé API fournie ou celle des variables d'environnement
        effective_api_key = api_key or os.getenv("GEMINI_API_KEY")

        if effective_api_key:
            text = await get_ai_interpretation(analysis_data, config, effective_api_key, provider, prompt_type)
            return {"status": "ok", "source": "llm", "provider": provider, "text": text}
        else:
            items = rule_based_interpretation(
                criteria    = analysis_data.get("criteria",    []),
                tolerances  = analysis_data.get("tolerances",  []),
                outliers    = analysis_data.get("outliers",    []),
                normality   = analysis_data.get("normality",   []),
                homogeneity = analysis_data.get("homogeneity"),
                quality     = analysis_data.get("qualityScore"),
                config      = config,
            )
            return {"status": "ok", "source": "rules", "items": items}
    except Exception as e:
        raise HTTPException(500, str(e))


# ─── POST /api/chat — Chat IA ────────────────────────────────────────────────

@router.post(
    "/api/chat",
    summary="Assistant analytique (chat contextuel)",
    tags=["IA"],
)
async def chat_endpoint(req: ChatRequest) -> Dict[str, Any]:
    # Utiliser la clé API du corps de la requête ou celle des variables d'environnement
    effective_api_key = req.api_key or os.getenv("GEMINI_API_KEY")

    if not effective_api_key:
        raise HTTPException(400, "Clé API requise pour le chat")

    context_data = req.context or {}
    try:
        text = await get_ai_interpretation(
            context_data, {}, effective_api_key, req.provider, "chat"
        )
        return {"status": "ok", "response": text}
    except Exception as e:
        raise HTTPException(500, str(e))


# ─── POST /api/report/pdf — Rapport PDF ──────────────────────────────────────

@router.post(
    "/api/report/pdf",
    summary="Génération du rapport PDF",
    response_class=Response,
    tags=["Rapport"],
)
def pdf_report_endpoint(
    analysis_data: Dict[str, Any],
    config:        Dict[str, Any],
) -> Response:
    try:
        pdf_bytes = generate_pdf_report(analysis_data, config)
        filename  = f"accuracy_profile_{now_iso()[:10]}.pdf"
        return Response(
            content     = pdf_bytes,
            media_type  = "application/pdf",
            headers     = {"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except ImportError:
        raise HTTPException(501, "reportlab non installé — pip install reportlab")
    except Exception as e:
        logger.exception("Erreur génération PDF")
        raise HTTPException(500, str(e))


# ─── GET /api/health ──────────────────────────────────────────────────────────

@router.get(
    "/api/health",
    summary="Santé du service",
    tags=["Système"],
)
def health() -> Dict[str, Any]:
    import numpy, scipy, pandas
    return {
        "status":    "ok",
        "version":   "2.0",
        "timestamp": now_iso(),
        "libs": {
            "numpy":   numpy.__version__,
            "scipy":   scipy.__version__,
            "pandas":  pandas.__version__,
        },
    }


# ─── GET /api/norms — Critères normatifs ─────────────────────────────────────

@router.get(
    "/api/norms",
    summary="Critères normatifs de référence",
    tags=["Système"],
)
def get_norms(
    framework: str = Query("all", description="iso5725 | ichq2 | sfstp | all")
) -> Dict[str, Any]:
    from services.validation import (
        ICH_Q2_CRITERIA, ISO_5725_CRITERIA,
        SFSTP_CRITERIA, NF_V03_110_CRITERIA
    )
    if framework == "ichq2":
        return {"framework": "ICH Q2(R1)", "criteria": ICH_Q2_CRITERIA}
    elif framework == "iso5725":
        return {"framework": "ISO 5725-2", "criteria": ISO_5725_CRITERIA}
    elif framework == "sfstp":
        return {"framework": "SFSTP/Feinberg", "criteria": SFSTP_CRITERIA}
    else:
        return {
            "iso5725":  {"framework": "ISO 5725-2",    "criteria": ISO_5725_CRITERIA},
            "ichq2":    {"framework": "ICH Q2(R1)",    "criteria": ICH_Q2_CRITERIA},
            "sfstp":    {"framework": "SFSTP/Feinberg","criteria": SFSTP_CRITERIA},
            "nf_v03":   {"framework": "NF V03-110",    "criteria": NF_V03_110_CRITERIA},
        }
