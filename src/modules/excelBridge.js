/**
 * ================================================================
 * excelBridge.js — Interface avec Office.js / Excel
 * Génération du plan expérimental, lecture et écriture des données
 * ================================================================
 */
"use strict";

// ─── Lecture des données ──────────────────────────────────────────────────────

async function detectUsedRange() {
  return Excel.run(async ctx => {
    const sheet = ctx.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getUsedRange();
    range.load("address");
    await ctx.sync();
    return range.address.split("!").pop();
  });
}

/**
 * Lit un plan de validation depuis Excel.
 * Format attendu : Niveau | Série | Répétition | Valeur ref X | Réponse Y | Unité
 */
async function readPlanValidation(rangeAddress) {
  return Excel.run(async ctx => {
    const sheet  = ctx.workbook.worksheets.getActiveWorksheet();
    const range  = sheet.getRange(rangeAddress);
    range.load("values");
    await ctx.sync();

    const values = range.values;
    if (!values || values.length < 2) throw new Error("Plan de validation vide ou incomplet");

    // Détecter si ligne de header
    const firstCell = String(values[0][0]).toLowerCase();
    const hasHeader = isNaN(parseFloat(firstCell));
    const dataRows  = hasHeader ? values.slice(1) : values;

    const plan = dataRows
      .filter(row => row.some(v => v !== "" && v !== null))
      .map(row => ({
        niveau:    parseFloat(row[0]) || row[0],
        serie:     parseFloat(row[1]) || row[1],
        rep:       parseFloat(row[2]) || row[2],
        xRef:      parseFloat(row[3]),
        yResponse: parseFloat(row[4]),
      }))
      .filter(r => !isNaN(r.xRef) && !isNaN(r.yResponse));

    return plan;
  });
}

/**
 * Lit un plan d'étalonnage depuis Excel.
 * Format attendu : Niveau | Série | Répétition | X étalon | Réponse Y
 */
async function readPlanEtalonnage(rangeAddress) {
  return Excel.run(async ctx => {
    const sheet = ctx.workbook.worksheets.getActiveWorksheet();
    const range = sheet.getRange(rangeAddress);
    range.load("values");
    await ctx.sync();

    const values  = range.values;
    const hasHdr  = isNaN(parseFloat(String(values[0][0])));
    const dataRows = hasHdr ? values.slice(1) : values;

    return dataRows
      .filter(row => row.some(v => v !== "" && v !== null))
      .map(row => ({
        niveau:    parseFloat(row[0]) || row[0],
        serie:     parseFloat(row[1]) || row[1],
        rep:       parseFloat(row[2]) || row[2],
        xEtalon:   parseFloat(row[3]),
        yResponse: parseFloat(row[4]),
      }))
      .filter(r => !isNaN(r.xEtalon) && !isNaN(r.yResponse));
  });
}

// ─── Génération du plan expérimental ─────────────────────────────────────────

/**
 * Génère le plan de validation dans une nouvelle feuille Excel.
 * Crée un tableau structuré avec les colonnes requises.
 */
