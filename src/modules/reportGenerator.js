/**
 * reportGenerator.js — Rapport HTML de validation analytique
 * Profil d'exactitude : SVG pur (zero dependance externe, toujours visible)
 */
"use strict";

// ── SVG pur pour le profil d'exactitude ──────────────────────────────────────
function buildProfileSVG(tolerances, config) {
  var lambda  = +(config.lambda * 100).toFixed(1);
  var unite   = config.unite || "";
  var laBasse = tolerances[0] ? tolerances[0].laBasse : (100 - lambda);
  var laHaute = tolerances[0] ? tolerances[0].laHaute : (100 + lambda);
  var n = tolerances.length;

  var W = 820, H = 340, ML = 56, MR = 20, MT = 18, MB = 68;
  var CW = W - ML - MR, CH = H - MT - MB;

  // Plage Y
  var allY = [laBasse - 5, laHaute + 5, 100];
  tolerances.forEach(function(t) {
    allY.push(t.recouvRel || 100, t.ltbRel || 0, t.lthRel || 0);
  });
  var yMin = Math.floor(Math.min.apply(null, allY) / 5) * 5;
  var yMax = Math.ceil( Math.max.apply(null, allY) / 5) * 5;

  function px(i) { return ML + (n < 2 ? CW/2 : i * CW / (n-1)); }
  function py(v) { return MT + CH - (v - yMin) / (yMax - yMin) * CH; }
  function polyline(vals) {
    return vals.map(function(v,i){ return (i?"L":"M")+px(i).toFixed(1)+","+py(v).toFixed(1); }).join(" ");
  }

  // Zone β entre LTB et LTH
  var zone = tolerances.map(function(t,i){ return "M,L".split(",")[i?1:0]+px(i).toFixed(1)+","+py(t.lthRel||0).toFixed(1); }).join(" ");
  for (var r = n-1; r >= 0; r--) zone += " L"+px(r).toFixed(1)+","+py(tolerances[r].ltbRel||0).toFixed(1);
  zone += " Z";

  var step = (yMax-yMin) <= 30 ? 5 : (yMax-yMin) <= 60 ? 10 : 20;
  var yTicks = [];
  for (var v = yMin; v <= yMax; v += step) yTicks.push(v);

  var s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" style="width:100%;height:auto;display:block">\n';
  s += '<rect width="'+W+'" height="'+H+'" fill="#fafbfc" rx="6"/>\n';
  s += '<rect x="'+ML+'" y="'+MT+'" width="'+CW+'" height="'+CH+'" fill="#fff" stroke="#e5e7eb" stroke-width="1"/>\n';

  // Grilles Y
  yTicks.forEach(function(v) {
    var y = py(v).toFixed(1);
    var dash = v===100 ? "4,3" : "";
    var sw   = v===100 ? "1.5" : "0.7";
    s += '<line x1="'+ML+'" y1="'+y+'" x2="'+(ML+CW)+'" y2="'+y+'" stroke="#e5e7eb" stroke-width="'+sw+'"'+( dash?' stroke-dasharray="'+dash+'"':'')+'/>\n';
    s += '<text x="'+(ML-6)+'" y="'+(+y+4)+'" text-anchor="end" font-size="9" fill="#6b7280" font-family="Courier New">'+v+'</text>\n';
  });

  // Grilles X + labels
  tolerances.forEach(function(t,i) {
    var x = px(i).toFixed(1);
    s += '<line x1="'+x+'" y1="'+MT+'" x2="'+x+'" y2="'+(MT+CH)+'" stroke="#e5e7eb" stroke-width="0.7"/>\n';
    s += '<text x="'+x+'" y="'+(MT+CH+14)+'" text-anchor="middle" font-size="9" fill="#4A6080" font-family="Courier New">'+t.xMean.toFixed(3)+'</text>\n';
  });

  // Titres axes
  s += '<text x="'+(ML+CW/2)+'" y="'+(H-6)+'" text-anchor="middle" font-size="10" fill="#4A6080" font-family="Segoe UI,Arial">Concentration de reference ('+unite+')</text>\n';
  s += '<text transform="rotate(-90,14,'+(MT+CH/2)+')" x="14" y="'+(MT+CH/2+4)+'" text-anchor="middle" font-size="10" fill="#4A6080" font-family="Segoe UI,Arial">Taux de recouvrement (%)</text>\n';

  // Lignes limites d'acceptabilite (tirets rouges)
  s += '<line x1="'+ML+'" y1="'+py(laBasse).toFixed(1)+'" x2="'+(ML+CW)+'" y2="'+py(laBasse).toFixed(1)+'" stroke="#EF4444" stroke-width="1.5" stroke-dasharray="8,4"/>\n';
  s += '<line x1="'+ML+'" y1="'+py(laHaute).toFixed(1)+'" x2="'+(ML+CW)+'" y2="'+py(laHaute).toFixed(1)+'" stroke="#EF4444" stroke-width="1.5" stroke-dasharray="8,4"/>\n';
  // Labels LA
  s += '<text x="'+(ML+CW-2)+'" y="'+(py(laBasse)-4)+'" text-anchor="end" font-size="8" fill="#EF4444">'+laBasse.toFixed(0)+'%</text>\n';
  s += '<text x="'+(ML+CW-2)+'" y="'+(py(laHaute)-4)+'" text-anchor="end" font-size="8" fill="#EF4444">'+laHaute.toFixed(0)+'%</text>\n';

  // Zone beta
  if (n > 1) s += '<path d="'+zone+'" fill="rgba(26,48,80,0.07)" stroke="none"/>\n';

  // LTB et LTH
  if (n > 1) {
    s += '<path d="'+polyline(tolerances.map(function(t){return t.ltbRel||0;}))+'" fill="none" stroke="#1A3050" stroke-width="1.5"/>\n';
    s += '<path d="'+polyline(tolerances.map(function(t){return t.lthRel||0;}))+'" fill="none" stroke="#1A3050" stroke-width="1.5"/>\n';
  }

  // Taux de recouvrement
  if (n > 1) s += '<path d="'+polyline(tolerances.map(function(t){return t.recouvRel||100;}))+'" fill="none" stroke="#F5A623" stroke-width="2.2"/>\n';

  // Points
  tolerances.forEach(function(t,i) {
    var cx = px(i).toFixed(1);
    // Recouvrement
    var cyR = py(t.recouvRel||100).toFixed(1);
    var col = t.accept ? "#F5A623" : "#EF4444";
    s += '<circle cx="'+cx+'" cy="'+cyR+'" r="5" fill="'+col+'" stroke="#fff" stroke-width="1.5"/>\n';
    s += '<text x="'+cx+'" y="'+(+cyR-8)+'" text-anchor="middle" font-size="8" fill="'+col+'" font-weight="bold">'+( t.recouvRel||100).toFixed(1)+'%</text>\n';
    // LTB/LTH
    s += '<circle cx="'+cx+'" cy="'+py(t.ltbRel||0).toFixed(1)+'" r="3" fill="#1A3050"/>\n';
    s += '<circle cx="'+cx+'" cy="'+py(t.lthRel||0).toFixed(1)+'" r="3" fill="#1A3050"/>\n';
  });

  // Legende
  var ly = MT + CH + 38, lx = ML;
  var items = [
    {col:"#F5A623",dash:false,circ:false,label:"Taux de recouvrement"},
    {col:"#1A3050",dash:false,circ:false,label:"LTB / LTH (beta-expect.)"},
    {col:"#EF4444",dash:true, circ:false,label:"L.Accept. (+/-"+lambda+"%)"},
    {col:"#F5A623",dash:false,circ:true, label:"Niveau valide"},
    {col:"#EF4444",dash:false,circ:true, label:"Niveau non valide"},
  ];
  items.forEach(function(it,idx) {
    var x = lx + idx*164;
    if (it.circ) {
      s += '<circle cx="'+(x+8)+'" cy="'+(ly-2)+'" r="4" fill="'+it.col+'"/>\n';
    } else if (it.dash) {
      s += '<line x1="'+x+'" y1="'+(ly-2)+'" x2="'+(x+18)+'" y2="'+(ly-2)+'" stroke="'+it.col+'" stroke-width="1.5" stroke-dasharray="6,3"/>\n';
    } else {
      s += '<line x1="'+x+'" y1="'+(ly-2)+'" x2="'+(x+18)+'" y2="'+(ly-2)+'" stroke="'+it.col+'" stroke-width="2"/>\n';
    }
    s += '<text x="'+(x+22)+'" y="'+ly+'" font-size="9" fill="#4A6080" font-family="Segoe UI,Arial">'+it.label+'</text>\n';
  });

  s += '</svg>\n';
  return s;
}

