// Hors devis : e-mail de demande du client joint à l'intervention (glisser-déposer depuis Outlook en .msg, fichier .eml,
// PDF ou capture, ou texte collé). L'e-mail est lu (expéditeur, date, objet, texte, pièces jointes), l'original est gardé
// dans les documents de l'intervention (non transmis aux compagnons) et sert à pré-remplir client, contact et demande.
const MAILS_GENERIQUES = /@(gmail|hotmail|outlook|live|yahoo|orange|wanadoo|free|sfr|laposte|icloud|me|gmx|bbox|neuf)\./i;
const domaineDe = email => (String(email || '').split('@')[1] || '').toLowerCase();
// Contact ou client correspondant à l'adresse de l'expéditeur
function trouverExpediteur(email) {
  const e = String(email || '').toLowerCase();
  if (!e) return {};
  const k = Store.all('contacts').find(c => String(c.email || '').toLowerCase() === e);
  if (k) return { contactId: k.id, clientId: k.entrepriseId };
  const dom = domaineDe(e);
  if (!dom || MAILS_GENERIQUES.test(e)) return {};
  const ent = Store.all('entreprises').find(x => domaineDe(x.email) === dom) || entreprise((Store.all('contacts').find(c => domaineDe(c.email) === dom) || {}).entrepriseId);
  return ent && ent.id ? { clientId: ent.id } : {};
}
const lireFichier = f => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(new Uint8Array(r.result)); r.onerror = () => ko(new Error('Lecture impossible')); r.readAsArrayBuffer(f); });

// Envoie le fichier et renvoie le document à ajouter (avec le contenu lu si c'est un e-mail)
async function documentDemande(f) {
  let mail = null;
  if (/\.(eml|msg)$/i.test(f.name)) {
    try { mail = MailLecture.lire(f.name, await lireFichier(f)); } catch (e) { notify(`${f.name} : ${e.message}`); }
    if (mail) mail.texte = String(mail.texte || '').slice(0, 20000);
  }
  const r = await envoyerFichierDocument(f);
  return { id: uid(), fichierId: r.id, nom: f.name, categorie: 'Demande client', indice: '', note: '', mime: r.mime, taille: r.taille, date: isoDate(new Date()), par: Store.me.nom, visible: false, ...(mail ? { mail } : {}) };
}
// Pré-remplit ce qui est vide sur l'intervention ; renvoie la liste de ce qui a été repris
function appliquerMail(a, mail) {
  const pris = [];
  if (!mail) return pris;
  const ex = trouverExpediteur(mail.deEmail);
  if (!a.clientId && ex.clientId) { a.clientId = ex.clientId; a.clientLibre = ''; pris.push('client'); }
  if (!a.contactId && ex.contactId && (!a.clientId || a.clientId === ex.clientId)) { a.contactId = ex.contactId; a.contactLibre = ''; pris.push('contact'); }
  // Site habituel du contact
  const k = Store.get('contacts', a.contactId);
  if (!a.siteId && !a.siteLibre && k && k.siteId && (entreprise(a.clientId).adresses || []).some(x => x.id === k.siteId)) { a.siteId = k.siteId; pris.push('site'); }
  if (!a.contactId && !a.contactLibre && mail.de) { a.contactLibre = `${mail.de}${mail.deEmail && mail.deEmail !== mail.de ? ` <${mail.deEmail}>` : ''}`; pris.push('contact (à créer)'); }
  if (!a.clientId && !a.clientLibre && ex.clientId === undefined && mail.deEmail && !MAILS_GENERIQUES.test(mail.deEmail)) { a.clientLibre = domaineDe(mail.deEmail); pris.push('client (à créer)'); }
  if (!String(a.demande || '').trim() && mail.texte) { a.demande = mail.texte.slice(0, 4000); pris.push('demande'); }
  if ((!a.nom || /^nouvelle intervention/i.test(a.nom)) && mail.objet) { a.nom = mail.objet.replace(/^(re|tr|fwd?)\s*:\s*/i, ''); pris.push('objet'); }
  return pris;
}

