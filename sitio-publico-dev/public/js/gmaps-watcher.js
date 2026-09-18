// public/js/gmaps-watcher.js
// Hace robusto el callback de Google Maps para que SIEMPRE inicialice.
// No toca tu lógica: llama a tu initMap/initInfraMap original una sola vez.

(function () {
  function makeWatcher(cbName) {
    let realInit = null;        // función real que tu JS define
    let called = false;         // bandera para no doble-inicializar

    // función que llama a la real cuando Google y tu código estén listos
    function tryInit() {
      if (called) return;
      if (typeof realInit === "function" && window.google && google.maps) {
        called = true;
        try { realInit(); } catch (e) { console.error(e); }
      }
    }

    // Intercepta asignaciones a window[cbName]
    try {
      Object.defineProperty(window, cbName, {
        configurable: true,
        enumerable: true,
        set(fn) { realInit = fn; tryInit(); },        // tu JS la define
        get() {                                      // Google la invoca
          return function () { tryInit(); };
        },
      });
    } catch (e) {
      // Algunos navegadores antiguos no permiten defineProperty sobre window:
      // Fallback: usa un alias interno.
      const alias = "__" + cbName + "_real__";
      window[alias] = null;
      window[cbName] = function () { tryInit(); };
      const orig = window[cbName];
      Object.defineProperty(window, alias, {
        configurable: true,
        set(fn) { realInit = fn; tryInit(); },
        get() { return realInit; },
      });
      // Si tu JS asigna window[cbName], re-engancha:
      const _set = (fn) => { window[alias] = fn; };
      window[cbName].__set = _set;
    }

    // Fallbacks por si el orden de carga se complica
    window.addEventListener("load", () => setTimeout(tryInit, 0));
    let retries = 40; // ~6s
    (function waiter() {
      if (called) return;
      if (window.google && google.maps) { tryInit(); return; }
      if (--retries > 0) setTimeout(waiter, 150);
    })();
  }

  // Observa ambos callbacks (no molesta si solo usas uno)
  makeWatcher("initMap");
  makeWatcher("initInfraMap");
})();

