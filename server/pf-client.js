// Écritures des applications DOE et Études dans Pipe-Fit, avec le jeton de service de la personne connectée
// (`appel(chemin, opts)` ajoute son jeton) : fiche réécrite avec contrôle de version, fichier envoyé, état d'une étude.
const crypto = require('node:crypto');

const idPF = () => crypto.randomBytes(10).toString('hex');
// Fiche lue puis réécrite avec contrôle de version (une nouvelle tentative si elle a changé entre-temps)
async function modifierPF(appel, col, id, modifier) {
  for (let essai = 0; essai < 2; essai++) {
    const r = await appel(`/api/records/${col}/${encodeURIComponent(id)}`);
    if (!r.ok) throw Object.assign(new Error(r.status === 404 ? 'Fiche introuvable dans Pipe-Fit' : 'Lecture Pipe-Fit impossible'), { status: r.status === 404 ? 404 : 502 });
    const rec = await r.json(), version = rec._v, data = modifier(Object.fromEntries(Object.entries(rec).filter(([k]) => !k.startsWith('_'))));
    if (data === null) return rec; // rien à changer
    const w = await appel(`/api/records/${col}/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data, version }) });
    if (w.status === 409 && !essai) continue;
    const j = await w.json().catch(() => ({}));
    if (!w.ok) throw Object.assign(new Error(j.error || `Écriture Pipe-Fit refusée (${w.status})`), { status: w.status === 403 ? 403 : 502 });
    return j;
  }
  throw Object.assign(new Error('Fiche modifiée entre-temps dans Pipe-Fit : réessayer.'), { status: 409 });
}
// Fichier déposé dans les documents de Pipe-Fit : renvoie { id, mime, taille }
async function envoyerFichierPF(appel, nom, mime, buf) {
  const up = await appel('/api/documents/fichier', { method: 'POST', body: buf, headers: { 'X-PipeFit-Upload': '1', 'X-Filename': encodeURIComponent(nom), 'Content-Type': mime } });
  const f = await up.json().catch(() => ({}));
  if (!up.ok) throw Object.assign(new Error(f.error || 'Envoi du fichier à Pipe-Fit impossible'), { status: up.status === 403 ? 403 : 502 });
  return f;
}
// État d'une étude ou d'un dossier dans Pipe-Fit (affaireId null : retiré ; vide : étude sans chantier).
// extra : { clientId, devisId } d'une étude faite avant la commande. Renvoie l'état enregistré (chantier relié dans le CRM).
async function publierEtat(appel, app, id, affaireId, resume, extra = {}) {
  const r = await appel(`/api/liens/${app}/${encodeURIComponent(id)}`, affaireId !== null
    ? { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ affaireId, resume, ...extra }) }
    : { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (!r.ok) throw new Error(`État non transmis à Pipe-Fit (${r.status})`);
  return r.json().catch(() => null);
}
// Rattachement d'une étude fait dans le CRM (chantier), à reprendre par l'application
async function lienEtude(appel, id) {
  const r = await appel(`/api/liens/etudes/${encodeURIComponent(id)}`);
  return r.ok ? r.json() : null;
}
// Connexion d'une personne dans l'application (Études, DOE) : identifiant et mot de passe vérifiés par Pipe-Fit (adresse
// du client transmise pour sa limite de tentatives), rôle contrôlé, puis la session Pipe-Fit est échangée contre un
// jeton de service de l'application (portée réduite, durée limitée) et fermée aussitôt : elle n'est jamais conservée.
// → { me, jeton, expire } ; erreur { status, message } (401 identifiants, 403 rôle, 429 trop de tentatives, 502 Pipe-Fit)
async function connexionPF(PIPEFIT, { login, password, ip, app, roles, refusRole }) {
  const erreur = (status, message) => Object.assign(new Error(message), { status });
  let r;
  try { r = await fetch(`${PIPEFIT}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: JSON.stringify({ login, password }), signal: AbortSignal.timeout(15000) }); }
  catch (e) { throw erreur(502, `Pipe-Fit est injoignable (${PIPEFIT}) : vérifiez l'adresse PIPEFIT_URL.`); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw erreur([401, 429].includes(r.status) ? r.status : 502, j.error || 'Identifiant ou mot de passe incorrect');
  const cookie = String(r.headers.get('set-cookie') || '').split(';')[0];
  const fermer = () => fetch(`${PIPEFIT}/api/logout`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(10000) }).catch(() => {});
  try {
    const me = await (await fetch(`${PIPEFIT}/api/me`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(15000) })).json().catch(() => ({}));
    if (!roles.includes(me.role)) throw erreur(403, refusRole);
    const t = await fetch(`${PIPEFIT}/api/jetons-apps`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ app }), signal: AbortSignal.timeout(15000) });
    const jt = await t.json().catch(() => ({}));
    if (!t.ok || !jt.jeton) throw erreur(502, jt.error || 'Pipe-Fit n\'a pas délivré de jeton à l\'application (version de Pipe-Fit à mettre à jour ?)');
    return { me, jeton: jt.jeton, expire: jt.expire };
  } finally { await fermer(); }
}
// Appel à Pipe-Fit avec le jeton de service de l'application
const appelJeton = (PIPEFIT, jeton, chemin, opts = {}) => fetch(PIPEFIT + chemin, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${jeton}` }, signal: AbortSignal.timeout(30000) });
module.exports = { idPF, modifierPF, envoyerFichierPF, publierEtat, lienEtude, connexionPF, appelJeton };
