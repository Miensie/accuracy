"""
================================================================
utils/helpers.py — Fonctions utilitaires transversales
Graphiques, formatage, encodage base64, export PDF
================================================================
"""
from __future__ import annotations
import io
import base64
import datetime
import logging
from typing import List, Dict, Any, Optional

import numpy as np
import matplotlib
matplotlib.use("Agg")  # Backend non-interactif pour serveur
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.ticker import AutoMinorLocator
import plotly.graph_objects as go
import plotly.io as pio

logger = logging.getLogger(__name__)

# ─── Palette graphique (cohérente avec le CSS du frontend) ────────────────────

PALETTE = {
    "navy":    "#0B1929",
    "amber":   "#F5A623",
    "valid":   "#22C55E",
    "invalid": "#EF4444",
    "warning": "#F59E0B",
    "info":    "#3B82F6",
    "grey":    "#8BA3BE",
    "bg":      "#F8F9FC",
}

# ─── Helpers base64 ───────────────────────────────────────────────────────────

def fig_to_base64(fig: plt.Figure, dpi: int = 150) -> str:
    """Convertit une figure matplotlib en PNG base64."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=dpi, bbox_inches="tight",
                facecolor=PALETTE["bg"], edgecolor="none")
    buf.seek(0)
    encoded = base64.b64encode(buf.read()).decode("utf-8")
    plt.close(fig)
    return f"data:image/png;base64,{encoded}"


def plotly_to_base64(fig: go.Figure) -> str:
    """Convertit une figure Plotly en PNG base64 (nécessite kaleido)."""
    try:
        img_bytes = pio.to_image(fig, format="png", width=800, height=500, scale=2)
        encoded = base64.b64encode(img_bytes).decode("utf-8")
        return f"data:image/png;base64,{encoded}"
    except Exception as e:
        logger.warning(f"plotly_to_base64 failed ({e}), falling back to JSON")
        return fig.to_json()


def plotly_to_json(fig: go.Figure) -> str:
    """Sérialise une figure Plotly en JSON (pour rendu côté client)."""
    return fig.to_json()


# ─── Graphique — Profil d'exactitude ─────────────────────────────────────────

def plot_accuracy_profile(
    tolerances: List[Dict[str, Any]],
    config: Dict[str, Any],
    return_format: str = "png_base64"
) -> str:
    """
    Génère le profil d'exactitude (intervalles β-expectation vs limites λ).

    Parameters
    ----------
    tolerances : list de dict (sortie compute_tolerance_intervals)
    config     : dict avec beta, lambda, unite
    return_format : "png_base64" | "plotly_json"
    """
    x_vals    = [t["xMean"]    for t in tolerances]
    recouv    = [t["recouvRel"] for t in tolerances]
    ltb       = [t["ltbRel"]   for t in tolerances]
    lth       = [t["lthRel"]   for t in tolerances]
    la_basse  = tolerances[0]["laBasse"] if tolerances else 90.0
    la_haute  = tolerances[0]["laHaute"] if tolerances else 110.0
    beta_pct  = round(config.get("beta", 0.80) * 100)
    lam_pct   = round(config.get("lambdaVal", 0.10) * 100)
    unite     = config.get("unite", "")

    if return_format == "plotly_json":
        return _profile_plotly(x_vals, recouv, ltb, lth, la_basse, la_haute,
                               beta_pct, lam_pct, unite)

    # ── Matplotlib ────────────────────────────────────────────────────────────
    fig, ax = plt.subplots(figsize=(9, 5))
    fig.patch.set_facecolor(PALETTE["bg"])
    ax.set_facecolor(PALETTE["bg"])

    # Zone d'acceptabilité
    ax.axhspan(la_basse, la_haute, color=PALETTE["valid"], alpha=0.10, zorder=0,
               label=f"Zone acceptable [±{lam_pct}%]")
    ax.axhline(la_basse, color=PALETTE["valid"], lw=1.5, ls="--", zorder=1)
    ax.axhline(la_haute, color=PALETTE["valid"], lw=1.5, ls="--", zorder=1)
    ax.axhline(100, color=PALETTE["navy"], lw=1.0, ls=":", alpha=0.4, zorder=1)

    # Intervalles de tolérance (zone LTB–LTH)
    if all(v is not None for v in ltb + lth):
        ax.fill_between(x_vals, ltb, lth, color=PALETTE["amber"], alpha=0.18,
                        zorder=2, label=f"Intervalle {beta_pct}%-expectation")
        ax.plot(x_vals, ltb, color=PALETTE["amber"], lw=2, marker="o",
                markersize=5, zorder=3)
        ax.plot(x_vals, lth, color=PALETTE["amber"], lw=2, marker="o",
                markersize=5, zorder=3)

    # Taux de recouvrement moyen
    colors = [PALETTE["valid"] if t["accept"] else PALETTE["invalid"]
              for t in tolerances]
    ax.plot(x_vals, recouv, color=PALETTE["navy"], lw=2, zorder=4,
            label="Recouvrement moyen (%)")
    ax.scatter(x_vals, recouv, c=colors, s=60, zorder=5, edgecolors="white", lw=0.8)

    # Axes et titres
    ax.set_xlabel(f"Concentration de référence ({unite})" if unite else "Concentration de référence",
                  fontsize=10, color=PALETTE["navy"])
    ax.set_ylabel("Recouvrement / Intervalle (%)", fontsize=10, color=PALETTE["navy"])
    ax.set_title("Profil d'exactitude — Intervalles β-expectation (Mee, 1984)",
                 fontsize=11, fontweight="bold", color=PALETTE["navy"], pad=12)

    # Y limits avec marge
    all_vals = [v for v in ltb + lth + recouv if v is not None]
    y_min = min(all_vals + [la_basse]) - 3
    y_max = max(all_vals + [la_haute]) + 3
    ax.set_ylim(y_min, y_max)

    ax.xaxis.set_minor_locator(AutoMinorLocator())
    ax.yaxis.set_minor_locator(AutoMinorLocator())
    ax.grid(True, which="major", ls=":", lw=0.6, color=PALETTE["grey"], alpha=0.4)
    ax.tick_params(labelsize=9, colors=PALETTE["navy"])
    for spine in ax.spines.values():
        spine.set_edgecolor(PALETTE["grey"])
        spine.set_linewidth(0.7)

    ax.legend(fontsize=8, framealpha=0.8, loc="upper right")
    fig.tight_layout()

    return fig_to_base64(fig)


def _profile_plotly(x_vals, recouv, ltb, lth, la_basse, la_haute,
                    beta_pct, lam_pct, unite) -> str:
    fig = go.Figure()
    x_str = [str(round(x, 4)) for x in x_vals]

    fig.add_hrect(y0=la_basse, y1=la_haute, fillcolor="#22C55E",
                  opacity=0.1, line_width=0, annotation_text=f"±{lam_pct}%")

    if all(v is not None for v in ltb + lth):
        fig.add_trace(go.Scatter(
            x=x_vals + x_vals[::-1], y=lth + ltb[::-1],
            fill="toself", fillcolor="rgba(245,166,35,0.15)",
            line=dict(color="rgba(0,0,0,0)"),
            name=f"Intervalle {beta_pct}%-expectation"
        ))
        fig.add_trace(go.Scatter(x=x_vals, y=ltb, line=dict(color="#F5A623", width=2),
                                 mode="lines+markers", name="LTB"))
        fig.add_trace(go.Scatter(x=x_vals, y=lth, line=dict(color="#F5A623", width=2),
                                 mode="lines+markers", name="LTH"))

    fig.add_trace(go.Scatter(x=x_vals, y=recouv, line=dict(color="#0B1929", width=2.5),
                             mode="lines+markers", name="Recouvrement (%)"))
    fig.add_hline(y=100, line_dash="dot", line_color="#0B1929", opacity=0.4)

    fig.update_layout(
        title="Profil d'exactitude — Intervalles β-expectation",
        xaxis_title=f"Concentration ({unite})" if unite else "Concentration",
        yaxis_title="Recouvrement / Intervalle (%)",
        template="simple_white",
        legend=dict(orientation="h", yanchor="bottom", y=1.02),
        height=420,
    )
    return plotly_to_json(fig)


# ─── Graphique — Courbe d'étalonnage ─────────────────────────────────────────

def plot_calibration(
    x_data: List[float],
    y_data: List[float],
    model: Dict[str, Any],
    serie: str = "",
    unite: str = ""
) -> str:
    """Génère la courbe d'étalonnage avec droite ajustée et résidus."""
    x = np.array(x_data)
    y = np.array(y_data)
    x_fit = np.linspace(x.min(), x.max(), 200)

    a0, a1 = model["a0"], model["a1"]
    a2 = model.get("a2", None)
    if a2 is not None:
        y_fit = a0 + a1 * x_fit + a2 * x_fit ** 2
        y_pred = a0 + a1 * x + a2 * x ** 2
    else:
        y_fit = a0 + a1 * x_fit
        y_pred = a0 + a1 * x

    residuals = y - y_pred

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8, 7),
                                   gridspec_kw={"height_ratios": [3, 1]})
    fig.patch.set_facecolor(PALETTE["bg"])

    # Courbe d'étalonnage
    for ax in (ax1, ax2):
        ax.set_facecolor(PALETTE["bg"])
        ax.grid(True, ls=":", lw=0.6, color=PALETTE["grey"], alpha=0.4)
        for spine in ax.spines.values():
            spine.set_edgecolor(PALETTE["grey"])
            spine.set_linewidth(0.7)

    ax1.scatter(x, y, color=PALETTE["navy"], s=50, zorder=3,
                edgecolors="white", lw=0.8, label="Données étalon")
    ax1.plot(x_fit, y_fit, color=PALETTE["amber"], lw=2, zorder=2,
             label=f"Modèle (R²={model['r2']:.5f})")
    ax1.set_ylabel("Réponse instrumentale", fontsize=10, color=PALETTE["navy"])
    ax1.set_title(f"Courbe d'étalonnage{' — ' + serie if serie else ''}",
                  fontsize=11, fontweight="bold", color=PALETTE["navy"])
    ax1.legend(fontsize=9)
    ax1.tick_params(labelsize=9, colors=PALETTE["navy"])

    # Résidus
    ax2.axhline(0, color=PALETTE["navy"], lw=1, ls="--", alpha=0.5)
    ax2.scatter(x, residuals, color=PALETTE["info"], s=40, zorder=3,
                edgecolors="white", lw=0.8)
    ax2.set_xlabel(f"Concentration ({unite})" if unite else "Concentration",
                   fontsize=10, color=PALETTE["navy"])
    ax2.set_ylabel("Résidus", fontsize=10, color=PALETTE["navy"])
    ax2.tick_params(labelsize=9, colors=PALETTE["navy"])

    fig.tight_layout(h_pad=2)
    return fig_to_base64(fig)


