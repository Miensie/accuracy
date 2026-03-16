"""
================================================================
backend/main.py — API FastAPI optionnelle
Calculs lourds côté serveur (grands jeux de données, ML)
================================================================
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import numpy as np
from scipy import stats

app = FastAPI(
    title="Accuracy Profile API",
    description="Backend de calcul statistique pour la validation analytique",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Modèles Pydantic ──────────────────────────────────────────────────────────

class ValidationRow(BaseModel):
    niveau: str
    serie: str
    rep: int
    xRef: float
    yResponse: float

class EtalonnageRow(BaseModel):
    serie: str
    niveau: str
    rep: int
    xEtalon: float
    yResponse: float

class AnalysisRequest(BaseModel):
    planValidation: List[ValidationRow]
    planEtalonnage: Optional[List[EtalonnageRow]] = []
    methodType: str = "indirect"
    modelType: str = "linear"
    beta: float = 0.80
    lambdaVal: float = 0.10
    alpha: float = 0.05

# ─── Fonctions statistiques ────────────────────────────────────────────────────

def linear_regression(x: np.ndarray, y: np.ndarray):
    """Régression linéaire par moindres carrés."""
    n = len(x)
    if n < 2:
        return {"a0": 0.0, "a1": 0.0, "r2": 0.0, "r": 0.0}
    
    slope, intercept, r, p, se = stats.linregress(x, y)
    return {
        "a0": float(intercept),
        "a1": float(slope),
        "r2": float(r**2),
        "r":  float(r),
        "n":  n
    }

def t_quantile(nu: float, p: float) -> float:
    """Quantile de la distribution t de Student."""
    if nu <= 0: return float("inf")
    return float(stats.t.ppf(p, df=nu))

def compute_calibration_models(etalonnage_rows: List[EtalonnageRow], model_type: str = "linear"):
    """Calcule les modèles d'étalonnage par série."""
    from collections import defaultdict
    by_serie = defaultdict(lambda: {"x": [], "y": []})
    
    for row in etalonnage_rows:
        by_serie[row.serie]["x"].append(row.xEtalon)
        by_serie[row.serie]["y"].append(row.yResponse)
    
    models = {}
    for serie, data in by_serie.items():
        x = np.array(data["x"])
        y = np.array(data["y"])
        if model_type == "origin":
            a1 = np.dot(x, y) / np.dot(x, x) if np.dot(x, x) != 0 else 0
            y_pred = a1 * x
            ss_res = np.sum((y - y_pred) ** 2)
            ss_tot = np.sum((y - np.mean(y)) ** 2)
            r2 = 1 - ss_res / ss_tot if ss_tot != 0 else 1.0
            models[serie] = {"a0": 0.0, "a1": float(a1), "r2": float(r2), "r": float(np.sqrt(max(0, r2))), "n": len(x), "type": model_type}
        else:
            models[serie] = linear_regression(x, y)
            models[serie]["type"] = model_type
    
    return models

def compute_found_concentrations(validation_rows: List[ValidationRow], models: dict, method_type: str):
    """Calcule les concentrations retrouvées par prédiction inverse."""
    result = []
    for row in validation_rows:
        x_ref = row.xRef
        if method_type == "direct":
            z = row.yResponse
        else:
            m = models.get(row.serie)
            if m is None or abs(m["a1"]) < 1e-14:
                continue
            z = (row.yResponse - m["a0"]) / m["a1"]
        
        b_abs = z - x_ref
        b_rel = (b_abs / x_ref) * 100 if x_ref != 0 else None
        result.append({
            "niveau": row.niveau, "serie": row.serie, "rep": row.rep,
            "xRef": x_ref, "zRetrouvee": z, "bAbs": b_abs, "bRel": b_rel
        })
    return result

def compute_criteria(found: list):
    """Calcule les critères ISO 5725-2 par niveau."""
    from collections import defaultdict
    by_niveau = defaultdict(list)
    for r in found:
        by_niveau[r["niveau"]].append(r)
    
    criteria = []
    for niveau, rows in by_niveau.items():
        by_serie = defaultdict(list)
        for r in rows:
            by_serie[r["serie"]].append(r)
        
        series = list(by_serie.values())
        I = len(series)
        J = len(series[0])
        N = I * J
        
        x_mean = np.mean([r["xRef"] for r in rows])
        z_mean = np.mean([r["zRetrouvee"] for r in rows])
        serie_means = [np.mean([r["zRetrouvee"] for r in s]) for s in series]
        
        # SCEr et SCEB
        sce_r = sum((r["zRetrouvee"] - serie_means[i]) ** 2
                    for i, s in enumerate(series) for r in s)
        sce_b = sum(J * (zm - z_mean) ** 2 for zm in serie_means)
        
        sr2 = sce_r / (I * (J - 1)) if I * (J - 1) > 0 else 0
        sb2 = max(0, sce_b / (I - 1) - sr2 / J) if (I - 1) > 0 else 0
        sfi2 = sr2 + sb2
        
        sr, sb, sfi = np.sqrt(sr2), np.sqrt(sb2), np.sqrt(sfi2)
        cv = (sfi / abs(z_mean)) * 100 if z_mean != 0 else 0
        bias_abs = z_mean - x_mean
        bias_rel = (bias_abs / x_mean) * 100 if x_mean != 0 else 0
        recouv = (z_mean / x_mean) * 100 if x_mean != 0 else 0
        
        criteria.append({
            "niveau": niveau, "xMean": float(x_mean), "zMean": float(z_mean),
            "sr": float(sr), "sB": float(sb), "sFI": float(sfi),
            "cv": float(cv), "biasMoy": float(bias_abs), "bRel": float(bias_rel),
            "recouvMoy": float(recouv),
            "Sr2": float(sr2), "SB2": float(sb2), "SFI2": float(sfi2),
            "I": I, "J": J, "N": N
        })
    
    criteria.sort(key=lambda c: c["xMean"])
    return criteria