async function generatePlanValidation(K, I, J, unite = "", methodType = "indirect") {
  return Excel.run(async ctx => {
    const wb        = ctx.workbook;
    const isDirect  = methodType === "direct";
    const sheetName = "Plan_Validation";

    let sheet = wb.worksheets.getItemOrNullObject(sheetName);
    await ctx.sync();
    if (sheet.isNullObject) {
      sheet = wb.worksheets.add(sheetName);
    } else {
      sheet.getUsedRangeOrNullObject().clear();
    }
    await ctx.sync();

    // Colonnes différentes selon le type de méthode
    // Méthode directe  : X ref + Z mesurée directement (pesée, titrimétrie…)
    // Méthode indirecte: X ref + Y réponse instrumentale (absorbance, aire pic…)
    const headers = isDirect
      ? ["Niveau (k)", "Série (i)", "Répétition (j)",
         `Valeur référence X (${unite})`,
         `Concentration mesurée Z (${unite})`,
         "Remarque"]
      : ["Niveau (k)", "Série (i)", "Répétition (j)",
         `Valeur référence X (${unite})`,
         "Réponse instrumentale Y",
         "Unité"];

    const rows = [headers];
    for (let k = 1; k <= K; k++) {
      for (let i = 1; i <= I; i++) {
        for (let j = 1; j <= J; j++) {
          rows.push(isDirect
            ? [k, i, j, `X${k}`, `Z${k}${i}${j}`, ""]
            : [k, i, j, `X${k}${i}${j}`, `Y${k}${i}${j}`, unite]);
        }
      }
    }

    const range = sheet.getRange(`A1:F${rows.length}`);
    range.values = rows;

    // Style en-tête
    const hdrRange = sheet.getRange("A1:F1");
    hdrRange.format.fill.color    = "#0B1929";
    hdrRange.format.font.color    = "#F5A623";
    hdrRange.format.font.bold     = true;
    hdrRange.format.font.name     = "IBM Plex Mono";
    hdrRange.format.font.size     = 9;

    // Largeurs
    ["A","B","C","D","E","F"].forEach((col, i) => {
      sheet.getRange(`${col}1`).format.columnWidth = [12,10,14,28,28,12][i];
    });

    // Lignes alternées
    for (let r = 2; r <= rows.length; r += 2) {
      sheet.getRange(`A${r}:F${r}`).format.fill.color = "#F0F3F8";
    }

    sheet.activate();
    await ctx.sync();

    return { sheetName, rows: rows.length - 1 };
  });
}

/**
 * Génère le plan d'étalonnage dans une feuille Excel.
 */
async function generatePlanEtalonnage(I, niveaux = 2, J = 2, unite = "") {
  return Excel.run(async ctx => {
    const wb        = ctx.workbook;
    const sheetName = "Plan_Etalonnage";

    let sheet = wb.worksheets.getItemOrNullObject(sheetName);
    await ctx.sync();
    if (sheet.isNullObject) {
      sheet = wb.worksheets.add(sheetName);
    } else {
      sheet.getUsedRangeOrNullObject().clear();
    }
    await ctx.sync();

    const headers = [
      "Niveau étalon (k')", "Série (i)", "Répétition (j)",
      `Concentration étalon X (${unite})`,
      "Réponse instrumentale Y"
    ];
    const rows = [headers];

    for (let k = 1; k <= niveaux; k++) {
      for (let i = 1; i <= I; i++) {
        for (let j = 1; j <= J; j++) {
          rows.push([k, i, j, `X${k}`, `Y${k}${i}${j}`]);
        }
      }
    }

    const range = sheet.getRange(`A1:E${rows.length}`);
    range.values = rows;

    const hdrRange = sheet.getRange("A1:E1");
    hdrRange.format.fill.color = "#0B1929";
    hdrRange.format.font.color = "#F5A623";
    hdrRange.format.font.bold  = true;
    hdrRange.format.font.size  = 9;

    sheet.activate();
    await ctx.sync();

    return { sheetName, rows: rows.length - 1 };
  });
}

// ─── Écriture des résultats ───────────────────────────────────────────────────

/**
 * Écrit un tableau 2D dans une feuille Excel (getItemOrNullObject).
 */
