"""
================================================================
services/ai_interpretation.py — Interprétation intelligente
Moteur de règles expert + intégration LLM (Gemini / Claude)
================================================================
"""
from __future__ import annotations
import logging
import os
import re
from typing import List, Dict, Any, Optional

import httpx

logger = logging.getLogger(__name__)

# ─── Moteur de règles expert ──────────────────────────────────────────────────

def rule_based_interpretation(
    criteria:    List[Dict[str, Any]],
    tolerances:  List[Dict[str, Any]],
    outliers:    List[Dict[str, Any]],
    normality:   List[Dict[str, Any]],
    homogeneity: Optional[Dict[str, Any]],
    quality:     Optional[Dict[str, Any]],
    config:      Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    Génère des items d'interprétation basés sur des règles expertes.
    Chaque item : { severity, category, message, value, threshold }
    """
    items: List[Dict[str, Any]] = []
    lam   = config.get("lambdaVal", 0.10)
    beta  = config.get("beta", 0.80)

    # ── Statut global ─────────────────────────────────────────────────────
    n_valid = sum(1 for t in tolerances if t.get("accept", False))
    n_total = len(tolerances)

    if n_total == 0:
        items.append({
            "severity": "critical", "category": "Statut global",
            "message": "Aucun intervalle de tolérance calculé — vérifiez les données d'entrée.",
        })
        return items

    if n_valid == n_total:
        items.append({
            "severity": "success", "category": "Statut global",
            "message": (f"Méthode VALIDÉE sur les {n_total} niveaux. "
                        f"Tous les intervalles {round(beta*100)}%-expectation respectent λ=±{round(lam*100)}%."),
        })
    elif n_valid > 0:
        failed = [t["niveau"] for t in tolerances if not t.get("accept", False)]
        items.append({
            "severity": "warning", "category": "Statut global",
            "message": (f"Validation PARTIELLE : {n_valid}/{n_total} niveaux conformes. "
                        f"Niveaux hors limites : {', '.join(failed)}."),
        })
    else:
        items.append({
            "severity": "critical", "category": "Statut global",
            "message": (f"Méthode NON VALIDÉE : aucun niveau dans les limites λ=±{round(lam*100)}%. "
                        "Révision complète du protocole nécessaire."),
        })

    # ── Analyse biais ─────────────────────────────────────────────────────
    for c in criteria:
        bias = c.get("bRel", 0)
        rec  = c.get("recouvMoy", 100)
        n    = c["niveau"]

        if abs(bias) <= 1.0:
            items.append({
                "severity": "success", "category": "Justesse",
                "message":  f"Niveau {n} : biais très faible ({bias:+.2f}%), recouvrement {rec:.2f}%.",
                "value":    abs(bias), "threshold": 1.0,
            })
        elif abs(bias) <= lam * 100 * 0.5:
            items.append({
                "severity": "info", "category": "Justesse",
                "message":  f"Niveau {n} : biais modéré ({bias:+.2f}%), recouvrement {rec:.2f}% — acceptable.",
                "value":    abs(bias), "threshold": lam * 100 * 0.5,
            })
        elif abs(bias) <= lam * 100:
            items.append({
                "severity": "warning", "category": "Justesse",
                "message":  (f"Niveau {n} : biais significatif ({bias:+.2f}%). "
                             "Vérifier la pureté des étalons et la justesse de la courbe."),
                "value":    abs(bias), "threshold": lam * 100,
            })
        else:
            items.append({
                "severity": "critical", "category": "Justesse",
                "message":  (f"Niveau {n} : biais ÉLEVÉ ({bias:+.2f}%) supérieur à λ={round(lam*100)}%. "
                             "Source probable : étalonnage incorrect, effet matrice, ou contamination."),
                "value":    abs(bias), "threshold": lam * 100,
            })

    # ── Analyse fidélité ──────────────────────────────────────────────────
    for c in criteria:
        cv   = c.get("cv", 0)
        cvR  = c.get("cvR", cv)
        sB   = c.get("sB", 0)
        sr   = c.get("sr", 0)
        n    = c["niveau"]

        # CV total
        if cv <= 3.0:
            sev = "success"
            msg = f"Niveau {n} : excellente fidélité intermédiaire (CV={cv:.2f}%)."
        elif cv <= 7.0:
            sev = "info"
            msg = f"Niveau {n} : fidélité intermédiaire satisfaisante (CV={cv:.2f}%)."
        elif cv <= 15.0:
            sev = "warning"
            msg = f"Niveau {n} : fidélité intermédiaire dégradée (CV={cv:.2f}%). Investiguer variabilité jour-à-jour."
        else:
            sev = "critical"
            msg = (f"Niveau {n} : fidélité intermédiaire INACCEPTABLE (CV={cv:.2f}%). "
                   "Contrôler conditions opératoires inter-séries.")
        items.append({"severity": sev, "category": "Fidélité", "message": msg,
                      "value": cv, "threshold": 10.0})

        # Rapport sB/sr (dominance inter-séries)
        if sr > 0:
            ratio = sB / sr
            if ratio > 2.0:
                items.append({
                    "severity": "warning", "category": "Composantes de variance",
                    "message":  (f"Niveau {n} : variabilité inter-séries prédomine (sB/sr={ratio:.2f}). "
                                 "Effet jour/opérateur important — standardiser davantage le protocole."),
                    "value": ratio, "threshold": 2.0,
                })

    # ── Intervalles de tolérance ──────────────────────────────────────────
    for t in tolerances:
        if not t.get("accept", False):
            ltb = t.get("ltbRel")
            lth = t.get("lthRel")
            la_b = t.get("laBasse", 90)
            la_h = t.get("laHaute", 110)
            causes = []
            if ltb is not None and ltb < la_b:
                causes.append(f"LTB={ltb:.2f}% < {la_b}% (borne basse dépassée)")
            if lth is not None and lth > la_h:
                causes.append(f"LTH={lth:.2f}% > {la_h}% (borne haute dépassée)")
            items.append({
                "severity": "critical", "category": "Intervalle β-expectation",
                "message":  f"Niveau {t['niveau']} : intervalle hors limites — {' | '.join(causes)}.",
                "value":    t.get("errorTotal", 0), "threshold": lam * 100,
            })
        else:
            margin_b = (t.get("ltbRel", 0) or 0) - t.get("laBasse", 90)
            margin_h = t.get("laHaute", 110) - (t.get("lthRel", 0) or 0)
            min_margin = min(margin_b, margin_h)
            if min_margin < 2.0:
                items.append({
                    "severity": "warning", "category": "Intervalle β-expectation",
                    "message":  (f"Niveau {t['niveau']} : valide mais marge étroite "
                                 f"(Δ min={min_margin:.2f}%). Risque de dépassement en conditions routinières."),
                    "value": min_margin, "threshold": 2.0,
                })

    # ── Aberrants ────────────────────────────────────────────────────────
    suspects = [o for o in outliers if o.get("suspect", False)]
    if suspects:
        for o in suspects:
            items.append({
                "severity": "warning" if o.get("classification") == "suspect" else "critical",
                "category": "Aberrant (Grubbs)",
                "message":  (f"Niveau {o['niveau']} : valeur suspecte détectée "
                             f"(G={o.get('G', 0):.4f} > Gcrit={o.get('Gcrit', 0):.4f}). "
                             f"Valeur = {o.get('suspectVal', 0):.4f} — vérifier avant exclusion."),
                "value":    o.get("G", 0), "threshold": o.get("Gcrit", 0),
            })
    else:
        items.append({
            "severity": "success", "category": "Aberrant (Grubbs)",
            "message":  "Aucune valeur aberrante détectée par le test de Grubbs (α=5%).",
        })

    # ── Normalité ─────────────────────────────────────────────────────────
    non_normal = [n_ for n_ in normality if not n_.get("normal", True)]
    if non_normal:
        niveaux_str = ", ".join(n_["niveau"] for n_ in non_normal)
        items.append({
            "severity": "warning", "category": "Normalité (Shapiro-Wilk)",
            "message":  (f"Résidus non gaussiens aux niveaux {niveaux_str} "
                         "(Shapiro-Wilk p<0.05). Les intervalles β-expectation supposent la normalité."),
        })
    elif normality:
        items.append({
            "severity": "success", "category": "Normalité (Shapiro-Wilk)",
            "message":  "Résidus normalement distribués à tous les niveaux (Shapiro-Wilk p>0.05).",
        })

    # ── Homogénéité des variances ─────────────────────────────────────────
    if homogeneity and "levene" in homogeneity:
        lev = homogeneity["levene"]
        if not lev.get("homogeneous", True):
            items.append({
                "severity": "warning", "category": "Homogénéité des variances (Levene)",
                "message":  (f"Hétérogénéité des variances inter-niveaux détectée (Levene p={lev.get('p_value', 0):.4f}). "
                             "Considérer une pondération par niveau ou une transformation des données."),
                "value": lev.get("p_value", 0), "threshold": 0.05,
            })
        else:
            items.append({
                "severity": "success", "category": "Homogénéité des variances (Levene)",
                "message":  f"Variances homogènes (Levene p={lev.get('p_value', 0):.4f} > 0.05).",
            })

    # ── Score qualité ─────────────────────────────────────────────────────
    if quality:
        score = quality.get("overall", 0)
        label = quality.get("label", "")
        sev   = {"Excellent": "success", "Bon": "success", "Acceptable": "info",
                 "Insuffisant": "warning", "Critique": "critical"}.get(label, "info")
        items.append({
            "severity": sev, "category": "Score qualité",
            "message":  f"Score global de la méthode : {score:.1f}/100 ({label}).",
            "value":    score, "threshold": 75.0,
        })

    # ── Recommandations génériques ────────────────────────────────────────
    items += _generate_recommendations(criteria, tolerances, config)

    # Tri : critical → warning → info → success
    _ord = {"critical": 0, "warning": 1, "info": 2, "success": 3}
    items.sort(key=lambda x: _ord.get(x.get("severity", "info"), 2))

    return items


def _generate_recommendations(
    criteria:   List[Dict[str, Any]],
    tolerances: List[Dict[str, Any]],
    config:     Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Recommandations pratiques basées sur les résultats."""
    recs: List[Dict[str, Any]] = []
    lam  = config.get("lambdaVal", 0.10)

    # Niveaux non valides
    bad = [t for t in tolerances if not t.get("accept", False)]
    if bad:
        recs.append({
            "severity": "info", "category": "Recommandation",
            "message":  ("📋 Pour les niveaux non conformes : augmenter le nombre de séries I "
                         "(de 3 à 5) afin de réduire k_tol et resserrer les intervalles de tolérance."),
        })

    # Biais systématique
    biases = [c["bRel"] for c in criteria]
    if biases and all(b > 0 for b in biases):
        recs.append({
            "severity": "info", "category": "Recommandation",
            "message":  ("📋 Biais systématiquement positif à tous les niveaux — "
                         "vérifier la justesse de la courbe d'étalonnage et la pureté des étalons."),
        })
    elif biases and all(b < 0 for b in biases):
        recs.append({
            "severity": "info", "category": "Recommandation",
            "message":  ("📋 Biais systématiquement négatif — "
                         "vérifier les pertes lors de la préparation de l'échantillon (extraction, dilution)."),
        })

    # CV croissant avec la concentration (hétéroscédasticité)
    if len(criteria) >= 3:
        cvs = [c["cv"] for c in criteria]
        xs  = [c["xMean"] for c in criteria]
        if cvs[-1] > cvs[0] * 1.5 and xs[-1] > xs[0]:
            recs.append({
                "severity": "info", "category": "Recommandation",
                "message":  ("📋 CV croissant avec la concentration (hétéroscédasticité) — "
                             "envisager une régression pondérée (1/x² ou 1/x) pour l'étalonnage."),
            })

    return recs


# ─── Module LLM — Gemini ──────────────────────────────────────────────────────

SYSTEM_PROMPT = """Tu es un expert senior en validation analytique de méthodes chimiques.
Tu maîtrises : profil d'exactitude (Feinberg, 2010), ISO 5725-1/2, ICH Q2(R1), 
intervalles β-expectation (Mee, 1984), statistiques ANOVA, tests de Grubbs, 
normes SFSTP et ISO 17025.

Tes réponses sont :
- En français, précises, structurées, actionnables
- Chiffrées (tu utilises les valeurs numériques fournies)
- Indépendantes de toute marque de logiciel
Tu utilises la notation standard : β, λ, σ, X̄, Z̄, sr, sB, sFI, k_tol, LTB, LTH."""


async def llm_interpret_gemini(
    analysis_data: Dict[str, Any],
    config:        Dict[str, Any],
    api_key:       str,
    prompt_type:   str = "full",
) -> str:
    """
    Appelle l'API Gemini pour une interprétation IA du profil.

    prompt_type : "full" | "profile" | "outliers" | "recommendations" | "chat"
    """
    endpoint = (
        "https://generativelanguage.googleapis.com/v1beta/"
        "models/gemini-2.5-flash-lite:generateContent"
    )

    user_content = _build_llm_prompt(analysis_data, config, prompt_type)

    payload = {
        "contents": [
            {"role": "user", "parts": [{"text": f"{SYSTEM_PROMPT}\n\n{user_content}"}]}
        ],
        "generationConfig": {
            "maxOutputTokens": 2048,
            "temperature": 0.30,
        },
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{endpoint}?key={api_key}",
            json=payload,
            headers={"Content-Type": "application/json"},
        )

    if not resp.is_success:
        err = resp.json().get("error", {}).get("message", f"HTTP {resp.status_code}")
        raise ValueError(f"Gemini API error: {err}")

    data = resp.json()
    text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    return text.strip()


async def llm_interpret_claude(
    analysis_data: Dict[str, Any],
    config:        Dict[str, Any],
    api_key:       str,
    prompt_type:   str = "full",
) -> str:
    """
    Appelle l'API Claude (Anthropic) pour interprétation.
    """
    endpoint = "https://api.anthropic.com/v1/messages"
    user_content = _build_llm_prompt(analysis_data, config, prompt_type)

    payload = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 2048,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_content}],
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            endpoint,
            json=payload,
            headers={
                "x-api-key":       os.getenv("CLAUDE_API_KEY", api_key),
                "anthropic-version": "2023-06-01",
                "content-type":    "application/json",
            },
        )

    if not resp.is_success:
        err = resp.json().get("error", {}).get("message", f"HTTP {resp.status_code}")
        raise ValueError(f"Claude API error: {err}")

    data = resp.json()
    text = data.get("content", [{}])[0].get("text", "")
    return text.strip()


