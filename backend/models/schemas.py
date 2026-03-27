"""
================================================================
models/schemas.py — Modèles Pydantic (validation + sérialisation)
Typage strict pour toutes les entrées/sorties de l'API.
================================================================
"""
from __future__ import annotations
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import List, Optional, Dict, Any, Literal
from enum import Enum


# ─── Enums ────────────────────────────────────────────────────────────────────

class MethodType(str, Enum):
    indirect = "indirect"   # Méthode avec courbe d'étalonnage
    direct   = "direct"     # Méthode sans étalonnage (gravimétrie, titrimétrie…)

class ModelType(str, Enum):
    linear = "linear"       # y = a0 + a1·x
    origin = "origin"       # y = a1·x (passage par l'origine)
    quad   = "quad"         # y = a0 + a1·x + a2·x²

class NormativeFramework(str, Enum):
    iso5725  = "iso5725"    # ISO 5725-2 (justesse et fidélité)
    ichq2    = "ichq2"      # ICH Q2(R1) (pharmaceutique)
    nf_v03   = "nf_v03"     # NF V03-110 (agroalimentaire)
    sfstp    = "sfstp"      # SFSTP / Feinberg


# ─── Lignes de données brutes ─────────────────────────────────────────────────

class ValidationRow(BaseModel):
    """Une mesure du plan de validation."""
    niveau:    str   = Field(..., description="Code du niveau de concentration (ex : 'A', 'N1')")
    serie:     str   = Field(..., description="Identifiant de la série / jour")
    rep:       int   = Field(..., ge=1, description="Numéro de répétition")
    xRef:      float = Field(..., description="Concentration de référence")
    yResponse: float = Field(..., description="Réponse instrumentale brute")

    @field_validator("xRef")
    @classmethod
    def xref_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("xRef doit être strictement positif")
        return v


class EtalonnageRow(BaseModel):
    """Une mesure du plan d'étalonnage."""
    serie:     str   = Field(..., description="Identifiant de la série")
    niveau:    str   = Field(..., description="Code du niveau étalon")
    rep:       int   = Field(..., ge=1)
    xEtalon:   float = Field(..., gt=0, description="Concentration de l'étalon")
    yResponse: float = Field(..., description="Réponse instrumentale")


class SimpleDataRow(BaseModel):
    """Format simplifié pour les appels rapides (compatibilité)."""
    concentration: float = Field(..., gt=0)
    replicate:     int   = Field(..., ge=1)
    measured:      float
    reference:     float = Field(..., gt=0)


# ─── Configuration générale ───────────────────────────────────────────────────

class ValidationConfig(BaseModel):
    methode:    Optional[str]  = Field(None, description="Nom de la méthode analytique")
    materiau:   Optional[str]  = Field(None, description="Matériau / analyte étudié")
    unite:      Optional[str]  = Field("", description="Unité de concentration")
    methodType: MethodType     = Field(MethodType.indirect)
    modelType:  ModelType      = Field(ModelType.linear)
    beta:       float          = Field(0.80, ge=0.5,  le=0.99,  description="Proportion β (tolérance)")
    lambdaVal:  float          = Field(0.10, ge=0.001, le=0.50,  description="Limite d'acceptabilité λ")
    alpha:      float          = Field(0.05, ge=0.01,  le=0.20,  description="Risque de 1ère espèce α")
    framework:  NormativeFramework = Field(NormativeFramework.iso5725)
    laboratoire: Optional[str] = None
    analyste:    Optional[str] = None
    reference:   Optional[str] = None


# ─── Requêtes principales ─────────────────────────────────────────────────────

class AnalysisRequest(BaseModel):
    """Requête complète pour l'analyse du profil d'exactitude."""
    planValidation: List[ValidationRow]             = Field(..., min_length=6)
    planEtalonnage: Optional[List[EtalonnageRow]]  = Field(default_factory=list)
    config:         ValidationConfig               = Field(default_factory=ValidationConfig)

    # Rétrocompatibilité avec l'ancien format (champs à la racine)
    methodType: Optional[MethodType] = None
    modelType:  Optional[ModelType]  = None
    beta:       Optional[float]      = None
    lambdaVal:  Optional[float]      = None
    alpha:      Optional[float]      = None

    @model_validator(mode="after")
    def merge_legacy_fields(self) -> "AnalysisRequest":
        """Fusionne les champs racine (legacy) dans config si présents."""
        if self.methodType is not None:
            self.config.methodType = self.methodType
        if self.modelType is not None:
            self.config.modelType = self.modelType
        if self.beta is not None:
            self.config.beta = self.beta
        if self.lambdaVal is not None:
            self.config.lambdaVal = self.lambdaVal
        if self.alpha is not None:
            self.config.alpha = self.alpha
        return self

    @model_validator(mode="after")
    def validate_indirect(self) -> "AnalysisRequest":
        if (self.config.methodType == MethodType.indirect
                and not self.planEtalonnage):
            raise ValueError(
                "planEtalonnage requis pour une méthode indirecte. "
                "Utilisez methodType='direct' pour une méthode sans étalonnage."
            )
        return self


class SimpleAnalysisRequest(BaseModel):
    """Requête simplifiée (format générique)."""
    data:       List[SimpleDataRow]
    config:     ValidationConfig = Field(default_factory=ValidationConfig)


class GrubbsRequest(BaseModel):
    """Requête test de Grubbs."""
    data:  List[float] = Field(..., min_length=3)
    alpha: float       = Field(0.05, ge=0.01, le=0.20)


