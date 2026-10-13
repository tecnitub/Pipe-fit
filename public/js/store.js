// Cache local des données serveur + synchronisation (API REST et événements temps réel).
const COLLECTIONS = ['users', 'entreprises', 'contacts', 'articles', 'zones', 'affaires', 'devis', 'factures', 'planning', 'temps', 'envois'];

const CLIENT_ID = uid(); // identifie cet onglet, pour ignorer l'écho de nos propres modifications

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: method !== 'GET' ? { 'Content-Type': 'application/json', 'X-Client-Id': CLIENT_ID } : {},
    body: body !== undefined ? JSON.stringify(body) : (method !== 'GET' ? '{}' : undefined),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `Erreur ${res.status}`), { status: res.status, data });
  return data;
}

const Store = {
  data: null,
  me: null,

  async load() {
    this.data = await api('GET', '/api/data');
    COLLECTIONS.forEach(c => { if (!this.data[c]) this.data[c] = []; });
  },

  all(col) { return this.data[col]; },
  get(col, id) { return this.data[col].find(x => x.id === id); },

  _put(col, rec) {
    const i = this.data[col].findIndex(x => x.id === rec.id);
    if (i >= 0) this.data[col][i] = rec; else this.data[col].push(rec);
  },

  // Mise à jour immédiate de l'affichage, puis enregistrement serveur (contrôle de version).
  // Les enregistrements d'un même élément sont envoyés l'un après l'autre.
  _inflight: new Map(),
  upsert(col, obj) {
    if (!obj.id) obj.id = uid();
    this._put(col, obj);
    const key = col + '/' + obj.id;
    const state = this._inflight.get(key);
    if (state) state.pending = obj; else this._send(col, obj, key);
    return obj;
  },

  _send(col, obj, key) {
    const state = { pending: null };
    this._inflight.set(key, state);
    api('PUT', `/api/records/${col}/${encodeURIComponent(obj.id)}`, { data: obj, version: obj._v })
      .then(rec => {
        this._inflight.delete(key);
        if (state.pending) {
          // Une modification plus récente attend : on la renvoie avec la nouvelle version.
          Object.assign(state.pending, { _v: rec._v, _at: rec._at, _by: rec._by, numero: rec.numero, code: rec.code });
          this._send(col, state.pending, key);
          return;
        }
        const numeroChanged = rec.numero !== obj.numero || rec.code !== obj.code;
        Object.assign(obj, rec);
        this._put(col, obj);
        if (numeroChanged || col === 'factures') App.render();
      })
      .catch(err => { this._inflight.delete(key); this._onError(err, col, obj.id); });
  },

  // Import groupé : une requête, puis mise à jour du cache
  async bulk(col, items) {
    const recs = await api('POST', `/api/bulk/${col}`, { items });
    recs.forEach(r => this._put(col, r));
    return recs;
  },

  remove(col, id) {
    const prev = this.get(col, id);
    this.data[col] = this.data[col].filter(x => x.id !== id);
    api('DELETE', `/api/records/${col}/${encodeURIComponent(id)}`).catch(err => {
      if (prev) this._put(col, prev);
      this._onError(err, col, id);
    });
  },

  _onError(err, col, id) {
    if (err.status === 401) { location.reload(); return; }
    if (err.status === 409 && err.data && err.data.record) {
      this._put(col, err.data.record);
      App.toast(`${err.message} : la version à jour a été rechargée, refaites votre modification.`, 6000);
      App.render();
      return;
    }
    App.toast(err.message, 5000);
    this.load().then(() => App.render());
  },

  async saveSettings(s) {
    this.data.settings = await api('PUT', '/api/settings', s);
  },

  can(action, col) {
    const r = this.me && this.me.role;
    if (r === 'admin') return true;
    if (action === 'admin') return false;
    if (r === 'charge') return col !== 'users' && !(action === 'delete' && col === 'factures');
    if (r === 'atelier') return col === 'temps';
    return false;
  },

  exportJSON() {
    const clean = o => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));
    const out = { settings: this.data.settings };
    COLLECTIONS.forEach(c => { out[c] = this.data[c].map(clean); });
    return JSON.stringify(out, null, 2);
  },
  async importJSON(text) {
    const d = JSON.parse(text);
    if (!d.settings) throw new Error('Fichier invalide');
    await api('POST', '/api/import', d);
    await this.load();
  },
  async reset() { await api('POST', '/api/reset-demo'); await this.load(); },

  // Événements temps réel envoyés par le serveur quand un autre utilisateur modifie les données.
  listen() {
    const es = new EventSource('/api/events');
    es.addEventListener('change', e => {
      const p = JSON.parse(e.data);
      if (p.client === CLIENT_ID) return;
      const local = this.get(p.col, p.record.id);
      if (local && local._v >= p.record._v) return;
      if (local) Object.assign(local, p.record); else this._put(p.col, p.record);
      App.remoteUpdate(`${p.record._by || 'Un utilisateur'} a modifié des données`);
    });
    es.addEventListener('delete', e => {
      const p = JSON.parse(e.data);
      if (p.client === CLIENT_ID) return;
      this.data[p.col] = this.data[p.col].filter(x => x.id !== p.id);
      App.remoteUpdate('Des données ont été supprimées par un autre utilisateur');
    });
    es.addEventListener('settings', e => { this.data.settings = JSON.parse(e.data).settings; App.remoteUpdate(); });
    es.addEventListener('reload', e => {
      try { if (JSON.parse(e.data).client === CLIENT_ID) return; } catch (err) { /* ancien format */ }
      this.load().then(() => App.remoteUpdate('Les données ont été rechargées'));
    });
    // Après une coupure réseau, on resynchronise tout.
    let wasDown = false;
    es.onerror = () => { wasDown = true; };
    es.onopen = () => { if (wasDown) { wasDown = false; this.load().then(() => App.remoteUpdate()); } };
  },
};

function uid() {
  const a = new Uint8Array(8);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

function isoDate(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

// Semaine ISO "2026-W42"
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}
function mondayOf(date) { const d = new Date(date); const day = d.getDay() || 7; d.setDate(d.getDate() - day + 1); d.setHours(0, 0, 0, 0); return d; }
