// Routeur (hash) et démarrage.
const App = {
  render() {
    const hash = location.hash.replace(/^#\/?/, '') || 'dashboard';
    const [path, qs] = hash.split('?');
    const [name, ...params] = path.split('/');
    const query = new URLSearchParams(qs || '');
    const view = Views[name] || Views.dashboard;
    const root = document.getElementById('app');
    root.innerHTML = view(params, query);
    if (view.bind) view.bind(root, params, query);

    const section = { affaire: 'affaires', facture: 'factures' }[name] || name;
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === `#/${section}`));
  },

  toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#2b2522;color:#fff;padding:10px 16px;border-radius:6px;z-index:20';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  },
};

document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') Modal.close(); });
window.addEventListener('hashchange', () => { Modal.close(); App.render(); });
Store.load();
App.render();