// ── Table plan de validation ──────────────────────────────────────────────────
function buildPlanValidationTable(K, I, J, unite, isDirect) {
  var colMes = isDirect
    ? 'Concentration mesur&eacute;e Z ('+unite+')'
    : 'R&eacute;ponse instrumentale Y';
  var h = '<table class="plan-table">\n<thead><tr>';
  h += '<th>Niveau k</th><th>S&eacute;rie i</th><th>R&eacute;p&eacute;tition j</th>';
  h += '<th>Valeur r&eacute;f. X ('+unite+')</th>';
  h += '<th>'+colMes+'</th>';
  if (!isDirect) {
    h += '<th>Conc. retrouv&eacute;e Z</th><th>Biais abs.</th><th>Biais rel.%</th>';
  }
  h += '</tr></thead>\n<tbody>\n';

  for (var k = 1; k <= K; k++) {
    for (var i = 1; i <= I; i++) {
      for (var j = 1; j <= J; j++) {
        h += '<tr>';
        if (i===1 && j===1) h += '<td rowspan="'+(I*J)+'" style="background:#F0F3F8;font-weight:700;text-align:center;vertical-align:middle">k='+k+'</td>';
        if (j===1)          h += '<td rowspan="'+J+'" style="text-align:center;vertical-align:middle">i='+i+'</td>';
        h += '<td style="text-align:center">j='+j+'</td>';
        h += '<td class="inp" title="Entrez la valeur de reference"></td>';
        h += '<td class="inp" title="Entrez la reponse mesuree"></td>';
        if (!isDirect) {
          h += '<td class="cal"></td><td class="cal"></td><td class="cal"></td>';
        }
        h += '</tr>\n';
      }
    }
  }
  h += '</tbody>\n</table>\n';
  return h;
}