async function writeTable(sheetName, data, title = null, clearFirst = true) {
  return Excel.run(async ctx => {
    const wb    = ctx.workbook;
    let   sheet = wb.worksheets.getItemOrNullObject(sheetName);
    await ctx.sync();

    if (sheet.isNullObject) {
      sheet = wb.worksheets.add(sheetName);
      await ctx.sync();
    } else if (clearFirst) {
      sheet.getUsedRangeOrNullObject().clear();
      await ctx.sync();
    }

    let startRow = 1;

    if (title) {
      const cell = sheet.getRange("A1");
      cell.values = [[String(title)]];
      cell.format.font.bold  = true;
      cell.format.font.color = "#F5A623";
      cell.format.font.size  = 11;
      startRow = 2;
    }

    if (!data.length) { await ctx.sync(); return; }

    const ncols   = data[0].length;
    const nrows   = data.length;
    const endCol  = String.fromCharCode(64 + Math.min(ncols, 26));
    const rangeAddr = `A${startRow}:${endCol}${startRow + nrows - 1}`;

    // Normaliser les valeurs
    const cleanData = data.map(row =>
      row.map(v => {
        if (v === null || v === undefined) return "";
        if (typeof v === "number" && !isFinite(v)) return "";
        return typeof v === "number" ? +v.toFixed(6) : String(v);
      })
    );

    const range = sheet.getRange(rangeAddr);
    range.values = cleanData;

    // Style en-tête
    const hdr = sheet.getRange(`A${startRow}:${endCol}${startRow}`);
    hdr.format.fill.color = "#122339";
    hdr.format.font.color = "#9BBDD6";
    hdr.format.font.bold  = true;
    hdr.format.font.size  = 9;

    range.format.autofitColumns();
    sheet.activate();
    await ctx.sync();
  });
}

/**
 * Écrit tous les résultats de l'analyse dans Excel.
 */
async function writeAnalysisResults(results, config) {
  const { models, criteria, tolerances, outliers } = results;

  // 1. Modèles d'étalonnage
  if (config.methodType === "indirect" && Object.keys(models).length > 0) {
    const modHeaders = ["Série", "a0 (Blanc)", "a1 (Sensibilité)", "R²", "r", "N points", "Type"];
    const modRows    = Object.entries(models).map(([serie, m]) => [
      serie,
      +m.a0.toFixed(6), +m.a1.toFixed(6),
      +m.r2.toFixed(6), +m.r.toFixed(6),
      m.n, m.type
    ]);
    await writeTable("Résultats_Étalonnage", [modHeaders, ...modRows],
      "MODÈLES D'ÉTALONNAGE — " + new Date().toLocaleDateString("fr-FR"));
  }

  // 2. Critères de justesse et fidélité
  const critHeaders = [
    "Niveau", "X̄ référence", "Z̄ retrouvée",
    "sr (répétabilité)", "sB (inter-séries)", "sFI (fidélité interm.)",
    "CV (%)", "Biais moyen (%)", "Taux recouvrement (%)"
  ];
  const critRows = criteria.map(c => [
    c.niveau, +c.xMean.toFixed(6), +c.zMean.toFixed(6),
    +c.sr.toFixed(6), +c.sB.toFixed(6), +c.sFI.toFixed(6),
    +c.cv.toFixed(3), +c.bRel.toFixed(3), +c.recouvMoy.toFixed(3)
  ]);
  await writeTable("Résultats_Critères", [critHeaders, ...critRows],
    "CRITÈRES DE JUSTESSE ET FIDÉLITÉ — ISO 5725-2");

  // 3. Intervalles de tolérance
  const tolHeaders = [
    "Niveau", "X̄ référence", "Récouv. (%)", "sIT", "k_tol", "ν (degrés liberté)",
    "LTB (%)", "LTH (%)", "L.Accept. basse (%)", "L.Accept. haute (%)", "Statut"
  ];
  const tolRows = tolerances.map(t => [
    t.niveau, +t.xMean.toFixed(6), +t.recouvRel.toFixed(3),
    +t.sIT.toFixed(6), +t.ktol.toFixed(4), t.nu,
    +(t.ltbRel || 0).toFixed(3), +(t.lthRel || 0).toFixed(3),
    +t.laBasse.toFixed(1), +t.laHaute.toFixed(1),
    t.accept ? "VALIDE" : "NON VALIDE"
  ]);
  await writeTable("Résultats_Tolérance",
    [tolHeaders, ...tolRows],
    `INTERVALLES β-EXPECTATION (β=${results.config.beta*100}%, λ±${results.config.lambda*100}%)`);
}

// ─── Insertion du graphique ───────────────────────────────────────────────────

/**
 * Insère un graphique du profil d'exactitude dans Excel.
 * Les données sont écrites dans une feuille intermédiaire.
 */
