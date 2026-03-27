/**
 * ================================================================
 * geminiAI.js — Interprétation intelligente par IA Gemini
 * Spécialisé en validation analytique : ISO 5725-2 / ICH Q2(R1)
 * ================================================================
 */
"use strict";

const GEMINI = {
  endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
  maxTokens: 2048,
  storageKey: "ap_gemini_key",
};

// Stockage en mémoire (fallback si localStorage bloqué par Office)
const _mem = {};
let   _apiKey = "";
let   _chatHistory = [];

function storage_get(key) {
  try { return localStorage.getItem(key); } catch { return _mem[key] ?? null; }
}
function storage_set(key, val) {
  try { localStorage.setItem(key, val); } catch { _mem[key] = val; }
}

function setApiKey(key) {
  _apiKey = key.trim();
  storage_set(GEMINI.storageKey, _apiKey);
}

function loadApiKey() {
  const saved = storage_get(GEMINI.storageKey);
  if (saved) _apiKey = saved;
  return _apiKey;
}

function hasApiKey() { return !!_apiKey; }

// ─── Requête Gemini ───────────────────────────────────────────────────────────

async function _call(systemPrompt, userContent, jsonMode = false) {
  if (!_apiKey) throw new Error("Clé API Gemini non renseignée — onglet IA.");

  const payload = {
    contents: [
      { role: "user", parts: [{ text: `${systemPrompt}\n\n${userContent}` }] }
    ],
    generationConfig: {
      maxOutputTokens: GEMINI.maxTokens,
      temperature: jsonMode ? 0.1 : 0.35,
    },
  };

  const resp = await fetch(`${GEMINI.endpoint}?key=${_apiKey}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Erreur API ${resp.status}`);
  }

  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  if (jsonMode) {
    const clean = text.replace(/```json|```/g, "").trim();
    try { return JSON.parse(clean); } catch { return { raw: text }; }
  }
  return text;
}

// ─── Prompt système spécialisé ────────────────────────────────────────────────

const SYSTEM_ANALYTIQUE = `Tu es un expert en validation analytique de méthodes chimiques, spécialisé dans :
- La méthode du Profil d'Exactitude de Feinberg (2010)
- Les normes ISO 5725-1 et ISO 5725-2 (justesse et fidélité)
- Les critères ICH Q2(R1) pour les méthodes pharmaceutiques
- La statistique de Mee (1984) pour les intervalles β-expectation
- La validation selon la norme ISO 17025

Tu réponds en français, de manière précise, structurée et actionnable.
Tu utilises la notation scientifique appropriée (β, λ, σ, X̄, Z̄, etc.).
Tu fournis des interprétations chiffrées et des recommandations pratiques.`;

// ─── Analyses spécialisées ────────────────────────────────────────────────────

/**
 * Diagnostic complet de validation.
 */
async function diagnosticComplet(results, config) {
  const { criteria, tolerances, validity, outliers } = results;
  const { beta, lambda, methodType } = config;

  const tolSummary = tolerances.map(t =>
    `  Niveau ${t.niveau} (X̄=${t.xMean.toFixed(3)} ${config.unite||""}) : ` +
    `Récouv.=${t.recouvRel.toFixed(2)}% | LTB=${t.ltbRel?.toFixed(2)||"?"}% | LTH=${t.lthRel?.toFixed(2)||"?"}% → ${t.accept ? "VALIDE" : "NON VALIDE"}`
  ).join("\n");

  const critSummary = criteria.map(c =>
    `  Niveau ${c.niveau} : sr=${c.sr.toFixed(4)} | sFI=${c.sFI.toFixed(4)} | CV=${c.cv.toFixed(2)}% | Biais=${c.bRel.toFixed(2)}%`
  ).join("\n");

  const outlierSummary = outliers.map(o =>
    `  Niveau ${o.niveau} : G=${o.grubbs.G} (Gcrit=${o.grubbs.Gcrit}) → ${o.grubbs.suspect ? "⚠ ABERRANT DÉTECTÉ" : "OK"}`
  ).join("\n");

  const prompt = `
RAPPORT D'ANALYSE — PROFIL D'EXACTITUDE

Paramètres :
- Méthode : ${config.methode || "—"} | Matériau : ${config.materiau || "—"}
- Type : ${methodType} | β = ${beta*100}% | λ = ±${lambda*100}%
- Critères : ${validity.nValid}/${validity.nTotal} niveaux validés (${validity.pct}%)

CRITÈRES DE FIDÉLITÉ PAR NIVEAU :
${critSummary}

INTERVALLES β-EXPECTATION :
${tolSummary}

ABERRANTS (Grubbs α=5%) :
${outlierSummary}

Produire un rapport complet structuré avec :
1. **Statut global** de validation (valide / partiellement valide / non valide) avec justification chiffrée
2. **Analyse de la fidélité** : interprétation de sr, sB, sFI et CV pour chaque niveau
3. **Analyse de la justesse** : interprétation du biais et du taux de recouvrement
4. **Domaine de validité** : concentration minimale et maximale validées
5. **Causes probables** des non-conformités (si applicable)
6. **Recommandations** (3–5 actions concrètes et chiffrées) pour améliorer ou étendre la validation
7. **Conformité réglementaire** : commentaire par rapport à ISO 5725-2 et ICH Q2(R1)`;

  return _call(SYSTEM_ANALYTIQUE, prompt);
}