// ── Table plan d'étalonnage ───────────────────────────────────────────────────
function buildPlanEtalonnageTable(K2, I, J2, unite) {
  var h = '<table class="plan-table">\n<thead><tr>';
  h += '<th>Niveau &eacute;talon k\'</th><th>S&eacute;rie i</th><th>R&eacute;p&eacute;tition j\'</th>';
  h += '<th>Conc. &eacute;talon X ('+unite+')</th>';
  h += '<th>R&eacute;ponse instrumentale Y</th>';
  h += '<th>Remarque</th>';
  h += '</tr></thead>\n<tbody>\n';
  for (var k = 1; k <= K2; k++) {
    for (var i = 1; i <= I; i++) {
      for (var j = 1; j <= J2; j++) {
        h += '<tr>';
        if (i===1 && j===1) h += '<td rowspan="'+(I*J2)+'" style="background:#FFF8E7;font-weight:700;text-align:center;vertical-align:middle">k\'='+k+'</td>';
        if (j===1)          h += '<td rowspan="'+J2+'" style="text-align:center;vertical-align:middle">i='+i+'</td>';
        h += '<td style="text-align:center">j\'='+j+'</td>';
        h += '<td class="inp"></td><td class="inp"></td><td class="inp"></td>';
        h += '</tr>\n';
      }
    }
  }
  h += '</tbody>\n</table>\n';
  return h;
}