def compute_tolerance_intervals(criteria: list, beta: float, lambda_val: float):
    """Calcule les intervalles β-expectation selon Mee (1984)."""
    result = []
    for c in criteria:
        I, J = c["I"], c["J"]
        sr2, sb2, sfi2 = c["Sr2"], c["SB2"], c["SFI2"]
        sfi = np.sqrt(sfi2)
        z_mean, x_mean = c["zMean"], c["xMean"]
        
        R = sb2 / sr2 if sr2 > 0 else 0
        B = np.sqrt((R + 1) / (J * R + 1)) if (J * R + 1) != 0 else 1
        
        denom = I * J * B ** 2
        s_it = sfi * np.sqrt(1 + (1 / denom if denom > 0 else 0))
        
        # Degrés de liberté
        num_nu = (R + 1) ** 2
        den_nu = ((R + 1/J) ** 2) / (I - 1) + (1 - 1/J) / (I * J)
        nu = round(num_nu / den_nu) if den_nu > 0 else I * J * (J - 1)
        nu = max(1, nu)
        
        p_student = (1 + beta) / 2
        k_tol = abs(t_quantile(nu, p_student))
        
        ltb_abs = z_mean - k_tol * s_it
        lth_abs = z_mean + k_tol * s_it
        ltb_rel = (ltb_abs / x_mean) * 100 if x_mean != 0 else None
        lth_rel = (lth_abs / x_mean) * 100 if x_mean != 0 else None
        recouv_rel = (z_mean / x_mean) * 100 if x_mean != 0 else 100
        
        la_basse = (1 - lambda_val) * 100
        la_haute = (1 + lambda_val) * 100
        
        accept = (ltb_rel is not None and lth_rel is not None
                  and ltb_rel >= la_basse and lth_rel <= la_haute)
        
        result.append({
            "niveau": c["niveau"], "xMean": float(x_mean), "zMean": float(z_mean),
            "recouvRel": float(recouv_rel), "sIT": float(s_it),
            "ktol": float(k_tol), "nu": int(nu), "R": float(R),
            "ltbAbs": float(ltb_abs), "lthAbs": float(lth_abs),
            "ltbRel": float(ltb_rel) if ltb_rel else None,
            "lthRel": float(lth_rel) if lth_rel else None,
            "laBasse": float(la_basse), "laHaute": float(la_haute),
            "accept": bool(accept)
        })
    
    return result

# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"service": "Accuracy Profile API", "version": "1.0.0", "status": "ok"}

@app.post("/api/analyze")
def analyze(req: AnalysisRequest):
    """Calcul complet du profil d'exactitude."""
    try:
        models = {}
        if req.methodType == "indirect" and req.planEtalonnage:
            models = compute_calibration_models(req.planEtalonnage, req.modelType)
        
        found     = compute_found_concentrations(req.planValidation, models, req.methodType)
        criteria  = compute_criteria(found)
        tolerances = compute_tolerance_intervals(criteria, req.beta, req.lambdaVal)
        
        n_valid   = sum(1 for t in tolerances if t["accept"])
        n_total   = len(tolerances)
        
        return {
            "status": "ok",
            "models": models,
            "found": found[:50],  # Limiter pour la réponse
            "criteria": criteria,
            "tolerances": tolerances,
            "validity": {
                "valid": n_valid == n_total,
                "partial": 0 < n_valid < n_total,
                "invalid": n_valid == 0,
                "nValid": n_valid, "nTotal": n_total,
                "pct": round(n_valid / n_total * 100) if n_total > 0 else 0
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/grubbs")
def grubbs_test_endpoint(data: List[float], alpha: float = 0.05):
    """Test de Grubbs pour la détection des aberrants."""
    n = len(data)
    if n < 3:
        raise HTTPException(status_code=400, detail="Minimum 3 valeurs requises")
    
    arr  = np.array(data)
    mean = float(np.mean(arr))
    std  = float(np.std(arr, ddof=1))
    
    if std == 0:
        return {"G": 0.0, "Gcrit": float("inf"), "suspect": False}
    
    G_vals = np.abs(arr - mean) / std
    G      = float(np.max(G_vals))
    idx    = int(np.argmax(G_vals))
    
    t_crit = stats.t.ppf(1 - alpha / (2 * n), df=n - 2)
    G_crit = ((n - 1) / np.sqrt(n)) * np.sqrt(t_crit**2 / (n - 2 + t_crit**2))
    
    return {
        "G": round(G, 4), "Gcrit": round(float(G_crit), 4),
        "suspect": bool(G > G_crit),
        "suspectIdx": idx, "suspectVal": float(arr[idx]),
        "mean": round(mean, 6), "std": round(std, 6)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
