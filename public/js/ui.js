// Utilitaires d'affichage : formats, modale, formulaires génériques.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = v => (+v || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
const fmt = (v, d = 0) => (+v || 0).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = v => `${fmt(v, 1)} %`;
const dateFr = s => s ? new Date(s).toLocaleDateString('fr-FR') : '';
const signClass = v => v >= 0 ? 'pos' : 'neg';

const STATUTS_AFFAIRE = ['Prospect', 'Devis envoyé', 'En production', 'Livrée', 'Facturée', 'Perdue'];
const STATUTS_DEVIS = ['Brouillon', 'Envoyé', 'Accepté', 'Refusé'];
const STATUTS_FACTURE = ['Émise', 'Payée', 'En retard'];

function badge(statut) {
  const map = {
    'Accepté': 'b-ok', 'Payée': 'b-ok', 'Facturée': 'b-ok', 'Livrée': 'b-ok',
    'Envoyé': 'b-info', 'Devis envoyé': 'b-info', 'En production': 'b-info', 'Émise': 'b-info',
    'Brouillon': '', 'Prospect': '',
    'Refusé': 'b-bad', 'Perdue': 'b-bad', 'En retard': 'b-bad',
  };
  return `<span class="badge ${map[statut] || ''}">${esc(statut)}</span>`;
}

function marginBadge(p) {
  const cls = p >= 25 ? 'b-ok' : p >= 10 ? 'b-warn' : 'b-bad';
  return `<span class="badge ${cls}">${pct(p)}</span>`;
}

function bar(p) {
  const w = Math.min(100, Math.max(0, p));
  return `<div class="bar ${p > 100 ? 'over' : ''}" title="${pct(p)}"><span style="width:${w}%"></span></div>`;
}

const Modal = {
  open(html, wide = false) {
    const box = document.getElementById('modal-box');
    box.className = 'modal-box' + (wide ? ' wide' : '');
    box.innerHTML = html;
    document.getElementById('modal').classList.remove('hidden');
    return box;
  },
  close() {
    const m = document.getElementById('modal');
    if (m.classList.contains('hidden')) return;
    m.classList.add('hidden');
    if (App.pendingRemote) App.render();
  },
};

const options = (list, sel, labelFn = x => x.nom, empty = true) =>
  (empty ? '<option value="">—</option>' : '') +
  list.map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(labelFn(x))}</option>`).join('');
const optionsStr = (list, sel) => list.map(x => `<option ${x === sel ? 'selected' : ''}>${esc(x)}</option>`).join('');

// Formulaire générique : fields = [{key, label, type, options, step}]
function formFields(fields, obj) {
  return '<div class="grid2">' + fields.map(f => {
    const v = obj[f.key] ?? '';
    let input;
    if (f.type === 'select') input = `<select name="${f.key}">${f.options(v)}</select>`;
    else if (f.type === 'textarea') input = `<textarea name="${f.key}">${esc(v)}</textarea>`;
    else input = `<input name="${f.key}" type="${f.type || 'text'}" ${f.step ? `step="${f.step}"` : ''} value="${esc(v)}">`;
    return `<div class="field" ${f.type === 'textarea' ? 'style="grid-column:1/-1"' : ''}><label>${esc(f.label)}</label>${input}</div>`;
  }).join('') + '</div>';
}

function readForm(root, fields, obj) {
  fields.forEach(f => {
    const el = root.querySelector(`[name="${f.key}"]`);
    if (!el) return;
    obj[f.key] = f.type === 'number' ? (el.value === '' ? '' : +el.value) : el.value;
  });
  return obj;
}

// Ouvre une modale d'édition standard pour une collection.
function editModal({ title, col, fields, obj, onSave, onDelete }) {
  const box = Modal.open(`
    <h2 style="margin-top:0">${esc(title)}</h2>
    ${formFields(fields, obj)}
    <div class="modal-actions">
      ${obj.id && onDelete !== false ? '<button class="danger" data-act="del">Supprimer</button>' : ''}
      <span style="flex:1"></span>
      <button class="secondary" data-act="cancel">Annuler</button>
      <button data-act="save">Enregistrer</button>
    </div>`);
  box.querySelector('[data-act=cancel]').onclick = Modal.close;
  box.querySelector('[data-act=save]').onclick = () => {
    readForm(box, fields, obj);
    Store.upsert(col, obj);
    Modal.close();
    (onSave || App.render)();
  };
  const del = box.querySelector('[data-act=del]');
  if (del) del.onclick = () => {
    ask('Supprimer cet élément ?', 'Supprimer').then(ok => {
      if (!ok) return;
      Store.remove(col, obj.id);
      Modal.close();
      (typeof onDelete === 'function' ? onDelete : App.render)();
    });
  };
}

// Boîtes de dialogue intégrées à la page (remplacent alert / confirm / prompt).
function notify(msg) { App.toast(msg, 5000); }

function dialog(html, onReady) {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'modal dialog';
    wrap.innerHTML = `<div class="modal-box dialog-box" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(wrap);
    const done = v => { wrap.remove(); resolve(v); };
    onReady(wrap, done);
  });
}

function ask(message, okLabel = 'Confirmer', danger = true) {
  return dialog(`<p>${esc(message)}</p><div class="modal-actions">
      <button class="secondary" data-v="0">Annuler</button><button class="${danger ? 'danger' : ''}" data-v="1">${esc(okLabel)}</button></div>`,
  (wrap, done) => {
    wrap.querySelectorAll('[data-v]').forEach(b => { b.onclick = () => done(b.dataset.v === '1'); });
    wrap.querySelector('[data-v="1"]').focus();
  });
}

function askValue(message, value = '', type = 'text') {
  return dialog(`<form><label class="field"><span>${esc(message)}</span><input id="dlg-value" type="${type}" step="any" value="${esc(value)}"></label>
      <div class="modal-actions"><button type="button" class="secondary" data-cancel>Annuler</button><button type="submit">Valider</button></div></form>`,
  (wrap, done) => {
    const input = wrap.querySelector('#dlg-value');
    input.focus(); input.select();
    wrap.querySelector('[data-cancel]').onclick = () => done(null);
    wrap.querySelector('form').onsubmit = e => { e.preventDefault(); done(input.value); };
  });
}

function download(filename, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function toCSV(rows) {
  return rows.map(r => r.map(c => {
    const s = String(c ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(';')).join('\n');
}
