// Limite des tentatives de connexion des applications Études et DOE (en plus de celle de Pipe-Fit, qui vérifie le mot de
// passe) : par identifiant ET par adresse du client réel (lue derrière un proxy de confiance seulement, voir
// http-securite.js), avec une temporisation progressive : les premiers échecs sont libres, puis chaque échec double
// l'attente (2 s, 4 s, 8 s… jusqu'à 15 min) ; 5 échecs libres par identifiant, 8 par adresse (sous la limite de Pipe-Fit,
// 10 par adresse, pour que le message reste celui de l'application). Une connexion réussie remet l'identifiant à zéro (pas l'adresse : un compte
// valide ne sert pas à relancer les essais sur d'autres comptes). Tout est oublié une heure après le dernier échec.
function creer({ libres = { login: 5, ip: 8 }, baseMs = 2000, maxMs = 15 * 60000, oubliMs = 3600000, maintenant = () => Date.now() } = {}) {
  const etats = new Map(); // clé -> { n, jusqua, dernier }
  const cles = ({ login, ip }) => [['login', `login:${String(login || '').trim().toLowerCase().slice(0, 100)}`], ['ip', `ip:${String(ip || '').replace(/^::ffff:/, '')}`]];
  const lire = k => { const e = etats.get(k); if (e && maintenant() - e.dernier > oubliMs) { etats.delete(k); return null; } return e; };
  // Secondes à attendre avant un nouvel essai (0 : essai permis)
  function attente(qui) {
    const t = maintenant();
    return Math.max(0, ...cles(qui).map(([, k]) => { const e = lire(k); return e && e.jusqua > t ? Math.ceil((e.jusqua - t) / 1000) : 0; }));
  }
  function echec(qui) {
    const t = maintenant();
    cles(qui).forEach(([type, k]) => {
      const e = lire(k) || { n: 0, jusqua: 0, dernier: t };
      e.n++; e.dernier = t;
      const auDela = e.n - libres[type];
      if (auDela > 0) e.jusqua = t + Math.min(maxMs, baseMs * 2 ** (auDela - 1));
      etats.set(k, e);
    });
    // Mémoire bornée : entrées oubliées d'abord, puis les plus anciennes
    if (etats.size > 20000) { for (const [k] of etats) lire(k); for (const [k] of etats) { if (etats.size <= 15000) break; etats.delete(k); } }
    return attente(qui);
  }
  const succes = qui => { etats.delete(cles(qui)[0][1]); };
  // Message clair (minutes au-delà d'une minute)
  const message = s => `Trop de tentatives de connexion : réessayez dans ${s >= 90 ? `${Math.ceil(s / 60)} min` : `${s} s`}.`;
  return { attente, echec, succes, message };
}

module.exports = { creer };
