"""
================================================================
main.py — Point d'entrée de l'API Accuracy Profile v2
FastAPI · Production-ready · CORS · Logging · Middleware
================================================================
"""
from __future__ import annotations
import logging
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any, Callable

import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── Logging structuré ──────────────────────────────────────────────────────────
logging.basicConfig(
    level   = logging.INFO,
    format  = "%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt = "%Y-%m-%dT%H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("accuracy_profile")


# ── Startup / Shutdown ─────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("═══════════════════════════════════════")
    logger.info("  Accuracy Profile API v2 — Démarrage")
    logger.info("═══════════════════════════════════════")
    # Pré-imports pour vérifier les dépendances
    try:
        import numpy, scipy, pandas, statsmodels, sklearn, matplotlib
        logger.info("Dépendances scientifiques : OK")
    except ImportError as e:
        logger.error("Dépendance manquante : %s", e)
    yield
    logger.info("API arrêtée proprement.")


# ── Application FastAPI ────────────────────────────────────────────────────────

app = FastAPI(
    title       = "Accuracy Profile API",
    description = (
        "Backend industriel pour la validation analytique du profil d'exactitude.\n\n"
        "**Référentiels** : ISO 5725-2 · ICH Q2(R1) · Feinberg (2010) · Mee (1984)\n\n"
        "**Compatible** Excel Add-in (JavaScript) + déploiement SaaS (Render / Docker)"
    ),
    version     = "2.0.0",
    contact     = {
        "name":  "Accuracy Profile",
        "email": "support@accuracy-profile.lab",
    },
    license_info = {
        "name": "MIT",
    },
    docs_url    = "/docs",
    redoc_url   = "/redoc",
    lifespan    = lifespan,
)


# ── CORS ───────────────────────────────────────────────────────────────────────
# En développement : origins = ["*"]
# En production : restreindre aux origines légitimes
ALLOWED_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:8080,https://appsforoffice.microsoft.com"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ALLOWED_ORIGINS + ["*"],  # "*" pour le développement
    allow_credentials = True,
    allow_methods     = ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers     = ["*"],
    expose_headers    = ["Content-Disposition", "X-Request-ID", "X-Process-Time"],
)


# ── Middleware — Request ID + timing ──────────────────────────────────────────

@app.middleware("http")
async def add_request_metadata(request: Request, call_next: Callable) -> Response:
    """Ajoute un ID unique et mesure le temps de traitement à chaque requête."""
    req_id = str(uuid.uuid4())[:8]
    start  = time.perf_counter()
    request.state.request_id = req_id

    logger.info("→ %s %s [%s]", request.method, request.url.path, req_id)

    response = await call_next(request)

    elapsed = round((time.perf_counter() - start) * 1000, 1)
    response.headers["X-Request-ID"]    = req_id
    response.headers["X-Process-Time"]  = f"{elapsed}ms"

    logger.info("← %s %s [%s] %dms", request.method, request.url.path,
                req_id, elapsed)
    return response


# ── Gestionnaires d'erreurs globaux ───────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    req_id = getattr(request.state, "request_id", "?")
    logger.exception("Erreur non gérée [%s]: %s", req_id, exc)
    return JSONResponse(
        status_code = 500,
        content     = {
            "status":     "error",
            "code":       500,
            "message":    "Erreur serveur interne — consultez les logs",
            "request_id": req_id,
        },
    )


# ── Router principal ───────────────────────────────────────────────────────────
from routes.accuracy import router as accuracy_router
app.include_router(accuracy_router)


# ── Endpoint racine ────────────────────────────────────────────────────────────

@app.get("/", tags=["Système"], summary="Informations sur l'API")
def root() -> dict:
    return {
        "service":  "Accuracy Profile API",
        "version":  "2.0.0",
        "status":   "ok",
        "docs":     "/docs",
        "health":   "/api/health",
        "endpoints": {
            "main":          "POST /accuracy-profile",
            "simple":        "POST /api/simple",
            "grubbs":        "POST /api/grubbs",
            "calibration":   "POST /api/calibration",
            "interpret":     "POST /api/interpret",
            "chat":          "POST /api/chat",
            "pdf_report":    "POST /api/report/pdf",
            "health":        "GET  /api/health",
            "norms":         "GET  /api/norms",
        },
        "references": [
            "ISO 5725-2 (justesse et fidélité)",
            "ICH Q2(R1) (validation pharmaceutique)",
            "Feinberg M. (2010) — Profil d'exactitude",
            "Mee R.W. (1984) — β-expectation tolerance intervals",
        ],
    }


# ── Lancement direct ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    port  = int(os.getenv("PORT", 8000))
    host  = os.getenv("HOST", "0.0.0.0")
    debug = os.getenv("DEBUG", "false").lower() == "true"

    logger.info("Lancement sur %s:%d (debug=%s)", host, port, debug)
    uvicorn.run(
        "main:app",
        host        = host,
        port        = port,
        reload      = debug,
        log_level   = "info",
        access_log  = False,   # Géré par notre middleware
        workers     = 1,       # 1 pour dev ; utiliser gunicorn en prod
    )
