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

  // ----- Travail en cours -----
  const dejaEcrits = new Set();
  async function sauverSession(meta, fichiers) {
    // Fichiers d'abord (une seule fois chacun), puis l'état qui les référence
    const cles = await transaction('fichiers', 'readonly', f => requete(f.getAllKeys()));
    cles.forEach(c => dejaEcrits.add(c));
    const nouveaux = [...fichiers].filter(([id]) => !dejaEcrits.has(id));
    if (nouveaux.length) {
      await transaction('fichiers', 'readwrite', f => { nouveaux.forEach(([id, v]) => f.put(v, id)); });
      nouveaux.forEach(([id]) => dejaEcrits.add(id));
    }
    await transaction('etat', 'readwrite', e => { e.put(meta, 'session'); });
    // Fichiers devenus inutiles
    const inutiles = cles.filter(c => !fichiers.has(c));
    if (inutiles.length) {
      await transaction('fichiers', 'readwrite', f => { inutiles.forEach(c => f.delete(c)); });
      inutiles.forEach(c => dejaEcrits.delete(c));
    }
  }
  async function lireSession() {
    const meta = await transaction('etat', 'readonly', e => requete(e.get('session')));
    if (!meta) return null;
    return { meta, fichier: id => transaction('fichiers', 'readonly', f => requete(f.get(id))) };
  }
  async function effacerSession() {
    await transaction(['etat', 'fichiers'], 'readwrite', (e, f) => { e.delete('session'); f.clear(); });
    dejaEcrits.clear();
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

  return { sauverSession, lireSession, effacerSession, listerBibliotheque, ajouterBibliotheque, retirerBibliotheque, versProjet, depuisProjet, estProjet };
})();
if (typeof module === 'object' && module.exports) module.exports = Stockage;
