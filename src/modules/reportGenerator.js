/**
 * ================================================================
 * reportGenerator.js — Génération du rapport de validation
 * Format HTML téléchargeable / export Excel
 * ================================================================
 */
"use strict";

/**
 * Génère un rapport HTML complet de validation analytique.
 */
function generateHTMLReport(appState, options = {}) {
  const { results, config, aiContent } = appState;
  const { models, criteria, tolerances, outliers, validity } = results;
  const inc = options;

  const now   = new Date();
  const dateS = now.toLocaleDateString("fr-FR");
  const timeS = now.toLocaleTimeString("fr-FR");

  // ── En-tête ──────────────────────────────────────────────────────────────
  let html = `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<title>Rapport de Validation — ${config.methode || "Méthode analytique"}</title>
<style>
  :root{--navy:#0B1929;--amber:#F5A623;--valid:#166534;--invalid:#991B1B;--warn:#92400E}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#1a1a2e;
       margin:0;padding:24px 32px;max-width:1000px;margin:auto;line-height:1.6}
  h1{font-size:20px;color:var(--navy);border-bottom:3px solid var(--amber);
     padding-bottom:8px;margin-bottom:4px}
  h2{font-size:13px;font-weight:700;color:var(--navy);margin:24px 0 8px;
     border-left:4px solid var(--amber);padding-left:10px;text-transform:uppercase;
     letter-spacing:.06em}
  .meta{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;
        background:#F0F3F8;border-radius:6px;padding:14px;margin:14px 0}
  .meta-item .lbl{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.06em}
  .meta-item .val{font-weight:700;font-size:13px;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin:8px 0;font-size:11px}
  th{background:var(--navy);color:#F5A623;padding:6px 8px;text-align:left;
     font-size:9px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
  td{padding:5px 8px;border-bottom:1px solid #e5e7eb}
  tr:nth-child(even) td{background:#F8F9FC}
  .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-weight:700;font-size:10px}
  .badge.valid{background:#DCFCE7;color:var(--valid)}
  .badge.invalid{background:#FEE2E2;color:var(--invalid)}
  .badge.warn{background:#FEF3C7;color:var(--warn)}
  .verdict{padding:12px 16px;border-radius:6px;margin:10px 0;font-size:13px;line-height:1.6}
  .verdict.v{background:#DCFCE7;border-left:4px solid #22C55E;color:#14532D}
  .verdict.i{background:#FEE2E2;border-left:4px solid #EF4444;color:var(--invalid)}
  .verdict.p{background:#FEF3C7;border-left:4px solid #F59E0B;color:var(--warn)}
  .mono{font-family:'Courier New',monospace;font-size:10px;
        background:#F0F3F8;padding:8px 10px;border-radius:4px}
  .ai-section{background:#F8F9FC;border:1px solid #D4DDE8;
              border-radius:6px;padding:14px;font-size:12px;line-height:1.7}
  .footer{margin-top:40px;padding-top:12px;border-top:1px solid #e5e7eb;
          font-size:10px;color:#9ca3af;text-align:center}
  @media print{body{padding:12px}.footer{position:fixed;bottom:0}}
</style></head><body>

<h1>Rapport de Validation de Méthode Analytique</h1>
<p style="font-size:11px;color:#666;margin-bottom:8px">
  Profil d'exactitude — Méthode de Feinberg (2010) / ISO 5725-2 (2002) / Mee (1984)
</p>

<div class="meta">
  <div class="meta-item">
    <div class="lbl">Méthode</div>
    <div class="val">${config.methode || "—"}</div>
  </div>
  <div class="meta-item">
    <div class="lbl">Matériau</div>
    <div class="val">${config.materiau || "—"}</div>
  </div>
  <div class="meta-item">
    <div class="lbl">Laboratoire</div>
    <div class="val">${options.labo || "—"}</div>
  </div>
  <div class="meta-item">
    <div class="lbl">Analyste</div>
    <div class="val">${options.analyste || "—"}</div>
  </div>
  <div class="meta-item">
    <div class="lbl">Référence</div>
    <div class="val">${options.ref || "—"}</div>
  </div>
  <div class="meta-item">
    <div class="lbl">Version</div>
    <div class="val">${options.version || "1.0"}</div>
  </div>
  <div class="meta-item">
    <div class="lbl">Date</div>
    <div class="val">${dateS}</div>
  </div>
  <div class="meta-item">
    <div class="lbl">Statut</div>
    <div class="val">
      <span class="badge ${validity.valid ? "valid" : validity.partial ? "warn" : "invalid"}">
        ${validity.valid ? "VALIDE" : validity.partial ? "PARTIELLEMENT VALIDE" : "NON VALIDE"}
      </span>
    </div>
  </div>
</div>`;

  // ── Paramètres ────────────────────────────────────────────────────────────
  if (inc.params !== false) {
    html += `
<h2>1. Paramètres de validation</h2>
<table>
  <tr><th>Paramètre</th><th>Valeur</th></tr>
  <tr><td>Type de méthode</td><td>${config.methodType === "indirect" ? "Indirecte (étalonnage requis)" : "Directe"}</td></tr>
  <tr><td>Niveaux de concentration (K)</td><td>${criteria.length}</td></tr>
  <tr><td>Nombre de séries (I)</td><td>${criteria[0]?.I || "—"}</td></tr>
  <tr><td>Répétitions par série (J)</td><td>${criteria[0]?.J || "—"}</td></tr>
  <tr><td>Limite d'acceptabilité λ</td><td>±${(config.lambda*100).toFixed(0)}%</td></tr>
  <tr><td>Proportion β</td><td>${(config.beta*100).toFixed(0)}%</td></tr>
  <tr><td>Unité de concentration</td><td>${config.unite || "—"}</td></tr>
  <tr><td>Norme de référence</td><td>ISO 5725-2 : 2002 / Feinberg (2010) / Mee (1984)</td></tr>
</table>`;
  }

  // ── Modèles d'étalonnage ──────────────────────────────────────────────────
  if (inc.etalonnage !== false && config.methodType === "indirect" && models && Object.keys(models).length > 0) {
    html += `<h2>2. Modèles d'étalonnage</h2>
<table>
  <tr><th>Série</th><th>a₀ (Blanc)</th><th>a₁ (Sensibilité)</th><th>R²</th><th>r</th></tr>`;
    Object.entries(models).forEach(([serie, m]) => {
      html += `<tr>
        <td>${serie}</td>
        <td class="mono">${m.a0.toFixed(4)}</td>
        <td class="mono">${m.a1.toFixed(4)}</td>
        <td class="mono">${m.r2.toFixed(6)}</td>
        <td class="mono">${m.r.toFixed(6)}</td>
      </tr>`;
    });
    html += `</table>`;
  }

  // ── Critères de fidélité et justesse ─────────────────────────────────────
  if (inc.criteria !== false) {
    html += `<h2>3. Critères de justesse et fidélité</h2>
<table>
  <tr><th>Niveau</th><th>X̄ réf.</th><th>Z̄ retrouvée</th>
      <th>sᵣ</th><th>sB</th><th>sFI</th>
      <th>CV%</th><th>Biais%</th><th>Récouv.%</th></tr>`;
    criteria.forEach(c => {
      const biasClass = Math.abs(c.bRel) > (config.lambda || 0.1) * 100 ? 'color:var(--invalid)' : '';
      html += `<tr>
        <td>${c.niveau}</td>
        <td class="mono">${c.xMean.toFixed(4)}</td>
        <td class="mono">${c.zMean.toFixed(4)}</td>
        <td class="mono">${c.sr.toFixed(4)}</td>
        <td class="mono">${c.sB.toFixed(4)}</td>
        <td class="mono">${c.sFI.toFixed(4)}</td>
        <td class="mono">${c.cv.toFixed(2)}</td>
        <td class="mono" style="${biasClass}">${c.bRel.toFixed(3)}</td>
        <td class="mono">${c.recouvMoy.toFixed(3)}</td>
      </tr>`;
    });
    html += `</table>`;
  }

  // ── Intervalles de tolérance ──────────────────────────────────────────────
  if (inc.tolerance !== false) {
    html += `<h2>4. Intervalles β-expectation (Mee, 1984)</h2>
<p style="font-size:11px;color:#666;margin-bottom:6px">
  Critère de validation : LTB% ≥ ${tolerances[0]?.laBasse.toFixed(0)||"—"}% et LTH% ≤ ${tolerances[0]?.laHaute.toFixed(0)||"—"}%
</p>
<table>
  <tr><th>Niveau</th><th>X̄ réf.</th><th>Récouv.%</th>
      <th>sIT</th><th>k_tol</th><th>ν</th>
      <th>LTB%</th><th>LTH%</th><th>Statut</th></tr>`;
    tolerances.forEach(t => {
      html += `<tr>
        <td>${t.niveau}</td>
        <td class="mono">${t.xMean.toFixed(4)}</td>
        <td class="mono">${t.recouvRel.toFixed(3)}</td>
        <td class="mono">${t.sIT.toFixed(4)}</td>
        <td class="mono">${t.ktol.toFixed(4)}</td>
        <td class="mono">${t.nu}</td>
        <td class="mono">${(t.ltbRel||0).toFixed(3)}</td>
        <td class="mono">${(t.lthRel||0).toFixed(3)}</td>
        <td><span class="badge ${t.accept ? 'valid' : 'invalid'}">${t.accept ? 'VALIDE' : 'NON VALIDE'}</span></td>
      </tr>`;
    });
    html += `</table>`;
  }

  // ── Aberrants ─────────────────────────────────────────────────────────────
  if (inc.outliers !== false && outliers) {
    html += `<h2>5. Détection des aberrants (Test de Grubbs, α=5%)</h2>
<table>
  <tr><th>Niveau</th><th>X̄ réf.</th><th>N</th><th>G calculé</th><th>G critique</th><th>Statut</th></tr>`;
    outliers.forEach(o => {
      html += `<tr>
        <td>${o.niveau}</td>
        <td class="mono">${o.xMean.toFixed(4)}</td>
        <td>${o.n}</td>
        <td class="mono">${o.grubbs.G}</td>
        <td class="mono">${o.grubbs.Gcrit}</td>
        <td><span class="badge ${o.grubbs.suspect ? 'invalid' : 'valid'}">
          ${o.grubbs.suspect ? `⚠ ABERRANT (${o.grubbs.suspectVal?.toFixed(4)})` : 'OK'}
        </span></td>
      </tr>`;
    });
    html += `</table>`;
  }

  // ── Profil d'exactitude ───────────────────────────────────────────────────
  if (inc.profile !== false) {
    const lambda = config.lambda * 100;
    const beta   = config.beta   * 100;
    const laBasse = tolerances[0]?.laBasse || (100 - lambda);
    const laHaute = tolerances[0]?.laHaute || (100 + lambda);

    // Données sérialisées pour le script inline
    const chartData = {
      labels:  tolerances.map(t => `${t.xMean.toFixed(3)} ${config.unite || ""}`),
      recouv:  tolerances.map(t => +(t.recouvRel || 100).toFixed(3)),
      ltb:     tolerances.map(t => +(t.ltbRel    || 0).toFixed(3)),
      lth:     tolerances.map(t => +(t.lthRel    || 0).toFixed(3)),
      laLow:   tolerances.map(() => +laBasse.toFixed(1)),
      laHigh:  tolerances.map(() => +laHaute.toFixed(1)),
      ref100:  tolerances.map(() => 100),
      colors:  tolerances.map(t => t.accept ? "#F5A623" : "#EF4444"),
    };
    const dataStr = JSON.stringify(chartData);

    html += `<h2>6. Profil d'exactitude</h2>
<p style="font-size:11px;color:#666;margin-bottom:8px">
  Axe X : concentration de référence — Axe Y : taux de recouvrement (%) —
  β=${beta}%, λ=±${lambda}%
</p>
<div class="chart-wrap">
  <canvas id="profile-chart-report"></canvas>
</div>
<script>
(function(){
  const d = ${dataStr};
  const ctx = document.getElementById("profile-chart-report").getContext("2d");
  new Chart(ctx, {
    type: "line",
    data: {
      labels: d.labels,
      datasets: [
        { label: "Taux de recouvrement (%)", data: d.recouv,
          borderColor: "#F5A623", backgroundColor: "rgba(245,166,35,0.08)",
          pointBackgroundColor: d.colors, pointRadius: 6,
          borderWidth: 2, tension: 0.3, fill: false },
        { label: "LTB β-expect.", data: d.ltb,
          borderColor: "#1A3050", pointRadius: 3, borderWidth: 1.5,
          tension: 0.3, fill: "+1", backgroundColor: "rgba(26,48,80,0.06)" },
        { label: "LTH β-expect.", data: d.lth,
          borderColor: "#1A3050", pointRadius: 3, borderWidth: 1.5, tension: 0.3, fill: false },
        { label: "L. Accept. basse (${(100 - lambda).toFixed(0)}%)", data: d.laLow,
          borderColor: "#EF4444", borderDash: [7,4], pointRadius: 0, borderWidth: 1.5, fill: false },
        { label: "L. Accept. haute (${(100 + lambda).toFixed(0)}%)", data: d.laHigh,
          borderColor: "#EF4444", borderDash: [7,4], pointRadius: 0, borderWidth: 1.5, fill: false },
        { label: "Référence 100%", data: d.ref100,
          borderColor: "rgba(140,160,185,0.4)", borderDash: [3,3], pointRadius: 0, borderWidth: 1, fill: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { font: { size: 10 }, boxWidth: 14 } } },
      scales: {
        x: { title: { display: true, text: "Concentration de référence (${config.unite || ""})" } },
        y: { title: { display: true, text: "Taux de recouvrement (%)" },
             suggestedMin: ${Math.min(laBasse - 8, ...tolerances.map(t => t.ltbRel || 0)) - 2},
             suggestedMax: ${Math.max(laHaute + 8, ...tolerances.map(t => t.lthRel || 0)) + 2} }
      }
    }
  });
})();
<\/script>`;
  }

  // ── Domaine de validité ───────────────────────────────────────────────────
  html += `<h2>7. Domaine de validité</h2>
<div class="verdict ${validity.valid ? 'v' : validity.partial ? 'p' : 'i'}">
  <strong>${validity.valid ? '✅ MÉTHODE VALIDE' : validity.partial ? '⚠ MÉTHODE PARTIELLEMENT VALIDE' : '❌ MÉTHODE NON VALIDE'}</strong><br>
  ${validity.nValid} niveau(x) sur ${validity.nTotal} respectent les critères β-expectation (${validity.pct}%).`;

  if (validity.domain) {
    html += `<br>Domaine de validité : <strong>${validity.domain.min.toFixed(3)} – ${validity.domain.max.toFixed(3)} ${config.unite || ""}</strong>`;
  }
  html += `</div>`;

  // ── Interprétation IA ─────────────────────────────────────────────────────
  if (inc.ai !== false && aiContent) {
    html += `<h2>8. Interprétation par intelligence artificielle</h2>
<div class="ai-section">${aiContent.replace(/\n/g, "<br>")}</div>`;
  }

  html += `
<div class="footer">
  Rapport généré par <strong>Accuracy Profile Add-in</strong> — ${dateS} à ${timeS}<br>
  Basé sur : Feinberg M. (2010) · ISO 5725-2 (2002) · Mee R.W. (1984) · ICH Q2(R1)<br>
  Référence document : ${options.ref || "—"} v${options.version || "1.0"}
</div>
</body></html>`;

  return html;
}

/**
 * Télécharge le rapport HTML.
 */
function downloadHTMLReport(html, filename) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename || `Rapport_Validation_${new Date().toISOString().slice(0,10)}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

window.ReportGenerator = { generateHTMLReport, downloadHTMLReport };