class ChatRequest(BaseModel):
    """Requête pour le chat IA."""
    message:  str
    context:  Optional[Dict[str, Any]] = None
    history:  Optional[List[Dict[str, str]]] = Field(default_factory=list)
    api_key:  Optional[str] = None
    provider: Literal["gemini", "claude", "auto"] = "auto"


# ─── Résultats statistiques ───────────────────────────────────────────────────

class BasicStats(BaseModel):
    n:          int
    mean:       float
    median:     float
    std:        float
    variance:   float
    cv:         float          # Coefficient de variation (%)
    min:        float
    max:        float
    range:      float
    ci_low:     float          # Borne basse IC 95%
    ci_high:    float          # Borne haute IC 95%
    sem:        float          # Erreur standard de la moyenne


class CalibrationModel(BaseModel):
    serie:   str
    a0:      float             # Ordonnée à l'origine
    a1:      float             # Pente
    a2:      Optional[float] = None   # Terme quadratique
    r2:      float
    r:       float
    n:       int
    modelType: str
    residuals: Optional[List[float]] = None
    rmse:    Optional[float] = None
    sey:     Optional[float] = None   # Écart-type résiduel


class CriteriaLevel(BaseModel):
    """Critères de justesse et fidélité par niveau (ISO 5725-2)."""
    niveau:    str
    xMean:     float
    zMean:     float
    Sr2:       float
    SB2:       float
    SFI2:      float
    sr:        float           # Écart-type de répétabilité
    sB:        float           # Écart-type inter-séries
    sFI:       float           # Écart-type de fidélité intermédiaire
    cv:        float           # CV fidélité intermédiaire (%)
    cvR:       float           # CV répétabilité (%)
    biasMoy:   float           # Biais absolu moyen
    bRel:      float           # Biais relatif (%)
    recouvMoy: float           # Taux de recouvrement (%)
    I:         int
    J:         int
    N:         int
    shapiro_p: Optional[float] = None
    shapiro_normal: Optional[bool] = None


class ToleranceInterval(BaseModel):
    """Intervalle β-expectation (Mee, 1984)."""
    niveau:    str
    xMean:     float
    zMean:     float
    recouvRel: float
    sIT:       float
    ktol:      float
    nu:        int
    R:         float
    ltbAbs:    float
    lthAbs:    float
    ltbRel:    Optional[float]
    lthRel:    Optional[float]
    laBasse:   float
    laHaute:   float
    accept:    bool
    errorTotal: Optional[float] = None   # Erreur totale = |biais%| + k·sFI%


class GrubbsResult(BaseModel):
    niveau:     str
    n:          int
    xMean:      float
    G:          float
    Gcrit:      float
    suspect:    bool
    suspectIdx: Optional[int]  = None
    suspectVal: Optional[float] = None
    mean:       float
    std:        float
    classification: Literal["ok", "suspect", "aberrant"] = "ok"


class ValidityResult(BaseModel):
    valid:   bool
    partial: bool
    invalid: bool
    nValid:  int
    nTotal:  int
    pct:     float
    validDomain: Optional[Dict[str, Any]] = None  # Domaine de concentrations validé


class HomogeneityResult(BaseModel):
    test:    str               # "levene" ou "bartlett"
    stat:    float
    p_value: float
    homogeneous: bool          # p > alpha → variances homogènes


class NormalityResult(BaseModel):
    niveau:  str
    stat:    float
    p_value: float
    normal:  bool


class QualityScore(BaseModel):
    """Score de qualité de la méthode (0–100)."""
    overall:      float
    justesse:     float
    fidelite:     float
    profil:       float
    normalite:    float
    homogeneite:  float
    label:        Literal["Excellent", "Bon", "Acceptable", "Insuffisant", "Critique"]
    details:      List[str]


class InterpretationItem(BaseModel):
    severity:  Literal["info", "warning", "critical", "success"]
    category:  str
    message:   str
    value:     Optional[float] = None
    threshold: Optional[float] = None


class ChartData(BaseModel):
    """Données graphiques encodées en base64 (PNG) ou JSON Plotly."""
    profile:     Optional[str] = None  # Profil d'exactitude
    calibration: Optional[str] = None  # Courbe d'étalonnage
    residuals:   Optional[str] = None  # Graphique des résidus
    anova:       Optional[str] = None  # Décomposition de la variance
    format:      str = "png_base64"


# ─── Réponse principale ───────────────────────────────────────────────────────

class AnalysisResponse(BaseModel):
    """Réponse complète du profil d'exactitude."""
    status:         str = "ok"
    version:        str = "2.0"

    # Données intermédiaires
    models:         Optional[Dict[str, Any]]    = None
    found:          Optional[List[Dict[str, Any]]] = None

    # Résultats statistiques
    statistics:     Optional[Dict[str, Any]]    = None
    criteria:       List[CriteriaLevel]         = Field(default_factory=list)
    tolerances:     List[ToleranceInterval]     = Field(default_factory=list)
    outliers:       List[GrubbsResult]          = Field(default_factory=list)

    # Tests statistiques
    normality:      List[NormalityResult]       = Field(default_factory=list)
    homogeneity:    Optional[HomogeneityResult] = None

    # Synthèse
    validity:       Optional[ValidityResult]    = None
    qualityScore:   Optional[QualityScore]      = None
    interpretation: List[InterpretationItem]    = Field(default_factory=list)

    # Graphiques
    charts:         Optional[ChartData]         = None

    # Métadonnées
    meta:           Optional[Dict[str, Any]]    = None