// Bloc de la fiche intervention
function demandeClientHtml(a) {
  const docs = (a.documents || []).filter(d => d.categorie === 'Demande client'), edit = Store.can('write', 'affaires');
  return `<div class="card demande-mail no-print"><div class="dm-tete"><strong>📧 Demande du client</strong>
      ${edit ? '<span class="spacer"></span><label class="btn small secondary" for="dm-ph">📷 Photo</label><input id="dm-ph" type="file" accept="image/*" capture="environment" multiple hidden><button class="small secondary" id="dm-coller">Coller le texte du mail</button><label class="btn small" for="dm-f">Joindre le mail</label><input id="dm-f" type="file" accept=".msg,.eml,.pdf,.txt,image/*" multiple hidden>' : ''}</div>
    ${(a.photosDemande || []).length ? `<div class="dm-mail"><strong class="small">Photos de la demande prises sur place</strong><div class="hd-photos">${a.photosDemande.map(id => `<a href="${fileUrl(id)}" target="_blank" rel="noopener"><img src="${fileUrl(id)}" alt="Photo de la demande"></a>`).join('')}</div></div>` : ''}
    ${docs.length ? docs.map(d => { const m = d.mail;
      return `<div class="dm-mail">${m ? `<div class="dm-entete"><div><strong>${esc(m.objet || '(sans objet)')}</strong><br><span class="small">De : ${esc(m.de || '')}${m.deEmail && m.deEmail !== m.de ? ` &lt;${esc(m.deEmail)}&gt;` : ''}${m.date ? ` · ${new Date(m.date).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</span></div>
          ${m.texte && edit ? `<button class="small secondary" data-dm-reprendre="${d.id}">Reprendre dans la demande</button>` : ''}</div>
        ${m.texte ? `<details ${docs.length === 1 ? 'open' : ''}><summary class="small">Texte du mail</summary><p class="pre dm-texte">${esc(m.texte)}</p></details>` : ''}
        ${(m.pieces || []).length ? `<p class="small muted">📎 Pièces jointes du mail : ${m.pieces.map(esc).join(', ')} (dans le fichier d'origine)</p>` : ''}` : ''}
        <p class="small">${d.fichierId ? `<a href="${lienDocument(d)}" target="_blank" rel="noopener">${/\.(eml|msg)$/i.test(d.nom) ? '✉️' : '📎'} ${esc(d.nom)}</a>` : ''} <span class="muted">ajouté le ${dateFr(d.date)} par ${esc(d.par || '')}</span>
        ${edit ? ` <button class="icon" data-dm-retirer="${d.id}" aria-label="Retirer">✕</button>` : ''}</p></div>`; }).join('')
      : (a.photosDemande || []).length ? '' : `<div class="dm-depot" id="dm-depot">${edit ? 'Glissez ici l\'e-mail depuis Outlook (ou un .eml, un PDF, une capture), ou utilisez les boutons ci-dessus.' : 'Aucun e-mail de demande joint.'}</div>`}
  </div>`;
}
function bindDemandeClient(root, a) {
  const enreg = (msg) => { Store.upsert('affaires', a); App.render(); if (msg) App.toast(msg, 4500); };
  const ajouter = async files => {
    const ajoutes = [];
    for (const f of files) { try { ajoutes.push(await documentDemande(f)); } catch (e) { notify(`${f.name} : ${e.message}`); } }
    if (!ajoutes.length) return;
    a.documents = [...(a.documents || []), ...ajoutes];
    const pris = [...new Set(ajoutes.flatMap(d => appliquerMail(a, d.mail)))];
    enreg(`${ajoutes.length} pièce(s) jointe(s) à la demande${pris.length ? ` · repris du mail : ${pris.join(', ')}` : ''}`);
  };
  const ph = root.querySelector('#dm-ph');
  if (ph) ph.onchange = () => ajouter([...ph.files]);
  const f = root.querySelector('#dm-f');
  if (f) f.onchange = () => ajouter([...f.files]);
  const zone = root.querySelector('.demande-mail');
  if (zone && Store.can('write', 'affaires')) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('survol'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('survol'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('survol'); if (e.dataTransfer.files.length) ajouter([...e.dataTransfer.files]); });
  }
  const c = root.querySelector('#dm-coller');
  if (c) c.onclick = () => {
    const box = Modal.open(`<h2 style="margin-top:0">Texte du mail de demande</h2><p class="muted small">Copiez le mail dans Outlook (en-tête compris si possible) et collez-le ici.</p>
      <textarea id="dm-t" rows="12" placeholder="De : …&#10;Envoyé : …&#10;Objet : …&#10;&#10;Bonjour, …"></textarea>
      <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="dm-x">Annuler</button><button id="dm-ok">Joindre</button></div>`);
    box.querySelector('#dm-x').onclick = Modal.close;
    box.querySelector('#dm-ok').onclick = async () => {
      const t = box.querySelector('#dm-t').value.trim();
      if (!t) return notify('Collez le texte du mail.');
      Modal.close();
      await ajouter([new File([t], `Demande client ${isoDate(new Date())}.txt`, { type: 'text/plain' })]);
      // Texte collé : en-têtes Outlook « De : / Objet : » reconnus
      const d = a.documents[a.documents.length - 1], g = re => ((re.exec(t) || [])[1] || '').trim();
      if (d && d.nom.endsWith('.txt') && !d.mail) {
        const de = g(/^(?:De|From)\s*:\s*(.+)$/mi), email = (/[\w.+-]+@[\w-]+\.[\w.-]+/.exec(de) || [])[0] || '';
        d.mail = { de: de.replace(/<[^>]*>|\[mailto:[^\]]*\]/g, '').trim(), deEmail: email, objet: g(/^(?:Objet|Subject)\s*:\s*(.+)$/mi), date: '', texte: t.replace(/^(?:De|From|Envoyé|Sent|À|To|Cc|Objet|Subject)\s*:.*$/gmi, '').trim(), pieces: [] };
        const pris = appliquerMail(a, d.mail); enreg(pris.length ? `Repris du mail : ${pris.join(', ')}` : '');
      }
    };
    setTimeout(() => box.querySelector('#dm-t').focus(), 50);
  };
  root.querySelectorAll('[data-dm-reprendre]').forEach(b => b.onclick = () => { const d = a.documents.find(x => x.id === b.dataset.dmReprendre); a.demande = d.mail.texte.slice(0, 4000); enreg('Texte du mail repris dans la demande'); });
  root.querySelectorAll('[data-dm-retirer]').forEach(b => b.onclick = async () => { const d = a.documents.find(x => x.id === b.dataset.dmRetirer); if (await ask(`Retirer « ${d.nom} » ?`, 'Retirer')) { a.documents = a.documents.filter(x => x !== d); enreg(); } });
}

// Chantiers → « Depuis un mail » : l'intervention est créée à partir du mail glissé
function nouvelleHDDepuisMail() {
  const box = Modal.open(`<h2 style="margin-top:0">📧 Nouvelle intervention depuis un mail</h2>
    <label class="dm-depot grand" id="dm-zone" for="dm-nf">Glissez ici l'e-mail du client depuis Outlook<br><span class="small muted">ou cliquez pour choisir un fichier .msg / .eml</span><input id="dm-nf" type="file" accept=".msg,.eml" hidden></label>
    <div class="modal-actions"><span style="flex:1"></span><button class="secondary" id="dm-nx">Annuler</button></div>`);
  const creer = async f => {
    if (!f) return;
    if (!/\.(eml|msg)$/i.test(f.name)) return notify('Fichier .msg (Outlook) ou .eml attendu.');
    box.querySelector('#dm-zone').textContent = 'Lecture du mail…';
    try {
      const d = await documentDemande(f);
      const a = { type: 'horsDevis', code: '', statut: 'Ouvert', nom: 'Nouvelle intervention', dateCreation: isoDate(new Date()), chargeId: Store.me.role === 'charge' ? Store.me.userId || '' : '', heuresPrevues: 0, rex: {}, documents: [d] };
      const pris = appliquerMail(a, d.mail);
      if (a.clientId && !a.siteId) { const s = (entreprise(a.clientId).adresses || []); if (s.length === 1) a.siteId = s[0].id; }
      const r = Store.upsert('affaires', a);
      Modal.close(); location.hash = `#/chantier/${r.id}`;
      App.toast(`Intervention créée${pris.length ? ` · repris du mail : ${pris.join(', ')}` : ''}. Complétez avec « Modifier ».`, 5000);
    } catch (e) { notify(e.message); box.querySelector('#dm-zone').textContent = 'Glissez ici l\'e-mail du client'; }
  };
  const z = box.querySelector('#dm-zone');
  z.addEventListener('dragover', e => { e.preventDefault(); z.classList.add('survol'); });
  z.addEventListener('drop', e => { e.preventDefault(); creer(e.dataTransfer.files[0]); });
  box.querySelector('#dm-nf').onchange = e => creer(e.target.files[0]);
  box.querySelector('#dm-nx').onclick = Modal.close;
}