def _build_llm_prompt(
    data:        Dict[str, Any],
    config:      Dict[str, Any],
    prompt_type: str,
) -> str:
    """Construit le prompt adapté au type d'analyse demandé."""
    beta    = round(config.get("beta", 0.80) * 100)
    lam     = round(config.get("lambdaVal", 0.10) * 100)
    unite   = config.get("unite", "")
    methode = config.get("methode", "—")

    criteria   = data.get("criteria",   [])
    tolerances = data.get("tolerances", [])
    outliers   = data.get("outliers",   [])
    validity   = data.get("validity",   {})

    crit_str = "\n".join(
        f"  Niveau {c['niveau']} (X̄={c['xMean']:.4f} {unite}): "
        f"sr={c['sr']:.4f} | sB={c.get('sB', 0):.4f} | sFI={c['sFI']:.4f} | "
        f"CV={c['cv']:.2f}% | Biais={c['bRel']:+.2f}% | Récouv.={c['recouvMoy']:.2f}%"
        for c in criteria
    )
    tol_str = "\n".join(
        f"  Niveau {t['niveau']}: LTB={t.get('ltbRel', 0):.2f}% | LTH={t.get('lthRel', 0):.2f}% "
        f"| LA=[{t['laBasse']:.1f}%–{t['laHaute']:.1f}%] → {'VALIDE ✓' if t['accept'] else 'NON VALIDE ✗'}"
        for t in tolerances
    )
    out_str = "\n".join(
        f"  Niveau {o['niveau']}: G={o.get('G', 0):.4f} / Gcrit={o.get('Gcrit', 0):.4f} "
        f"→ {o.get('classification', 'ok').upper()}"
        for o in outliers
    )

    header = (
        f"MÉTHODE : {methode}\n"
        f"Paramètres : β={beta}%, λ=±{lam}% | Validité : "
        f"{validity.get('nValid', 0)}/{validity.get('nTotal', 0)} niveaux ({validity.get('pct', 0):.0f}%)\n\n"
        f"CRITÈRES ISO 5725-2 :\n{crit_str}\n\n"
        f"INTERVALLES β-EXPECTATION :\n{tol_str}\n\n"
        f"TEST DE GRUBBS :\n{out_str}\n\n"
    )

    prompts = {
        "full": (
            header +
            "Produis un rapport complet structuré avec :\n"
            "1. **Statut global** de validation (valide/partiel/non valide) justifié numériquement\n"
            "2. **Fidélité** : analyse de sr, sB, sFI et CV par niveau\n"
            "3. **Justesse** : interprétation du biais et du taux de recouvrement\n"
            "4. **Domaine de validité** : concentrations min/max validées\n"
            "5. **Causes probables** des non-conformités (si applicable)\n"
            "6. **Recommandations** : 3–5 actions concrètes et chiffrées\n"
            "7. **Conformité** ISO 5725-2 et ICH Q2(R1)"
        ),
        "profile": (
            header +
            "Interprète le profil d'exactitude :\n"
            "1. **Lecture graphique** : tendance générale et zones critiques\n"
            "2. **Analyse statistique** : intervalles trop larges et leurs causes\n"
            "3. **Impact pratique** sur l'usage routinier\n"
            "4. **Concentration critique** à partir de laquelle la méthode devient risquée"
        ),
        "outliers": (
            header +
            "Analyse approfondie des valeurs aberrantes :\n"
            "1. **Interprétation statistique** de chaque résultat Grubbs\n"
            "2. **Causes analytiques probables** des valeurs suspectes\n"
            "3. **Décision** : inclure ou exclure avec justification\n"
            "4. **Impact** de l'exclusion sur les critères de fidélité\n"
            "5. **Actions correctives** recommandées"
        ),
        "recommendations": (
            header +
            "Plan d'amélioration détaillé :\n"
            "1. **Optimisation de la fidélité** (réduire sr et sB aux niveaux critiques)\n"
            "2. **Correction du biais** systématique\n"
            "3. **Extension du domaine** de validité\n"
            "4. **Amélioration de l'étalonnage** (si méthode indirecte)\n"
            "5. **Plan d'expériences complémentaires** (nouveaux niveaux, répétitions)"
        ),
        "chat": header + "Réponds de manière concise et pédagogique.",
    }

    return prompts.get(prompt_type, prompts["full"])


