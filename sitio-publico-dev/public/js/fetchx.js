// public/static/fetchx.js
(function () {
  window.fetchx = async function (url, opts = {}) {
    const headers = new Headers(opts.headers || {});
    const method = (opts.method || 'GET').toUpperCase();

    if (!headers.has('Content-Type') && method !== 'GET' && !(opts.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const csrf = document.cookie.split('; ')
      .find(v => v.startsWith('XSRF-TOKEN='))?.split('=')[1];
    if (csrf) headers.set('x-csrf-token', decodeURIComponent(csrf));

    const resp = await fetch(url, {
      credentials: 'include',
      ...opts,
      headers
    });

    if (resp.status === 401) {
      location.href = '/login.html';
      throw new Error('401');
    }
    return resp;
  };
})();