/**
 * Interprétation spécifique du profil d'exactitude.
 */
async function interpreterProfil(tolerances, validity, config) {
  const lines = tolerances.map(t =>
    `Niveau ${t.niveau} (${t.xMean.toFixed(3)} ${config.unite||""}): ` +
    `LTB=${t.ltbRel?.toFixed(2)||"?"}% / LTH=${t.lthRel?.toFixed(2)||"?"}% | ` +
    `Acceptable: ${t.laBasse}–${t.laHaute}% → ${t.accept?"DANS":"HORS"} les limites`
  ).join("\n");

  return _call(SYSTEM_ANALYTIQUE, `
Interpréter ce profil d'exactitude (β=${config.beta*100}%, λ=±${config.lambda*100}%) :

${lines}

Domaine validé : ${validity.nValid}/${validity.nTotal} niveaux

Fournir :
1. **Lecture graphique** du profil (tendance générale, zones critiques)
2. **Interprétation statistique** des intervalles de tolérance trop larges
3. **Impact pratique** sur l'utilisation en routine de la méthode
4. **Seuil de concentration limite** à partir duquel la méthode devient critique`);
}

/**
 * Analyse des valeurs aberrantes.
 */
async function analyserAberrants(outliers, config) {
  const summary = outliers.map(o =>
    `Niveau ${o.niveau} (X̄=${o.xMean.toFixed(3)}, n=${o.n}): G=${o.grubbs.G}, Gcrit=${o.grubbs.Gcrit} → ${o.grubbs.suspect ? `ABERRANT = ${o.grubbs.suspectVal?.toFixed(4)}` : "Aucun aberrant"}`
  ).join("\n");

  return _call(SYSTEM_ANALYTIQUE, `
Test de Grubbs (α=5%) — Résultats :
${summary}

Fournir :
1. **Interprétation statistique** de chaque résultat du test de Grubbs
2. **Causes analytiques probables** des valeurs aberrantes identifiées
3. **Décision** : inclure ou exclure chaque aberrant avec justification
4. **Impact** de l'exclusion sur les critères de fidélité et le profil d'exactitude
5. **Actions correctives** recommandées`);
}

/**
 * Recommandations d'amélioration.
 */
async function recommandations(results, config) {
  const { validity, criteria, tolerances } = results;

  const weakPoints = criteria
    .filter(c => c.cv > 5 || Math.abs(c.bRel) > 5)
    .map(c => `Niveau ${c.niveau}: CV=${c.cv.toFixed(1)}%, Biais=${c.bRel.toFixed(1)}%`)
    .join("; ");

  return _call(SYSTEM_ANALYTIQUE, `
Méthode : ${config.methode || "—"} | Validité : ${validity.pct}%
Points faibles : ${weakPoints || "Aucun identifié"}
Niveaux non valides : ${tolerances.filter(t => !t.accept).map(t => t.niveau).join(", ") || "Aucun"}

Proposer un plan d'amélioration détaillé :
1. **Optimisation de la fidélité** (réduire sr et sB au niveau critique)
2. **Correction du biais** (si biais systématique identifié)
3. **Extension du domaine de validité** (vers les basses ou hautes concentrations)
4. **Amélioration de l'étalonnage** (si méthode indirecte)
5. **Plan d'expériences complémentaires** (nouveaux niveaux, répétitions)
Chaque recommandation doit être chiffrée et réalisable.`);
}

// ─── Chat interactif ──────────────────────────────────────────────────────────

function resetChat() { _chatHistory = []; }
function getChatLength() { return _chatHistory.length; }

async function sendChat(message, context = {}) {
  _chatHistory.push({ role: "user", text: message });

  const ctxText = Object.keys(context).length
    ? `\nContexte analytique courant :\n${JSON.stringify(context, null, 2)}\n`
    : "";

  const histText = _chatHistory
    .slice(-8)
    .map(m => `${m.role === "user" ? "Analyste" : "Assistant"}: ${m.text}`)
    .join("\n");

  const resp = await _call(SYSTEM_ANALYTIQUE + ctxText, histText);
  _chatHistory.push({ role: "assistant", text: resp });
  return resp;
}

// ─── Formatage HTML ───────────────────────────────────────────────────────────

function formatHTML(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>")
    .replace(/^(\d+)\.\s+/gm, "<br><b>$1.</b> ");
}

window.GeminiAI = {
  setApiKey, loadApiKey, hasApiKey,
  diagnosticComplet,
  interpreterProfil,
  analyserAberrants,
  recommandations,
  sendChat, resetChat, getChatLength,
  formatHTML,
};