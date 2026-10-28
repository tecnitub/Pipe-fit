// Copie des pièces jointes sur le réseau : chaque fichier joint dans l'appli (offres et factures des fournisseurs,
// commandes, photos des rapports, prises de cotes, réserves, notes de frais, PV…) est recopié, en sens unique, dans
// une arborescence lisible du répertoire du serveur :
//   <racine>/Chantiers/<code> - <nom>/<rubrique>/<n° du document> - <nom du fichier>
//   <racine>/Hors chantier/<rubrique>/<année>/…        <racine>/Entreprises/<nom>/…        <racine>/Bibliothèque/FDS/…
// Copie de sécurité consultable depuis les postes du bureau : rien n'est jamais effacé ni relu depuis ce dossier (les
// documents des chantiers, eux, sont synchronisés dans les deux sens par dossier-documents.js, dans <documents>/Chantiers).
// Un fichier effacé ou déplacé à la main est réécrit au passage complet suivant (une fois par heure).
const fs = require('node:fs');
const path = require('node:path');
const Classement = require('../public/js/classement');

const RUBRIQUES = {
  devis: 'Devis', situations: 'Situations', factures: 'Factures clients', commandes: 'Commandes fournisseurs', consultations: 'Offres fournisseurs',
  achats: 'Factures fournisseurs', efactures: 'Factures fournisseurs reçues', enlevements: 'Achats comptoir', receptions: 'Réceptions et PV',
  rapports: 'Rapports d\'intervention', reserves: 'Réserves', releves: 'Prise de cotes', frais: 'Notes de frais', consommations: 'Consommations',
  epreuves: 'PV et essais', misesEnService: 'PV et essais', equilibrages: 'PV et essais', fichesFluides: 'Fluides', equipementsFrigo: 'Fluides',
  affaires: 'Chantier', chiffrages: 'Chiffrages', temps: 'Pointages',
};
// Rangés par fiche, hors chantier
const FICHES = { entreprises: 'Entreprises', materiels: 'Parc matériel', habilitations: 'Habilitations', users: 'Personnel', missions: 'Intérim', bouteilles: 'Fluides\\Bouteilles' };
const BIBLIO = { produits: 'Bibliothèque/FDS', articles: 'Bibliothèque/Articles', ouvrages: 'Bibliothèque/Ouvrages' };
// Champs non recopiés : signatures, illustrations des lignes de devis, documents de chantier (déjà synchronisés)
const IGNORES = /^(signature\w*|imageId|logoId)$/i;
const EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/xml': 'xml', 'text/xml': 'xml', 'text/csv': 'csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx', 'application/vnd.ms-excel': 'xls', 'application/zip': 'zip' };
const sep = '/';

