module.exports = {
  apps: [
    { name: "auditoriafibra", script: "server.js", cwd: "/var/www/sitio-publico",
      env: { NODE_ENV: "production", PORT: 3000 } }
  ]
};