async def get_ai_interpretation(
    analysis_data: Dict[str, Any],
    config:        Dict[str, Any],
    api_key:       Optional[str],
    provider:      str = "auto",
    prompt_type:   str = "full",
) -> str:
    """
    Point d'entrée unifié pour l'interprétation IA.
    Essaie Gemini puis Claude selon le provider choisi.
    Retombe sur le moteur de règles si pas de clé API.
    """
    if not api_key:
        # Pas de clé : moteur de règles uniquement
        rules = rule_based_interpretation(
            criteria    = analysis_data.get("criteria",    []),
            tolerances  = analysis_data.get("tolerances",  []),
            outliers    = analysis_data.get("outliers",    []),
            normality   = analysis_data.get("normality",   []),
            homogeneity = analysis_data.get("homogeneity"),
            quality     = analysis_data.get("qualityScore"),
            config      = config,
        )
        return _items_to_text(rules)

    try:
        if provider in ("gemini", "auto"):
            return await llm_interpret_gemini(analysis_data, config, api_key, prompt_type)
        elif provider == "claude":
            return await llm_interpret_claude(analysis_data, config, api_key, prompt_type)
    except Exception as e:
        logger.warning("LLM failed (%s), falling back to rules: %s", provider, e)
        rules = rule_based_interpretation(
            criteria    = analysis_data.get("criteria",    []),
            tolerances  = analysis_data.get("tolerances",  []),
            outliers    = analysis_data.get("outliers",    []),
            normality   = analysis_data.get("normality",   []),
            homogeneity = analysis_data.get("homogeneity"),
            quality     = analysis_data.get("qualityScore"),
            config      = config,
        )
        return _items_to_text(rules) + f"\n\n⚠ Note : {e}"

    return ""


def _items_to_text(items: List[Dict[str, Any]]) -> str:
    """Convertit les items d'interprétation en texte lisible."""
    icons = {"success": "✓", "info": "ℹ", "warning": "⚠", "critical": "✗"}
    lines = []
    for item in items:
        icon = icons.get(item.get("severity", "info"), "•")
        cat  = item.get("category", "")
        msg  = item.get("message", "")
        lines.append(f"{icon} [{cat}] {msg}")
    return "\n".join(lines)
