// =========================================================================
// Archivo: public/js/menu-nuevo.js
// Versión: 1 - Dashboard con Bootstrap 5 y Sidebar
// =========================================================================
(function () {
  const READY = (cb) => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", cb) : cb();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // Configuración de módulos con iconos y submenús
  const MODULES_CONFIG = [
    {
      id: 'buscar',
      name: 'Buscar',
      icon: 'bi-search',
      submodules: [
        { id: 'buscar-general', name: 'Búsqueda General', icon: 'bi-folder2-open' },
        { id: 'buscar-gpon', name: 'Recepciones GPON', icon: 'bi-reception-4' }
      ]
    },
    {
      id: 'infra_movil',
      name: 'Modo Construcción',
      icon: 'bi-cone-striped',
      submodules: []
    },
    {
      id: 'incidencia',
      name: 'Incidencias',
      icon: 'bi-exclamation-triangle',
      submodules: []
    },
    {
      id: 'ruta',
      name: 'Ruta',
      icon: 'bi-compass',
      submodules: []
    },
    {
      id: 'usuarios',
      name: 'Usuarios',
      icon: 'bi-people',
      submodules: []
    },
    {
      id: 'infraestructura',
      name: 'Infraestructura',
      icon: 'bi-building',
      submodules: []
    },
    {
      id: 'carga',
      name: 'Carga Masiva',
      icon: 'bi-upload',
      submodules: []
    },
    {
      id: 'reportes',
      name: 'Reportes Capacidad',
      icon: 'bi-bar-chart',
      submodules: []
    },
    {
      id: 'reportes_incidencias',
      name: 'Dashboard Averías',
      icon: 'bi-graph-up',
      submodules: []
    },
    {
      id: 'bitacora',
      name: 'Bitácora',
      icon: 'bi-journal-text',
      submodules: []
    },
    {
      id: 'recepciones',
      name: 'Recepción GPON',
      icon: 'bi-check-circle',
      submodules: []
    },
    {
      id: 'dashboard_gpon',
      name: 'Dashboard GPON',
      icon: 'bi-speedometer2',
      submodules: []
    }
  ];

  let currentUser = null;

  async function fetchMe() {
    try {
      const r = await fetch("/api/me?_=" + Date.now(), { credentials: "include", cache: "no-store" });
      if (!r.ok) return null;
      const data = await r.json().catch(() => null);
      return data?.user || null;
    } catch { return null; }
  }

  function renderSidebar(user) {
    const menuContainer = $('#sidebarMenu');
    if (!menuContainer) return;

    let modulos = user.modulos_activos || {};
    if (typeof modulos === 'string') {
      try { modulos = JSON.parse(modulos); } catch(e) { modulos = {}; }
    }

    // Determinar qué módulos mostrar
    let visibleModules = [];
    
    if (user.admin) {
      // Admin solo ve Usuarios y Bitácora
      visibleModules = ['usuarios', 'bitacora'];
    } else {
      // Técnicos ven solo los autorizados
      visibleModules = Object.entries(modulos)
        .filter(([_, isActive]) => isActive === true)
        .map(([modName, _]) => modName);
    }

    // Generar HTML del menú
    let html = '';
    
    MODULES_CONFIG.forEach(module => {
      if (!visibleModules.includes(module.id)) return;

      const hasSubmodules = module.submodules && module.submodules.length > 0;
      
      if (hasSubmodules) {
        // Menú con accordion para submenús
        html += `
          <div class="menu-item">
            <button class="menu-link" data-bs-toggle="collapse" data-bs-target="#submenu-${module.id}" aria-expanded="false">
              <span>
                <i class="bi ${module.icon}"></i>
                ${module.name}
              </span>
              <i class="bi bi-chevron-down chevron"></i>
            </button>
            <div class="collapse submenu" id="submenu-${module.id}">
              ${module.submodules.map(sub => `
                <div class="submenu-item">
                  <a href="#" class="submenu-link" data-module="${module.id}" data-submodule="${sub.id}">
                    <i class="bi ${sub.icon} me-2"></i>
                    ${sub.name}
                  </a>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      } else {
        // Menú simple sin submenús
        html += `
          <div class="menu-item">
            <a href="#" class="menu-link" data-module="${module.id}">
              <span>
                <i class="bi ${module.icon}"></i>
                ${module.name}
              </span>
            </a>
          </div>
        `;
      }
    });

    menuContainer.innerHTML = html;

    // Agregar event listeners
    $$('.menu-link[data-module]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const moduleId = link.dataset.module;
        showModule(moduleId);
        
        // Actualizar estado activo
        $$('.menu-link').forEach(l => l.classList.remove('active'));
        $$('.submenu-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        // En móvil, cerrar sidebar después de seleccionar
        if (window.innerWidth <= 768) {
          toggleSidebar(false);
        }
      });
    });

    $$('.submenu-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const moduleId = link.dataset.module;
        const submoduleId = link.dataset.submodule;
        showModule(moduleId, submoduleId);
        
        // Actualizar estado activo
        $$('.submenu-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        // En móvil, cerrar sidebar después de seleccionar
        if (window.innerWidth <= 768) {
          toggleSidebar(false);
        }
      });
    });
  }

  function showModule(moduleId, submoduleId = null) {
    // Ocultar todos los módulos
    $$('.module-section').forEach(section => {
      section.classList.remove('active');
    });

    // Mostrar el módulo seleccionado
    const targetSection = $(`#module-${moduleId}`);
    if (targetSection) {
      targetSection.classList.add('active');
      
      // Si hay submódulo, manejar lógica específica
      if (submoduleId) {
        console.log(`Mostrando submódulo: ${submoduleId} en ${moduleId}`);
        // Aquí puedes agregar lógica específica para cada submódulo
        // Por ejemplo, mostrar/ocultar tabs en buscar.html
        if (moduleId === 'buscar') {
          if (submoduleId === 'buscar-general') {
            const tabBtn = $('#tab-general-btn');
            if (tabBtn) {
              const tab = new bootstrap.Tab(tabBtn);
              tab.show();
            }
          } else if (submoduleId === 'buscar-gpon') {
            const tabBtn = $('#tab-gpon-btn');
            if (tabBtn) {
              const tab = new bootstrap.Tab(tabBtn);
              tab.show();
            }
          }
        }
      }
    }
  }

  function updateUserInfo(user) {
    if (!user) {
      $('#userName').textContent = 'Sesión expirada';
      $('#userRole').textContent = '';
      $('#userAvatar').textContent = '?';
      return;
    }

    const nombre = (user.nombre && String(user.nombre).trim()) || user.usuario || 'Usuario';
    const initial = nombre.charAt(0).toUpperCase();
    
    $('#userName').textContent = nombre;
    $('#userRole').textContent = user.admin ? 'Administrador' : 'Técnico';
    $('#userAvatar').textContent = initial;
  }

  function toggleSidebar(show) {
    const sidebar = $('#sidebar');
    const overlay = $('#sidebarOverlay');
    
    if (show === undefined) {
      show = !sidebar.classList.contains('show');
    }
    
    if (show) {
      sidebar.classList.add('show');
      overlay.classList.add('show');
    } else {
      sidebar.classList.remove('show');
      overlay.classList.remove('show');
    }
  }

  function wireUI() {
    // Toggle sidebar
    $('#sidebarToggle')?.addEventListener('click', () => toggleSidebar());
    
    // Overlay click
    $('#sidebarOverlay')?.addEventListener('click', () => toggleSidebar(false));
    
    // Logout
    $('#btnLogout')?.addEventListener('click', async () => {
      try { await fetch("/api/logout", { method: "POST" }); } catch {}
      location.href = "/login.html";
    });
  }

  READY(async () => {
    wireUI();
    const user = await fetchMe();
    currentUser = user;
    updateUserInfo(user);
    renderSidebar(user);
    
    // Mostrar primer módulo por defecto
    const firstModule = $('.menu-link[data-module]');
    if (firstModule) {
      firstModule.click();
    }
  });
})();