function creer({ DB, db, racineDocuments }) {
  db.exec('CREATE TABLE IF NOT EXISTS pj_reseau (file_id TEXT PRIMARY KEY, rel TEXT NOT NULL, at TEXT NOT NULL)');
  const etat = { dernier: null, copies: 0, total: 0, erreur: '', erreurs: [] };
  let enCours = null, vu = '', complet = 0;

  function config() {
    const c = DB.getConfig(db, 'pj-reseau') || {}, impose = process.env.PJ_DIR || '';
    return { actif: impose ? true : c.actif !== false, chemin: path.resolve(impose || c.chemin || path.join(racineDocuments(), 'Pièces jointes')), impose: !!impose };
  }
  function enregistrerConfig(b) {
    const c = DB.getConfig(db, 'pj-reseau') || {};
    c.actif = !!b.actif;
    if (b.chemin !== undefined) c.chemin = String(b.chemin || '').trim().slice(0, 400);
    DB.setConfig(db, 'pj-reseau', c);
    vu = ''; complet = 0;
    return config();
  }

  // Fichiers cités par un enregistrement : { id, nom } d'après le champ voisin (pieceNom, nom, nomFichier…)
  function fichiersDe(obj, ids) {
    const out = [];
    const voir = (o, cle, parent, i) => {
      if (typeof o === 'string') {
        if (!ids.has(o) || IGNORES.test(cle)) return;
        const nom = (parent && ((/Id$/.test(cle) && typeof parent[cle.replace(/Id$/, 'Nom')] === 'string' && parent[cle.replace(/Id$/, 'Nom')]) || (['id', 'pieceId', 'fichierId', 'photoId', 'pdfId', 'justificatifId'].includes(cle) ? parent.nom || parent.pieceNom || parent.nomFichier || parent.legende : ''))) || '';
        out.push({ id: o, nom: String(nom), cle, i });
        return;
      }
      if (Array.isArray(o)) return o.forEach((x, j) => voir(x, cle, Array.isArray(x) || typeof x !== 'object' ? parent : x, j + 1));
      if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (!(k === 'documents' && o === obj && obj._col === 'affaires')) voir(v, k, o, i); }
    };
    voir(obj, '', obj);
    return out;
  }

  const LIBELLES = { photos: 'Photo', photosAvant: 'Photo avant', photosApres: 'Photo après', photoId: 'Photo', photoPlaqueId: 'Plaque', photoLeveeId: 'Levée', pieceId: 'Pièce jointe',
    pdfId: 'Facture', xmlId: 'Facture', devisFournisseurId: 'Offre du fournisseur', fdsFichierId: 'FDS', justificatifId: 'Justificatif', fichierId: 'Document' };
  function dossierDe(col, r, affaires) {
    const a = col === 'affaires' ? r : r.affaireId && affaires.get(r.affaireId);
    if (a) return ['Chantiers', Classement.dossierChantier(a), RUBRIQUES[col] || Classement.propre(col)];
    if (FICHES[col]) return [...FICHES[col].split(/[\\/]/), Classement.propre(r.nom || r.raisonSociale || r.libelle || r.designation || r.id, 80)];
    if (BIBLIO[col]) return BIBLIO[col].split('/');
    const annee = String(r.date || r.recueLe || r._at || '').slice(0, 4) || 'Sans date';
    return ['Hors chantier', RUBRIQUES[col] || Classement.propre(col), annee];
  }
  function nomFichier(col, r, f, mime) {
    const ref = r.numero || r.ref || r.code || (col === 'produits' ? r.nom : '') || '';
    let nom = f.nom || `${LIBELLES[f.cle] || 'Pièce jointe'}${f.i ? ` ${f.i}` : ''}`;
    const ext = EXT[mime] || '';
    if (ext && !new RegExp(`\\.${ext}$`, 'i').test(nom) && !/\.[a-z0-9]{2,5}$/i.test(nom)) nom += `.${ext}`;
    return Classement.propre(ref && !nom.includes(ref) ? `${ref} - ${nom}` : nom, 150);
  }

  let racineReelle = '';
  function ecrire(racine, rel, buf) {
    const f = path.join(racine, ...rel.split(sep));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    const reel = fs.realpathSync(path.dirname(f));
    if (reel !== racineReelle && !reel.startsWith(racineReelle + path.sep)) throw new Error(`chemin hors du dossier des pièces jointes refusé (${rel})`);
    fs.writeFileSync(f, buf, { flag: 'wx' });
  }
  // Nom libre : « offre.pdf », « offre (2).pdf »…
  function libre(racine, rel) {
    const ext = path.posix.extname(rel), b = rel.slice(0, rel.length - ext.length);
    for (let i = 1; ; i++) { const r = i === 1 ? rel : `${b} (${i})${ext}`; if (!fs.existsSync(path.join(racine, ...r.split(sep)))) return r; }
  }

  async function copier({ toutRevoir = false } = {}) {
    if (enCours) return enCours;
    enCours = (async () => {
      const c = config(), bilan = { copies: 0, total: 0, erreurs: [] };
      try {
        if (!c.actif) return Object.assign(etat, { erreur: '', actif: false });
        fs.mkdirSync(c.chemin, { recursive: true });
        racineReelle = fs.realpathSync(c.chemin);
        const complete = toutRevoir || !vu || Date.now() - complet > 3600000;
        const ids = new Set(db.prepare('SELECT id FROM files').all().map(x => x.id));
        const faits = new Map(db.prepare('SELECT file_id, rel FROM pj_reseau').all().map(x => [x.file_id, x.rel]));
        const affaires = new Map(db.prepare("SELECT id FROM records WHERE col = 'affaires'").all().map(x => { const a = DB.getRecord(db, 'affaires', x.id); return [a.id, a]; }));
        const lignes = complete ? db.prepare('SELECT col, id, updated_at FROM records').all() : db.prepare('SELECT col, id, updated_at FROM records WHERE updated_at > ?').all(vu);
        let max = vu;
        const vus = new Set();
        for (const l of lignes) {
          if (l.updated_at > max) max = l.updated_at;
          if (['notifications', 'envois', 'planning'].includes(l.col)) continue;
          const r = DB.getRecord(db, l.col, l.id);
          if (!r) continue;
          for (const f of fichiersDe({ ...r, _col: l.col }, ids)) {
            bilan.total++;
            vus.add(f.id);
            const deja = faits.get(f.id);
            if (deja && (!complete || fs.existsSync(path.join(c.chemin, ...deja.split(sep))))) continue;
            try {
              const b = db.prepare('SELECT mime, data FROM files WHERE id = ?').get(f.id);
              const rel = deja || libre(c.chemin, [...dossierDe(l.col, r, affaires), nomFichier(l.col, r, f, b.mime)].join(sep));
              ecrire(c.chemin, rel, Buffer.from(b.data));
              db.prepare('INSERT INTO pj_reseau (file_id, rel, at) VALUES (?, ?, ?) ON CONFLICT(file_id) DO UPDATE SET rel = excluded.rel, at = excluded.at').run(f.id, rel, new Date().toISOString());
              faits.set(f.id, rel);
              bilan.copies++;
            } catch (e) { if (bilan.erreurs.length < 20) bilan.erreurs.push(`${r.numero || r.ref || r.id} : ${e.message}`); }
          }
        }
        // Passage complet : une copie effacée à la main est réécrite, même si l'enregistrement a été supprimé depuis dans l'appli
        if (complete) {
          for (const [id, rel] of faits) {
            if (vus.has(id) || fs.existsSync(path.join(c.chemin, ...rel.split(sep)))) continue;
            const b = db.prepare('SELECT data FROM files WHERE id = ?').get(id);
            if (!b) continue;
            try { ecrire(c.chemin, rel, Buffer.from(b.data)); bilan.copies++; } catch (e) { if (bilan.erreurs.length < 20) bilan.erreurs.push(`${rel} : ${e.message}`); }
          }
        }
        vu = max;
        if (complete) { complet = Date.now(); etat.total = bilan.total; }
        Object.assign(etat, { copies: bilan.copies, erreurs: bilan.erreurs, erreur: '', actif: true, enregistres: faits.size });
      } catch (e) {
        Object.assign(etat, { erreur: `Dossier inaccessible (${c.chemin}) : ${e.message}` });
      } finally { etat.dernier = new Date().toISOString(); }
      return { ...etat };
    })();
    try { return await enCours; } finally { enCours = null; }
  }

  function demarrer() {
    setTimeout(() => copier().catch(e => console.error('Pièces jointes sur le réseau :', e.message)), 20000).unref();
    setInterval(() => copier().catch(e => console.error('Pièces jointes sur le réseau :', e.message)), 120000).unref();
  }
  return { config, enregistrerConfig, copier, demarrer, etat: () => ({ ...etat }) };
}

module.exports = { creer };
