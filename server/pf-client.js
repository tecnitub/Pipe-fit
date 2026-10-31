// Écritures des applications DOE et Études dans Pipe-Fit, avec la session Pipe-Fit de la personne connectée
// (`appel(chemin, opts)` ajoute son cookie) : fiche réécrite avec contrôle de version, fichier envoyé, état d'une étude.
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
module.exports = { idPF, modifierPF, envoyerFichierPF, publierEtat, lienEtude };
