// server/static.js
const path = require("path");
const express = require("express");
const { publicDir, sendCsv } = require("./utils");
const { requireLogin, requireAdmin } = require("./auth");

function registerStatic(app) {
  // estáticos
  app.use(express.static(publicDir));

  // páginas
  app.get("/", (req, res) => {
    if (req.session && req.session.user) {
      return res.sendFile(path.join(publicDir, "menu.html"));
    }
    return res.redirect("/login.html");
  });
  app.get("/menu.html", requireLogin, (_req, res) => res.sendFile(path.join(publicDir, "menu.html")));
  app.get("/mapa.html", requireLogin, (_req, res) => res.sendFile(path.join(publicDir, "mapa.html")));
  app.get("/infraestructura.html", requireLogin, (_req, res) => res.sendFile(path.join(publicDir, "infraestructura.html")));
  app.get("/usuarios.html", requireAdmin, (_req, res) => res.sendFile(path.join(publicDir, "usuarios.html")));
  app.get("/buscar.html", requireLogin, (_req, res) => res.sendFile(path.join(publicDir, "buscar.html")));
  app.get("/ruta.html", requireLogin, (_req, res) => res.sendFile(path.join(publicDir, "ruta.html")));
  app.get("/carga-masiva.html", requireLogin, (_req, res) => res.sendFile(path.join(publicDir, "carga-masiva.html")));
}

module.exports = registerStatic;