async function insertProfileChart(tolerances, config) {
  return Excel.run(async ctx => {
    const wb        = ctx.workbook;
    const sheetName = "Profil_Exactitude";

    let sheet = wb.worksheets.getItemOrNullObject(sheetName);
    await ctx.sync();
    if (sheet.isNullObject) {
      sheet = wb.worksheets.add(sheetName);
    } else {
      sheet.getUsedRangeOrNullObject().clear();
    }
    await ctx.sync();

    const unite = config.unite || "";
    const lambda = config.lambda * 100;
    const beta   = config.beta * 100;

    // ── Ligne 1 : titre ─────────────────────────────────────────────────────
    const titleCell = sheet.getRange("A1");
    titleCell.values = [[`Profil d'Exactitude — ${config.methode || "Méthode"} — β=${beta}%, λ=±${lambda}%`]];
    titleCell.format.font.bold = true;
    titleCell.format.font.color = "#0B1929";
    titleCell.format.font.size  = 11;

    // ── Lignes 3–N : données (séries Y uniquement, étiquettes X séparées) ──
    // Colonne A = étiquettes concentrations (non tracées)
    // Colonnes B–F = séries tracées (toutes en %)
    const hdrRow = [
      `Conc. réf. (${unite})`,
      "Taux de recouvrement (%)",
      `LTB β=${beta}% (%)`,
      `LTH β=${beta}% (%)`,
      `L. Accept. basse (${100 - lambda}%)`,
      `L. Accept. haute (${100 + lambda}%)`,
      "Référence 100%"
    ];

    const dataRows = tolerances.map(t => [
      +t.xMean.toFixed(4),                     // A : concentration (label)
      +(t.recouvRel || 100).toFixed(3),         // B : recouvrement
      +(t.ltbRel    || 0).toFixed(3),           // C : LTB
      +(t.lthRel    || 0).toFixed(3),           // D : LTH
      +(t.laBasse).toFixed(1),                  // E : limite basse acceptabilité
      +(t.laHaute).toFixed(1),                  // F : limite haute acceptabilité
      100                                        // G : référence 100%
    ]);

    const allRows  = [hdrRow, ...dataRows];
    const nRows    = allRows.length;
    const dataRange = sheet.getRange(`A3:G${2 + nRows}`);
    dataRange.values = allRows;

    // Style en-tête de données
    const hdr = sheet.getRange(`A3:G3`);
    hdr.format.fill.color = "#122339";
    hdr.format.font.color = "#9BBDD6";
    hdr.format.font.bold  = true;
    hdr.format.font.size  = 9;

    // ── Graphique : séries B–G seulement (pas la col A = concentrations) ──
    // On crée le graphique sur les colonnes B–G, puis on fixe les étiquettes X
    const chartDataRange = sheet.getRange(`B3:G${2 + nRows}`);
    const chart = sheet.charts.add(
      Excel.ChartType.line,
      chartDataRange,
      Excel.ChartSeriesBy.columns
    );

    chart.title.text = "Profil d'Exactitude";
    chart.setPosition(sheet.getRange("A12"), sheet.getRange("N32"));
    chart.legend.position = Excel.ChartLegendPosition.bottom;
    chart.legend.visible  = true;

    // Axe Y : titre
    chart.axes.getItem(Excel.ChartAxisType.value).title.text = "Taux de recouvrement (%)";
    chart.axes.getItem(Excel.ChartAxisType.value).title.visible = true;

    // Axe X : titre
    chart.axes.getItem(Excel.ChartAxisType.category).title.text = `Concentration de référence (${unite})`;
    chart.axes.getItem(Excel.ChartAxisType.category).title.visible = true;

    sheet.activate();
    await ctx.sync();

    return sheetName;
  });
}

window.ExcelBridge = {
  detectUsedRange,
  readPlanValidation,
  readPlanEtalonnage,
  generatePlanValidation,
  generatePlanEtalonnage,
  writeTable,
  writeAnalysisResults,
  insertProfileChart,
};