# ─── Graphique — Décomposition de la variance ─────────────────────────────────

def plot_variance_decomposition(criteria: List[Dict[str, Any]]) -> str:
    """Barres empilées : sr² vs sB² par niveau."""
    niveaux = [c["niveau"] for c in criteria]
    sr2     = [c["Sr2"] for c in criteria]
    sb2     = [c["SB2"] for c in criteria]

    fig, ax = plt.subplots(figsize=(7, 4))
    fig.patch.set_facecolor(PALETTE["bg"])
    ax.set_facecolor(PALETTE["bg"])

    x = np.arange(len(niveaux))
    w = 0.5
    ax.bar(x, sr2, w, label="s²r (répétabilité)", color=PALETTE["info"],   alpha=0.8)
    ax.bar(x, sb2, w, bottom=sr2, label="s²B (inter-séries)", color=PALETTE["amber"], alpha=0.8)

    ax.set_xticks(x)
    ax.set_xticklabels(niveaux, fontsize=9)
    ax.set_ylabel("Variance", fontsize=10, color=PALETTE["navy"])
    ax.set_title("Décomposition de la variance par niveau", fontsize=11,
                 fontweight="bold", color=PALETTE["navy"])
    ax.legend(fontsize=9)
    ax.grid(True, axis="y", ls=":", lw=0.6, color=PALETTE["grey"], alpha=0.4)
    for spine in ax.spines.values():
        spine.set_edgecolor(PALETTE["grey"])
        spine.set_linewidth(0.7)

    fig.tight_layout()
    return fig_to_base64(fig)


