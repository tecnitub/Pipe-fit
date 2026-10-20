// Paramètres → Sécurité (administrateur) : HTTPS et certificat, proxy, sessions, tentatives de connexion refusées,
// avec ce qu'il reste à faire pour une installation accessible depuis l'extérieur.
function reglagesSecuriteCarte() {
  return `<h2>Sécurité</h2><div class="card" id="sec-carte"><p class="muted small" style="margin:0">Chargement…</p></div>`;
}
function bindReglagesSecurite(root) {
  const carte = root.querySelector('#sec-carte');
  if (!carte) return;
  if (window.PIPEFIT_DEMO) { carte.innerHTML = '<p class="muted small" style="margin:0">Dans la version installée : état du HTTPS et du certificat, sessions ouvertes, tentatives de connexion refusées.</p>'; return; }
  api('GET', '/api/securite').then(s => {
    if (!carte.isConnected) return;
    const c = s.https.certificat, points = [];
    const ok = (bon, texte) => points.push(`<li class="${bon ? 'pos' : 'neg'}">${bon ? '✓' : '⚠'} ${texte}</li>`);
    if (s.https.natif) ok(c && c.joursRestants > 20 && !c.autoSigne, `HTTPS assuré par Pipe-Fit${c ? ` · certificat <strong>${esc(c.sujet)}</strong> émis par ${esc(c.emetteur)}, valable jusqu'au ${dateFr(c.expire.slice(0, 10))} (${c.joursRestants} j)` : ''}${c && c.autoSigne ? ' · <strong>auto-signé</strong> : refusé par les téléphones (notifications, installation de l\'appli)' : ''}${c && c.joursRestants <= 20 ? ' · <strong>à renouveler</strong>' : ''}`);
    else if (s.https.requete) ok(true, 'HTTPS assuré par le reverse proxy (en-tête X-Forwarded-Proto reçu)');
    else ok(false, `Connexion <strong>non chiffrée</strong> (HTTP) : mots de passe et données circulent en clair. Suffisant sur le seul réseau de l'entreprise ; indispensable avant tout accès depuis l'extérieur et pour l'appli des compagnons : déposez le certificat de l'entreprise dans <code>data\\tls</code> (cert.pem + key.pem, ou certificat.pfx) puis redémarrez, ou placez Pipe-Fit derrière un reverse proxy HTTPS.`);
    if (s.proxy.detecte) ok(s.proxy.confiance, s.proxy.confiance ? `Reverse proxy reconnu : adresse du client ${esc(s.proxy.ip)}` : 'Reverse proxy sur une autre machine : définissez TRUST_PROXY=1 pour que la limitation des tentatives de connexion vise l\'adresse de chaque client');
    ok(s.echecs24h < 20, `${s.echecs24h} tentative(s) de connexion refusée(s) sur 24 h${s.echecs24h ? ` (dernières : ${s.derniersEchecs.slice(0, 5).map(e => `${esc(e.login || '?')} depuis ${esc(e.ip || '?')}`).join(', ')})` : ''} · blocage 15 min après 10 échecs par adresse ou 20 par identifiant`);
    ok(true, `${s.sessions} session(s) ouverte(s), durée ${s.dureeSessionJours} jours · jetons enregistrés sous forme d'empreinte · mots de passe chiffrés (scrypt), 10 caractères au moins`);
    if (s.webhooksHttp) ok(false, `${s.webhooksHttp} webhook(s) vers une adresse http:// : préférez https://`);
    ok(s.admins >= 1 && s.admins <= 3, `${s.admins} compte(s) administrateur${s.admins > 3 ? ' : limitez ce rôle aux personnes qui en ont besoin' : ''}`);
    carte.innerHTML = `<ul class="secu-etat">${points.join('')}</ul>
      <p class="small muted" style="margin-bottom:0">Toujours actifs : en-têtes de sécurité (CSP sans script externe, anti-cadre, HSTS en HTTPS), refus des écritures venant d'un autre site, cookies HttpOnly et SameSite (Secure en HTTPS), documents hors PDF/images toujours téléchargés, journal des connexions et des modifications (Historique des modifications, plus bas).</p>`;
  }).catch(e => { if (carte.isConnected) carte.innerHTML = `<p class="neg small" style="margin:0">${esc(e.message)}</p>`; });
}
