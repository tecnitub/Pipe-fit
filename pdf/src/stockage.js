// Sauvegarde d'Atelier PDF, sur l'ordinateur uniquement :
// - travail en cours enregistré automatiquement (IndexedDB du navigateur) et proposé à la réouverture ;
// - fichier projet « .atelierpdf » (tout le travail dans un seul fichier, à ranger où l'on veut) ;
// - bibliothèque de signatures et tampons images, gardée d'une fois sur l'autre.
const Stockage = (() => {
  'use strict';
  const NOM_BASE = 'atelierpdf';
  let base = null;

  function ouvrir() {
    if (!base) {
      base = new Promise((ok, ko) => {
        const r = indexedDB.open(NOM_BASE, 1);
        r.onupgradeneeded = () => {
          const b = r.result;
          if (!b.objectStoreNames.contains('etat')) b.createObjectStore('etat');
          if (!b.objectStoreNames.contains('fichiers')) b.createObjectStore('fichiers');
          if (!b.objectStoreNames.contains('bibliotheque')) b.createObjectStore('bibliotheque');
        };
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ko(r.error || new Error('Stockage indisponible'));
      }).catch(e => { base = null; throw e; });
    }
    return base;
  }
  const requete = r => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
  async function transaction(magasins, mode, travail) {
    const b = await ouvrir();
    const t = b.transaction(magasins, mode);
    const res = await travail(...[].concat(magasins).map(m => t.objectStore(m)));
    await new Promise((ok, ko) => { t.oncomplete = ok; t.onerror = () => ko(t.error); t.onabort = () => ko(t.error); });
    return res;
  }

  // ----- Travail en cours : une session par fenêtre (plusieurs PDF ouverts en même temps depuis l'Explorateur) -----
  // Clé « session:<id> » dans le magasin « etat » ; les fichiers sont partagés et effacés quand plus aucune session
  // ne les utilise. L'ancienne clé unique « session » (versions 1.2 et 1.3) est relue comme une session.
  const clesFichiers = meta => [...(meta.sources || []).map(s => s.fichier), ...(meta.images || []).map(i => `i_${i.id}`)];
  async function toutesLesSessions() {
    return transaction('etat', 'readonly', e => new Promise((ok, ko) => {
      const res = [];
      const r = e.openCursor();
      r.onsuccess = () => {
        const c = r.result;
        if (!c) return ok(res);
        if (c.key === 'session' || String(c.key).startsWith('session:')) res.push({ cle: c.key, meta: c.value });
        c.continue();
      };
      r.onerror = () => ko(r.error);
    }));
  }
  async function nettoyerFichiers(gardes = new Set()) {
    const sessions = await toutesLesSessions();
    sessions.forEach(x => clesFichiers(x.meta).forEach(k => gardes.add(k)));
    const cles = await transaction('fichiers', 'readonly', f => requete(f.getAllKeys()));
    const inutiles = cles.filter(c => !gardes.has(c));
    if (inutiles.length) await transaction('fichiers', 'readwrite', f => { inutiles.forEach(c => f.delete(c)); });
  }
  async function sauverSession(id, meta, fichiers) {
    const cles = new Set(await transaction('fichiers', 'readonly', f => requete(f.getAllKeys())));
    const nouveaux = [...fichiers].filter(([k]) => !cles.has(k));
    if (nouveaux.length) await transaction('fichiers', 'readwrite', f => { nouveaux.forEach(([k, v]) => f.put(v, k)); });
    await transaction('etat', 'readwrite', e => { e.put(meta, `session:${id}`); });
    await nettoyerFichiers(new Set(fichiers.keys()));
  }
  // Sessions laissées par d'autres fenêtres, la plus récente d'abord
  async function lireSessions(sauf) {
    const liste = (await toutesLesSessions()).filter(x => x.cle !== `session:${sauf}` && x.meta && x.meta.pages && x.meta.pages.length);
    liste.sort((a, b) => (b.meta.date || 0) - (a.meta.date || 0));
    return liste.map(x => ({ cle: x.cle, meta: x.meta, fichier: k => transaction('fichiers', 'readonly', f => requete(f.get(k))) }));
  }
  async function effacerSession(cle) {
    await transaction('etat', 'readwrite', e => { e.delete(cle); });
    await nettoyerFichiers();
  }

  // ----- Bibliothèque (signatures, tampons images) -----
  const listerBibliotheque = () => transaction('bibliotheque', 'readonly', b => requete(b.getAll()));
  const ajouterBibliotheque = item => transaction('bibliotheque', 'readwrite', b => { b.put(item, item.id); });
  const retirerBibliotheque = id => transaction('bibliotheque', 'readwrite', b => { b.delete(id); });

  // ----- Fichier projet : « ATELIERPDF1 », longueur de l'en-tête, en-tête JSON, puis les fichiers bout à bout -----
  const MAGIQUE = 'ATELIERPDF1\n';
  function versProjet(meta, fichiers) {
    const morceaux = [];
    const index = {};
    let pos = 0;
    for (const [id, f] of fichiers) {
      const o = f.octets instanceof Uint8Array ? f.octets : new Uint8Array(f.octets);
      index[id] = { debut: pos, longueur: o.length, mime: f.mime };
      morceaux.push(o);
      pos += o.length;
    }
    const entete = new TextEncoder().encode(JSON.stringify({ ...meta, fichiers: index }));
    const magique = new TextEncoder().encode(MAGIQUE);
    const total = new Uint8Array(magique.length + 4 + entete.length + pos);
    total.set(magique, 0);
    new DataView(total.buffer).setUint32(magique.length, entete.length, true);
    total.set(entete, magique.length + 4);
    let p = magique.length + 4 + entete.length;
    for (const o of morceaux) { total.set(o, p); p += o.length; }
    return total;
  }
  function estProjet(octets) {
    const m = new TextEncoder().encode(MAGIQUE);
    return octets.length > m.length + 4 && m.every((v, i) => octets[i] === v);
  }
  function depuisProjet(octets) {
    if (!estProjet(octets)) throw new Error("ce n'est pas un projet Atelier PDF");
    const debut = MAGIQUE.length;
    const lg = new DataView(octets.buffer, octets.byteOffset).getUint32(debut, true);
    const meta = JSON.parse(new TextDecoder().decode(octets.subarray(debut + 4, debut + 4 + lg)));
    const zone = debut + 4 + lg;
    const fichiers = new Map(Object.entries(meta.fichiers || {}).map(([id, f]) => [id, { octets: octets.slice(zone + f.debut, zone + f.debut + f.longueur), mime: f.mime }]));
    delete meta.fichiers;
    return { meta, fichiers };
  }

  return { sauverSession, lireSessions, effacerSession, listerBibliotheque, ajouterBibliotheque, retirerBibliotheque, versProjet, depuisProjet, estProjet };
})();
if (typeof module === 'object' && module.exports) module.exports = Stockage;