# ─── Export PDF ───────────────────────────────────────────────────────────────

def generate_pdf_report(
    analysis_data: Dict[str, Any],
    config: Dict[str, Any]
) -> bytes:
    """
    Génère un rapport PDF complet du profil d'exactitude.
    Retourne les bytes du PDF.
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.lib import colors
        from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer,
                                        Table, TableStyle, HRFlowable,
                                        Image as RLImage, PageBreak)
        from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
    except ImportError:
        raise ImportError("reportlab non installé — pip install reportlab")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=2*cm, rightMargin=2*cm,
                            topMargin=2.5*cm, bottomMargin=2*cm)

    styles = getSampleStyleSheet()
    navy   = colors.HexColor("#0B1929")
    amber  = colors.HexColor("#F5A623")
    valid  = colors.HexColor("#22C55E")
    invalid= colors.HexColor("#EF4444")

    title_style = ParagraphStyle("title", parent=styles["Title"],
                                 textColor=navy, fontSize=16, spaceAfter=6)
    h1_style    = ParagraphStyle("h1", parent=styles["Heading1"],
                                 textColor=navy, fontSize=13, spaceAfter=4,
                                 spaceBefore=12)
    h2_style    = ParagraphStyle("h2", parent=styles["Heading2"],
                                 textColor=amber, fontSize=11, spaceAfter=4)
    body_style  = ParagraphStyle("body", parent=styles["Normal"],
                                 fontSize=9, leading=13)

    story = []

    # En-tête
    story.append(Paragraph("PROFIL D'EXACTITUDE", title_style))
    story.append(Paragraph("Rapport de validation analytique — ISO 5725-2 / Feinberg (2010)", body_style))
    story.append(HRFlowable(width="100%", thickness=2, color=amber, spaceAfter=8))

    # Métadonnées
    meta = [
        ["Méthode", config.get("methode", "—")],
        ["Matériau", config.get("materiau", "—")],
        ["Unité", config.get("unite", "—")],
        ["β", f"{round(config.get('beta', 0.80)*100)}%"],
        ["λ", f"±{round(config.get('lambdaVal', 0.10)*100)}%"],
        ["Date", datetime.date.today().strftime("%d/%m/%Y")],
        ["Laboratoire", config.get("laboratoire", "—")],
        ["Analyste", config.get("analyste", "—")],
    ]
    t = Table(meta, colWidths=[4*cm, 12*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F0F3F8")),
        ("TEXTCOLOR",  (0, 0), (0, -1), navy),
        ("FONTNAME",   (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTSIZE",   (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#F8F9FC")]),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#D4DDE8")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.4*cm))

    # Statut de validation
    validity = analysis_data.get("validity", {})
    if validity:
        status_color = valid if validity.get("valid") else (
            colors.HexColor("#F59E0B") if validity.get("partial") else invalid
        )
        status_text = ("✓ MÉTHODE VALIDÉE" if validity.get("valid") else
                       "⚠ VALIDATION PARTIELLE" if validity.get("partial") else
                       "✗ MÉTHODE NON VALIDÉE")
        story.append(Paragraph(f'<font color="{status_color.hexval()}">{status_text}</font> '
                               f'({validity.get("nValid", 0)}/{validity.get("nTotal", 0)} niveaux)', h1_style))

    # Critères par niveau
    story.append(Paragraph("Critères de justesse et fidélité", h1_style))
    criteria = analysis_data.get("criteria", [])
    if criteria:
        header = ["Niveau", "X̄ réf.", "Z̄ ret.", "sr", "sB", "sFI", "CV%", "Biais%", "Récouv.%"]
        rows   = [header]
        for c in criteria:
            rows.append([
                c.get("niveau", ""),
                f"{c.get('xMean', 0):.4f}",
                f"{c.get('zMean', 0):.4f}",
                f"{c.get('sr', 0):.4f}",
                f"{c.get('sB', 0):.4f}",
                f"{c.get('sFI', 0):.4f}",
                f"{c.get('cv', 0):.2f}",
                f"{c.get('bRel', 0):.2f}",
                f"{c.get('recouvMoy', 0):.2f}",
            ])
        ct = Table(rows, repeatRows=1)
        ct.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), navy),
            ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",   (0, 0), (-1, -1), 7.5),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#D4DDE8")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F9FC")]),
            ("ALIGN", (1, 1), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(ct)
        story.append(Spacer(1, 0.3*cm))

    # Intervalles de tolérance
    story.append(Paragraph("Intervalles β-expectation (Mee, 1984)", h1_style))
    tolerances = analysis_data.get("tolerances", [])
    if tolerances:
        header2 = ["Niveau", "X̄ réf.", "sIT", "ktol", "ν", "LTB%", "LTH%", "LA basse%", "LA haute%", "Statut"]
        rows2   = [header2]
        for t in tolerances:
            status = "VALIDE" if t.get("accept") else "NON VALIDE"
            rows2.append([
                t.get("niveau", ""),
                f"{t.get('xMean', 0):.4f}",
                f"{t.get('sIT', 0):.4f}",
                f"{t.get('ktol', 0):.3f}",
                str(t.get("nu", 0)),
                f"{t.get('ltbRel', 0):.2f}" if t.get("ltbRel") else "—",
                f"{t.get('lthRel', 0):.2f}" if t.get("lthRel") else "—",
                f"{t.get('laBasse', 0):.1f}",
                f"{t.get('laHaute', 0):.1f}",
                status,
            ])
        tt = Table(rows2, repeatRows=1)
        tt.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), navy),
            ("TEXTCOLOR",  (0, 0), (-1, 0), colors.white),
            ("FONTNAME",   (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",   (0, 0), (-1, -1), 7),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#D4DDE8")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8F9FC")]),
            ("ALIGN", (1, 1), (-1, -1), "CENTER"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(tt)
        story.append(Spacer(1, 0.3*cm))

    # Interprétation IA
    interpretation = analysis_data.get("interpretation", [])
    if interpretation:
        story.append(Paragraph("Interprétation automatique", h1_style))
        for item in interpretation:
            sev = item.get("severity", "info")
            icon = {"info": "ℹ", "success": "✓", "warning": "⚠", "critical": "✗"}.get(sev, "•")
            color = {"success": "#166534", "warning": "#92400E",
                     "critical": "#991B1B", "info": "#1E40AF"}.get(sev, "#000")
            story.append(Paragraph(
                f'<font color="{color}">{icon} [{item.get("category", "").upper()}]</font> {item.get("message", "")}',
                body_style
            ))
            story.append(Spacer(1, 0.1*cm))

    doc.build(story)
    buf.seek(0)
    return buf.read()


# ─── Formatage numérique ──────────────────────────────────────────────────────

def fmt(val: Optional[float], decimals: int = 4) -> str:
    """Formate un float en chaîne arrondie (retourne '—' si None)."""
    if val is None:
        return "—"
    return f"{val:.{decimals}f}"


def pct(val: Optional[float], decimals: int = 2) -> str:
    """Formate un pourcentage."""
    if val is None:
        return "—"
    return f"{val:.{decimals}f}%"


def now_iso() -> str:
    """Retourne l'heure courante en format ISO 8601."""
    return datetime.datetime.utcnow().isoformat(timespec="seconds") + "Z"
