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


/**
 * Génère des feuilles Excel avec des tableaux de saisie standards
 * pré-formatés et prêts à remplir (avec exemples et instructions).
 */
async function generateBlankTemplates(config) {
  const { K = 3, I = 3, J = 3, unite = "", methodType = "indirect" } = config;
  const isDirect = methodType === "direct";

  return Excel.run(async ctx => {
    const wb = ctx.workbook;

    // ─── Feuille 1 : Plan de validation ─────────────────────────────────────
    let sheetV = wb.worksheets.getItemOrNullObject("Plan_Validation");
    await ctx.sync();
    if (sheetV.isNullObject) { sheetV = wb.worksheets.add("Plan_Validation"); }
    else { sheetV.getUsedRangeOrNullObject().clear(); }
    await ctx.sync();
    sheetV.tabColor = "#1A3050";

    // Titre
    sheetV.getRange("A1").values = [["PLAN DE VALIDATION — " + (isDirect ? "METHODE DIRECTE" : "METHODE INDIRECTE")]];
    sheetV.getRange("A1").format.font.bold  = true;
    sheetV.getRange("A1").format.font.size  = 12;
    sheetV.getRange("A1").format.font.color = "#0B1929";

    // Instructions
    const instrV = isDirect
      ? [["I = nombre de séries (jours) ≥ 3   |   J = répétitions par série ≥ 2   |   K = niveaux ≥ 3"],
         ["La colonne Z = concentration mesurée directement (pesée, titrimétrie…). Pas d'étalonnage requis."]]
      : [["I = nombre de séries (jours) ≥ 3   |   J = répétitions par série ≥ 2   |   K = niveaux ≥ 3"],
         ["La colonne Y = réponse instrumentale brute (aire de pic, absorbance…). Nécessite un plan d'étalonnage."]];
    sheetV.getRange("A2:A3").values = instrV;
    sheetV.getRange("A2:A3").format.font.color = "#4A6080";
    sheetV.getRange("A2:A3").format.font.size  = 9;
    sheetV.getRange("A2:A3").format.font.italic = true;

    // En-têtes colonnes
    const hdrV = isDirect
      ? ["Niveau (k)", "Série (i)", "Répétition (j)", "Valeur référence X (" + unite + ")", "Concentration mesurée Z (" + unite + ")", "Biais absolu", "Biais relatif %", "Remarque"]
      : ["Niveau (k)", "Série (i)", "Répétition (j)", "Valeur référence X (" + unite + ")", "Réponse instrumentale Y", "Concentration retrouvée Z (" + unite + ")", "Biais absolu", "Biais relatif %"];
    const nColV = hdrV.length;
    const hdrRangeV = sheetV.getRange("A5:" + String.fromCharCode(64 + nColV) + "5");
    hdrRangeV.values = [hdrV];
    hdrRangeV.format.fill.color = "#0B1929";
    hdrRangeV.format.font.color = "#F5A623";
    hdrRangeV.format.font.bold  = true;
    hdrRangeV.format.font.size  = 9;

    // Lignes de saisie (K × I × J)
    let rowV = 6;
    for (let k = 1; k <= K; k++) {
      for (let i = 1; i <= I; i++) {
        for (let j = 1; j <= J; j++) {
          const rowData = isDirect
            ? [k, i, j, "", "", "", "", ""]
            : [k, i, j, "", "", "", "", ""];
          sheetV.getRange("A" + rowV + ":" + String.fromCharCode(64 + nColV) + rowV).values = [rowData];
          // Cellules X en jaune (à remplir)
          sheetV.getRange("D" + rowV).format.fill.color = "#FFFDE7";
          // Cellules Y ou Z en vert clair (à remplir)
          sheetV.getRange("E" + rowV).format.fill.color = "#E8F5E9";
          // Lignes alternées
          if ((rowV - 6) % 2 === 1) {
            sheetV.getRange("A" + rowV + ":H" + rowV).format.fill.color = "#F8F9FC";
          }
          rowV++;
        }
      }
    }

    // Ligne exemple (ligne 6 pré-remplie)
    sheetV.getRange("A6").values = [[1]];
    sheetV.getRange("B6").values = [[1]];
    sheetV.getRange("C6").values = [[1]];
    sheetV.getRange("D6").values = [["← Entrez la valeur de référence (ex: 0.40)"]];
    sheetV.getRange("E6").values = [["← Entrez la réponse mesurée (ex: 22.6)"]];
    sheetV.getRange("D6").format.font.color = "#9C6B00";
    sheetV.getRange("E6").format.font.color = "#1B5E20";
    sheetV.getRange("D6").format.font.italic = true;
    sheetV.getRange("E6").format.font.italic = true;

    // Légende couleurs
    sheetV.getRange("A" + (rowV + 1)).values = [["LÉGENDE :"]];
    sheetV.getRange("A" + (rowV + 1)).format.font.bold = true;
    sheetV.getRange("A" + (rowV + 2)).format.fill.color = "#FFFDE7";
    sheetV.getRange("A" + (rowV + 2)).values = [["Fond jaune = Valeur de référence X (connue)"]];
    sheetV.getRange("A" + (rowV + 3)).format.fill.color = "#E8F5E9";
    sheetV.getRange("A" + (rowV + 3)).values = [["Fond vert = Réponse mesurée Y ou Z (à mesurer)"]];

    // Largeurs
    const widthsV = isDirect ? [12,10,14,26,26,16,16,20] : [12,10,14,26,24,26,16,16];
    widthsV.forEach(function(w, i) {
      sheetV.getRange(String.fromCharCode(65 + i) + "1").format.columnWidth = w * 7;
    });
    sheetV.getRange("A1").format.rowHeight = 28;
    sheetV.getRange("A5").format.rowHeight = 24;

    await ctx.sync();

    // ─── Feuille 2 : Plan d'étalonnage (méthode indirecte uniquement) ────────
    if (!isDirect) {
      let sheetE = wb.worksheets.getItemOrNullObject("Plan_Etalonnage");
      await ctx.sync();
      if (sheetE.isNullObject) { sheetE = wb.worksheets.add("Plan_Etalonnage"); }
      else { sheetE.getUsedRangeOrNullObject().clear(); }
      await ctx.sync();
      sheetE.tabColor = "#F5A623";

      sheetE.getRange("A1").values = [["PLAN D'ÉTALONNAGE — MÉTHODE INDIRECTE"]];
      sheetE.getRange("A1").format.font.bold  = true;
      sheetE.getRange("A1").format.font.size  = 12;
      sheetE.getRange("A1").format.font.color = "#0B1929";

      sheetE.getRange("A2").values = [["⚠ Synchroniser avec le plan de validation : mêmes séries (mêmes jours / opérateurs). Minimum K' = 2 niveaux, J' = 2 répétitions par série."]];
      sheetE.getRange("A2").format.font.color  = "#4A6080";
      sheetE.getRange("A2").format.font.italic = true;
      sheetE.getRange("A2").format.font.size   = 9;

      const hdrE = ["Niveau étalon (k')", "Série (i)", "Répétition (j')", "Concentration étalon X (" + unite + ")", "Réponse instrumentale Y", "Remarque"];
      sheetE.getRange("A4:F4").values = [hdrE];
      sheetE.getRange("A4:F4").format.fill.color = "#0B1929";
      sheetE.getRange("A4:F4").format.font.color = "#F5A623";
      sheetE.getRange("A4:F4").format.font.bold  = true;
      sheetE.getRange("A4:F4").format.font.size  = 9;

      // Générer K'=2 niveaux, I séries, J'=2 répétitions
      const K2 = 2, J2 = 2;
      let rowE = 5;
      for (let k = 1; k <= K2; k++) {
        for (let i = 1; i <= I; i++) {
          for (let j = 1; j <= J2; j++) {
            sheetE.getRange("A" + rowE + ":F" + rowE).values = [[k, i, j, "", "", ""]];
            sheetE.getRange("D" + rowE).format.fill.color = "#FFFDE7";
            sheetE.getRange("E" + rowE).format.fill.color = "#E8F5E9";
            if ((rowE - 5) % 2 === 1) {
              sheetE.getRange("A" + rowE + ":F" + rowE).format.fill.color = "#F8F9FC";
            }
            rowE++;
          }
        }
      }

      // Exemples ligne 5
      sheetE.getRange("D5").values = [["← Concentration étalon bas (ex: 0.40)"]];
      sheetE.getRange("E5").values = [["← Réponse mesurée (ex: 22.7)"]];
      sheetE.getRange("D5").format.font.color  = "#9C6B00";
      sheetE.getRange("E5").format.font.color  = "#1B5E20";
      sheetE.getRange("D5").format.font.italic = true;
      sheetE.getRange("E5").format.font.italic = true;

      // Note en bas
      sheetE.getRange("A" + (rowE + 1)).values = [["IMPORTANT : Un seul modèle d'étalonnage est calculé par série. Les étalons de chaque série servent à réaliser la prédiction inverse pour cette même série."]];
      sheetE.getRange("A" + (rowE + 1)).format.font.color  = "#7C3AED";
      sheetE.getRange("A" + (rowE + 1)).format.font.italic = true;
      sheetE.getRange("A" + (rowE + 1)).format.font.size   = 9;

      // Largeurs
      [18, 10, 14, 30, 24, 20].forEach(function(w, i) {
        sheetE.getRange(String.fromCharCode(65 + i) + "1").format.columnWidth = w * 7;
      });

      await ctx.sync();
    }

    // ─── Feuille 3 : Paramètres de validation ────────────────────────────────
    let sheetP = wb.worksheets.getItemOrNullObject("Paramètres");
    await ctx.sync();
    if (sheetP.isNullObject) { sheetP = wb.worksheets.add("Paramètres"); }
    else { sheetP.getUsedRangeOrNullObject().clear(); }
    await ctx.sync();
    sheetP.tabColor = "#22C55E";

    sheetP.getRange("A1").values = [["PARAMÈTRES DE VALIDATION — À REMPLIR AVANT TOUTE ANALYSE"]];
    sheetP.getRange("A1").format.font.bold  = true;
    sheetP.getRange("A1").format.font.size  = 12;
    sheetP.getRange("A1").format.font.color = "#0B1929";

    const params = [
      ["Paramètre",         "Valeur",    "Explication"],
      ["Méthode analytique","",          "Nom complet de la méthode à valider"],
      ["Matériau de validation","",      "Nature du matériau (MRC, ajout dosé, etc.)"],
      ["Unité de concentration","",      "ex: mg/L, µg/kg, %, etc."],
      ["Type de méthode",  "indirecte", "directe = sans étalonnage | indirecte = avec étalonnage"],
      ["Limite λ (%)",     "10",        "Limite d'acceptabilité. Ex: 10 pour ±10%"],
      ["Proportion β (%)", "80",        "Proportion de futurs résultats dans les IT. Min: 80%"],
      ["Niveaux K",        "3",         "Nombre de concentrations. Min: 3"],
      ["Séries I",         "3",         "Nombre de jours/opérateurs/lots. Min: 3"],
      ["Répétitions J",    "3",         "Répétitions par série et par niveau. Min: 2"],
      ["Modèle étalonnage","linéaire",  "linéaire | origine | quadratique"],
    ];
    sheetP.getRange("A3:C" + (3 + params.length - 1)).values = params;
    sheetP.getRange("A3:C3").format.fill.color = "#0B1929";
    sheetP.getRange("A3:C3").format.font.color = "#F5A623";
    sheetP.getRange("A3:C3").format.font.bold  = true;
    // Cellules valeurs en jaune
    sheetP.getRange("B4:B" + (3 + params.length - 1)).format.fill.color = "#FFFDE7";
    // Largeurs
    [40, 20, 60].forEach(function(w, i) {
      sheetP.getRange(String.fromCharCode(65 + i) + "1").format.columnWidth = w * 6;
    });

    sheetP.activate();
    await ctx.sync();
    return { sheetV: "Plan_Validation", sheetE: isDirect ? null : "Plan_Etalonnage", sheetP: "Paramètres" };
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
  generateBlankTemplates,
};