// ── Rapport HTML principal ────────────────────────────────────────────────────
function generateHTMLReport(appState, options) {
  var res       = appState.results;
  var config    = appState.config;
  var aiContent = appState.aiContent || "";
  var opts      = options || {};
  var models    = res.models;
  var criteria  = res.criteria;
  var tolerances = res.tolerances;
  var outliers  = res.outliers;
  var validity  = res.validity;

  var dateS   = new Date().toLocaleDateString("fr-FR");
  var timeS   = new Date().toLocaleTimeString("fr-FR");
  var lambda  = +(config.lambda * 100).toFixed(1);
  var beta    = +(config.beta   * 100).toFixed(0);
  var unite   = config.unite || "";
  var laBasse = tolerances[0] ? tolerances[0].laBasse : (100 - lambda);
  var laHaute = tolerances[0] ? tolerances[0].laHaute : (100 + lambda);
  var K       = criteria.length;
  var I       = criteria[0] ? criteria[0].I : 3;
  var J       = criteria[0] ? criteria[0].J : 3;
  var isDirect = config.methodType === "direct";

  var css = '';
  css += '*{box-sizing:border-box}';
  css += 'body{font-family:"Segoe UI",Arial,sans-serif;font-size:12px;color:#1a1a2e;padding:28px 36px;max-width:1060px;margin:auto;line-height:1.6;background:#fff}';
  css += 'h1{font-size:20px;color:#0B1929;border-bottom:3px solid #F5A623;padding-bottom:8px;margin-bottom:4px}';
  css += 'h2{font-size:11px;font-weight:700;color:#0B1929;margin:22px 0 8px;border-left:4px solid #F5A623;padding-left:10px;text-transform:uppercase;letter-spacing:.06em}';
  css += '.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;background:#F0F3F8;border-radius:6px;padding:14px;margin:14px 0}';
  css += '.meta .lbl{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.05em}';
  css += '.meta .val{font-weight:700;font-size:13px;margin-top:2px}';
  css += 'table{width:100%;border-collapse:collapse;margin:8px 0;font-size:11px}';
  css += 'th{background:#0B1929;color:#F5A623;padding:6px 8px;text-align:left;font-size:9px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}';
  css += 'td{padding:5px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap}';
  css += 'tr:nth-child(even) td{background:#F8F9FC}';
  css += '.mono{font-family:"Courier New",monospace}';
  css += '.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-weight:700;font-size:10px}';
  css += '.valid{background:#DCFCE7;color:#166534}.invalid{background:#FEE2E2;color:#991B1B}.warn{background:#FEF3C7;color:#92400E}';
  css += '.verdict{padding:12px 16px;border-radius:6px;margin:10px 0;font-size:13px;line-height:1.6}';
  css += '.verdict.v{background:#DCFCE7;border-left:4px solid #22C55E;color:#14532D}';
  css += '.verdict.i{background:#FEE2E2;border-left:4px solid #EF4444;color:#991B1B}';
  css += '.verdict.p{background:#FEF3C7;border-left:4px solid #F59E0B;color:#92400E}';
  css += '.ai-box{background:#F8F9FC;border:1px solid #D4DDE8;border-radius:6px;padding:14px;font-size:12px;line-height:1.7}';
  css += '.fn{font-size:10px;color:#6b7280;font-style:italic;margin-top:4px;margin-bottom:4px}';
  css += '.svg-wrap{border:1px solid #e5e7eb;border-radius:6px;padding:8px;background:#fafbfc;margin:10px 0;overflow:hidden}';
  css += '.plan-table{border-collapse:collapse;font-size:11px;margin:8px 0;width:100%}';
  css += '.plan-table th{background:#122339;color:#9BBDD6;padding:6px 8px;font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;border:1px solid #1A3050}';
  css += '.plan-table td{border:1px solid #D4DDE8;padding:4px 6px;text-align:center;vertical-align:middle}';
  css += '.inp{background:#FFFDE7;min-width:90px;height:28px}';
  css += '.cal{background:#E8F5E9;min-width:70px;height:28px}';
  css += '.plan-note{font-size:10px;color:#4A6080;padding:6px 10px;background:#F0F3F8;border-radius:4px;border-left:3px solid #F5A623;margin:6px 0}';
  css += '.legend-inp{display:inline-block;width:14px;height:14px;background:#FFFDE7;border:1px solid #D4DDE8;vertical-align:middle;margin-right:4px}';
  css += '.legend-cal{display:inline-block;width:14px;height:14px;background:#E8F5E9;border:1px solid #D4DDE8;vertical-align:middle;margin-right:4px}';
  css += '.footer{margin-top:40px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center}';
  css += '@media print{body{padding:12px}}';

  var h = '<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="UTF-8">\n';
  h += '<title>Rapport Validation</title>\n';
  h += '<style>'+css+'</style>\n</head>\n<body>\n';

  h += '<h1>Rapport de Validation de M&eacute;thode Analytique</h1>\n';
  h += '<p style="font-size:11px;color:#666;margin-bottom:8px">Profil d\'exactitude &mdash; Feinberg (2010) &middot; ISO&nbsp;5725-2 (2002) &middot; Mee (1984)</p>\n';

  // Meta
  h += '<div class="meta">\n';
  var metas = [
    ['M&eacute;thode',   config.methode||'&mdash;'],
    ['Mat&eacute;riau',  config.materiau||'&mdash;'],
    ['Laboratoire',      opts.labo||'&mdash;'],
    ['Analyste',         opts.analyste||'&mdash;'],
    ['R&eacute;f&eacute;rence', opts.ref||'&mdash;'],
    ['Version',          opts.version||'1.0'],
    ['Date',             dateS],
    ['Statut',           '<span class="badge '+(validity.valid?'valid':validity.partial?'warn':'invalid')+'">'+(validity.valid?'VALIDE':validity.partial?'PARTIEL':'NON VALIDE')+'</span>'],
  ];
  metas.forEach(function(m){ h += '<div><div class="lbl">'+m[0]+'</div><div class="val">'+m[1]+'</div></div>\n'; });
  h += '</div>\n';

  // 1. Paramètres
  if (opts.params !== false) {
    h += '<h2>1. Param&egrave;tres de validation</h2>\n<table>\n';
    h += '<tr><th>Param&egrave;tre</th><th>Valeur</th></tr>\n';
    h += '<tr><td>Type de m&eacute;thode</td><td>'+(isDirect?'Directe':'Indirecte (&eacute;talonnage requis)')+'</td></tr>\n';
    h += '<tr><td>Niveaux K</td><td>'+K+'</td></tr>\n';
    h += '<tr><td>S&eacute;ries I</td><td>'+I+'</td></tr>\n';
    h += '<tr><td>R&eacute;p&eacute;titions J</td><td>'+J+'</td></tr>\n';
    h += '<tr><td>Limite &lambda;</td><td>&plusmn;'+lambda+'%</td></tr>\n';
    h += '<tr><td>Proportion &beta;</td><td>'+beta+'%</td></tr>\n';
    h += '<tr><td>Unit&eacute;</td><td>'+unite+'</td></tr>\n';
    h += '</table>\n';
  }

  // 2. Modèles étalonnage
  if (opts.etalonnage !== false && !isDirect && models && Object.keys(models).length > 0) {
    h += '<h2>2. Mod&egrave;les d\'&eacute;talonnage</h2>\n<table>\n';
    h += '<tr><th>S&eacute;rie</th><th>a&#8320;</th><th>a&#8321;</th><th>R&sup2;</th><th>r</th><th>N</th><th>&Eacute;quation</th></tr>\n';
    Object.keys(models).forEach(function(s) {
      var m = models[s];
      h += '<tr><td>'+s+'</td><td class="mono">'+m.a0.toFixed(4)+'</td><td class="mono">'+m.a1.toFixed(4)+'</td><td class="mono">'+m.r2.toFixed(6)+'</td><td class="mono">'+m.r.toFixed(6)+'</td><td>'+m.n+'</td><td class="mono">Y = '+m.a1.toFixed(4)+' X + '+m.a0.toFixed(4)+'</td></tr>\n';
    });
    h += '</table>\n';
  }

  // 3. Critères
  if (opts.criteria !== false) {
    h += '<h2>3. Crit&egrave;res de justesse et fid&eacute;lit&eacute;</h2>\n<table>\n';
    h += '<tr><th>Niveau</th><th>X&#772; r&eacute;f.</th><th>Z&#772; retrouv.</th><th>s&#7523;</th><th>sB</th><th>sFI</th><th>CV%</th><th>Biais%</th><th>R&eacute;couv.%</th></tr>\n';
    criteria.forEach(function(c) {
      var bs = Math.abs(c.bRel) > lambda ? ' style="color:#991B1B;font-weight:700"' : '';
      h += '<tr><td>'+c.niveau+'</td><td class="mono">'+c.xMean.toFixed(4)+'</td><td class="mono">'+c.zMean.toFixed(4)+'</td><td class="mono">'+c.sr.toFixed(4)+'</td><td class="mono">'+c.sB.toFixed(4)+'</td><td class="mono">'+c.sFI.toFixed(4)+'</td><td class="mono">'+c.cv.toFixed(2)+'</td><td class="mono"'+bs+'>'+c.bRel.toFixed(3)+'</td><td class="mono">'+c.recouvMoy.toFixed(3)+'</td></tr>\n';
    });
    h += '</table>\n';
  }

  // 4. Intervalles β
  if (opts.tolerance !== false) {
    h += '<h2>4. Intervalles &beta;-expectation &mdash; Mee (1984)</h2>\n';
    h += '<p class="fn">Crit&egrave;re : LTB% &ge; '+laBasse.toFixed(0)+'% et LTH% &le; '+laHaute.toFixed(0)+'%</p>\n';
    h += '<table>\n<tr><th>Niveau</th><th>X&#772; r&eacute;f.</th><th>R&eacute;couv.%</th><th>sIT</th><th>k_tol</th><th>&nu;</th><th>LTB%</th><th>LTH%</th><th>L.A. basse</th><th>L.A. haute</th><th>Statut</th></tr>\n';
    tolerances.forEach(function(t) {
      h += '<tr><td>'+t.niveau+'</td><td class="mono">'+t.xMean.toFixed(4)+'</td><td class="mono">'+t.recouvRel.toFixed(3)+'</td><td class="mono">'+t.sIT.toFixed(4)+'</td><td class="mono">'+t.ktol.toFixed(4)+'</td><td class="mono">'+t.nu+'</td><td class="mono">'+(t.ltbRel||0).toFixed(3)+'</td><td class="mono">'+(t.lthRel||0).toFixed(3)+'</td><td class="mono">'+t.laBasse.toFixed(1)+'</td><td class="mono">'+t.laHaute.toFixed(1)+'</td><td><span class="badge '+(t.accept?'valid':'invalid')+'">'+(t.accept?'VALIDE':'NON VALIDE')+'</span></td></tr>\n';
    });
    h += '</table>\n';
  }

  // 5. Aberrants
  if (opts.outliers !== false && outliers) {
    h += '<h2>5. D&eacute;tection des aberrants &mdash; Grubbs (&alpha;=5%)</h2>\n<table>\n';
    h += '<tr><th>Niveau</th><th>X&#772; r&eacute;f.</th><th>N</th><th>G calcul&eacute;</th><th>G critique</th><th>Statut</th></tr>\n';
    outliers.forEach(function(o) {
      h += '<tr><td>'+o.niveau+'</td><td class="mono">'+o.xMean.toFixed(4)+'</td><td>'+o.n+'</td><td class="mono">'+o.grubbs.G+'</td><td class="mono">'+o.grubbs.Gcrit+'</td><td><span class="badge '+(o.grubbs.suspect?'invalid':'valid')+'">'+(o.grubbs.suspect?'ABERRANT ('+(o.grubbs.suspectVal?o.grubbs.suspectVal.toFixed(4):'?')+')':'OK')+'</span></td></tr>\n';
    });
    h += '</table>\n';
  }

  // 6. Profil SVG — rendu garanti, zéro dépendance
  if (opts.profile !== false) {
    h += '<h2>6. Profil d\'exactitude</h2>\n';
    h += '<p class="fn">Axe X : concentration de r&eacute;f&eacute;rence ('+unite+') &mdash; Axe Y : taux de recouvrement (%) &mdash; &beta;='+beta+'%, &lambda;=&plusmn;'+lambda+'%</p>\n';
    h += '<div class="svg-wrap">\n';
    h += buildProfileSVG(tolerances, config);
    h += '</div>\n';
  }

  // 7. Domaine validité
  var vcls = validity.valid ? 'v' : validity.partial ? 'p' : 'i';
  var vtxt = validity.valid ? 'M&Eacute;THODE VALIDE' : validity.partial ? 'M&Eacute;THODE PARTIELLEMENT VALIDE' : 'M&Eacute;THODE NON VALIDE';
  h += '<h2>7. Domaine de validit&eacute;</h2>\n';
  h += '<div class="verdict '+vcls+'"><strong>'+vtxt+'</strong><br>\n';
  h += validity.nValid+' niveau(x) sur '+validity.nTotal+' valid&eacute;(s) &mdash; '+validity.pct+'%.';
  if (validity.domain) h += '<br>Domaine : <strong>'+validity.domain.min.toFixed(3)+' &ndash; '+validity.domain.max.toFixed(3)+' '+unite+'</strong>';
  h += '</div>\n';

  // 8. IA
  if (opts.ai !== false && aiContent) {
    h += '<h2>8. Interpr&eacute;tation par intelligence artificielle</h2>\n';
    h += '<div class="ai-box">'+aiContent.replace(/\n/g,'<br>')+'</div>\n';
  }

  // Annexe A — Plan de validation
  h += '<h2>Annexe A &mdash; Plan de validation (' + (isDirect ? 'M&eacute;thode directe' : 'M&eacute;thode indirecte') + ')</h2>\n';
  h += '<div class="plan-note">';
  h += '<strong>Instructions :</strong> ';
  h += '<span class="legend-inp"></span>Fond jaune = valeur de r&eacute;f&eacute;rence X et r&eacute;ponse mesur&eacute;e &mdash; ';
  if (!isDirect) h += '<span class="legend-cal"></span>Fond vert = calcul automatique (concentration retrouv&eacute;e, biais). &mdash; ';
  h += 'Plan configur&eacute; : K='+K+' niveaux &times; I='+I+' s&eacute;ries &times; J='+J+' r&eacute;p&eacute;titions = <strong>'+(K*I*J)+' mesures</strong>.';
  h += '</div>\n';
  h += buildPlanValidationTable(K, I, J, unite, isDirect);

  // Annexe B — Plan d'étalonnage (méthode indirecte uniquement)
  if (!isDirect) {
    h += '<h2>Annexe B &mdash; Plan d\'&eacute;talonnage (M&eacute;thode indirecte)</h2>\n';
    h += '<div class="plan-note">';
    h += '<strong>R&egrave;gle de synchronisation :</strong> ';
    h += 'Chaque s&eacute;rie d\'&eacute;talonnage (i) doit &ecirc;tre r&eacute;alis&eacute;e le m&ecirc;me jour / m&ecirc;me op&eacute;rateur que la s&eacute;rie de validation correspondante. ';
    h += 'Minimum recommand&eacute; : K\'=2 niveaux, J\'=2 r&eacute;p&eacute;titions. ';
    h += 'Plan configur&eacute; : K\'=2 &times; I='+I+' &times; J\'=2 = <strong>'+(2*I*2)+' mesures</strong>.';
    h += '</div>\n';
    h += buildPlanEtalonnageTable(2, I, 2, unite);
  }

  h += '<div class="footer">Rapport g&eacute;n&eacute;r&eacute; par <strong>Accuracy Profile Add-in</strong> &mdash; '+dateS+' &agrave; '+timeS+'<br>Feinberg (2010) &middot; ISO&nbsp;5725-2 &middot; Mee (1984) &middot; ICH Q2(R1)<br>R&eacute;f. : '+(opts.ref||'&mdash;')+' v'+(opts.version||'1.0')+'</div>\n';
  h += '</body>\n</html>';
  return h;
}

function downloadHTMLReport(html, filename) {
  var blob = new Blob([html], { type: "text/html;charset=utf-8" });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement("a");
  a.href   = url;
  a.download = filename || "Rapport_Validation.html";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

window.ReportGenerator = { generateHTMLReport, downloadHTMLReport };