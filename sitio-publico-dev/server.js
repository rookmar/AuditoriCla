// =========================================================================
// Archivo: server.js
// Descripción: Bootstrap del servidor (Motor 100% JSON Módulos)
// =========================================================================
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const cors = require("cors");
const path = require("path");
let morgan = null;
try { morgan = require("morgan"); } catch {}

const { ensureTables, pool } = require("./server/db");
const { applyAuth } = require("./server/auth"); // Solo necesitamos a este portero maestro
const registerStatic = require("./server/static");

const app = express();
app.disable("x-powered-by");

const TRUST_PROXY = String(process.env.TRUST_PROXY || "0") === "1";
if (TRUST_PROXY) app.set("trust proxy", 1);

if (morgan) app.use(morgan("dev"));
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

const ORIGINS = (process.env.CORS_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin: (origin, cb) => {
        if (!origin || !ORIGINS.length) return cb(null, true);
        return cb(null, ORIGINS.includes(origin));
    },
    credentials: true,
}));

app.use(session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: TRUST_PROXY,
        maxAge: 1000 * 60 * 60 * 8,
    },
}));

if (pool) {
    app.set("db", pool);
    app.use((req, _res, next) => {
        req.db = pool;
        req.pool = pool;
        next();
    });
}

app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));
app.get("/api/health", (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

/* =======================================================================
   0) RUTAS PÚBLICAS Y DESCARGAS DIRECTAS (Antes del portero)
   ======================================================================= */
try { app.use("/api/plantillas", require("./server/routes/plantillas")); } catch (e) { console.warn("[routes] Error en /api/plantillas:", e.message); }

/* =======================================================================
   1) EL PORTERO GLOBAL (JSON MODULES)
   ======================================================================= */
// applyAuth intercepta TODAS las rutas HTML y API y bloquea/permite el acceso.
applyAuth(app);

/* =======================================================================
   2) AUTENTICACIÓN
   ======================================================================= */
app.use("/api", require("./server/routes/login")); 

/* =======================================================================
   3) RUTAS DE INTERFAZ HTML
   ======================================================================= */
app.get("/infra_movil.html", (req, res) => res.sendFile(path.join(__dirname, "public", "infra_movil.html")));
app.get("/incidencia.html", (req, res) => res.sendFile(path.join(__dirname, "public", "incidencia.html")));
app.get("/reportes_incidencias.html", (req, res) => res.sendFile(path.join(__dirname, "public", "reportes_incidencias.html")));
app.get("/recepciones.html", (req, res) => res.sendFile(path.join(__dirname, "public", "recepciones.html")));
// Nueva Ruta para la Vista del Dashboard GPON
app.get("/dashboard-gpon.html", (req, res) => res.sendFile(path.join(__dirname, "public", "dashboard-gpon.html")));

/* =======================================================================
   4) API DE MODULOS Y RUTAS ESTÁNDAR
   ======================================================================= */
try { app.use("/api/movil", require("./server/routes/infra_movil")); } catch (e) { console.warn("[routes] Error en /api/movil:", e.message); }

// RUTAS OPERATIVAS Y ANALÍTICAS (SEPARADAS)
try { app.use("/api/incidencia", require("./server/routes/incidencia")); } catch (e) { console.warn("[routes] Error en /api/incidencia:", e.message); }
try { app.use("/api/reportes_incidencias", require("./server/routes/reportes_incidencias")); } catch (e) { console.warn("[routes] Error en /api/reportes_incidencias:", e.message); }

try { app.use("/api/infra", require("./server/routes/infraestructura")); } catch (e) { console.warn("[routes] Error en /api/infra"); }
try { app.use("/api/mufas", require("./server/routes/mufas")); } catch (e) { console.warn("[routes] Error en /api/mufas:", e.message); }
try { app.use("/api/reportes", require("./server/routes/reportes")); } catch (e) {}
try { app.use("/api/bitacora", require("./server/routes/bitacora")); } catch (e) {}
try { app.use("/api/modulos", require("./server/routes/recepciones")); } catch (e) { console.warn("[routes] Error en /api/modulos:", e.message); }
try { app.use("/api/carga-masiva", require("./server/routes/carga-masiva")); } catch (e) {}
try { app.use("/api/buscar", require("./server/routes/buscar")); } catch (e) {}
try { app.use("/api/mapa", require("./server/routes/mapa")); } catch (e) {}
try { app.use("/api/ruta", require("./server/routes/ruta")); } catch (e) {}
try { app.use("/api", require("./server/routes/clientes")); } catch (e) {}
try { app.use("/api/falla", require("./server/routes/falla")); } catch (e) { console.warn("[routes] Error en /api/falla:", e.message); }
try { app.use("/api", require("./server/routes/usuarios")); } catch (e) {}
// Nueva Ruta para la API del Dashboard GPON
try { app.use("/api/dashboard-gpon", require("./server/routes/dashboard-gpon")); } catch (e) { console.warn("[routes] Error en /api/dashboard-gpon:", e.message); }

/* =======================================================================
   5) LEGACY Y FINALIZACIÓN
   ======================================================================= */
try { app.use("/api/legacy/ruta", require("./server/routes/legacy/ruta")); } catch (e) {}
try { app.use("/api/legacy/mapa", require("./server/routes/legacy/mapa")); } catch (e) {}

registerStatic(app);

// ---- Arranque del Servidor ----
(async () => {
    try {
        await ensureTables();
        console.log("[DB] Sistema de tablas OK.");
    } catch (e) { console.error("[DB] Error de inicio:", e); }

    const PORT = Number(process.env.PORT || 3000);
    app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Servidor en puerto ${PORT} (Motor JSON Activo)`));
})();