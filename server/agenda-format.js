// Planning → agendas : un événement par journée planifiée (chantier, horaires, tâche, consigne, adresse du site)
// ou par absence. Sert au calendrier Outlook (Microsoft 365) et au lien d'abonnement iCal (téléphone, Google, Apple).
// Module du serveur (et des tests).
const Agenda = (() => {
  const FUSEAU = 'Europe/Paris';
  const ICONES = { 'Congés': '🏖️', 'Maladie': '🤒', 'Formation': '🎓', 'RTT': '🏖️' };
  const lendemain = d => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
  const hhmm = s => (/^\d{1,2}:\d{2}$/.test(String(s || '')) ? String(s).padStart(5, '0') : '');

  // ctx : { affaire(id), entreprise(id), contact(id), site(clientId, siteId) }
  function evenement(p, ctx) {
    if (!p || !p.date || !p.userId) return null;
    const debut = hhmm(p.debut), fin = hhmm(p.fin), journee = !p.absence && !!debut && !!fin && fin > debut;
    if (p.absence) {
      return { id: p.id, titre: `${ICONES[p.absence] || '📅'} ${p.absence}`, journee: false, date: p.date, debut: '', fin: '', lieu: '', description: p.note || '', absence: true };
    }
    const a = ctx.affaire(p.affaireId) || {}, cl = a.clientId ? ctx.entreprise(a.clientId) || {} : {}, s = a.clientId ? ctx.site(a.clientId, a.siteId) : null;
    const contact = a.contactId ? ctx.contact(a.contactId) : null;
    const lieu = s ? [s.libelle, [s.adresse, [s.cp, s.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(' – ') : '';
    const desc = [cl.nom && `Client : ${cl.nom}`, a.nom && `Chantier : ${a.code ? `${a.code} – ` : ''}${a.nom}`, p.tache && `Tâche : ${p.tache}`,
      debut && fin && `Horaires : ${debut} – ${fin}${p.pause ? ` (pause ${p.pause} min)` : ''}`, s && s.acces && `Accès : ${s.acces}`,
      contact && `Contact sur place : ${[contact.prenom, contact.nom].filter(Boolean).join(' ')}${contact.mobile || contact.tel ? ` · ${contact.mobile || contact.tel}` : ''}`, p.note && `Consigne : ${p.note}`].filter(Boolean).join('\n');
    return { id: p.id, titre: `${a.code || 'Chantier'}${a.nom ? ` ${a.nom}` : ''}${p.tache ? ` – ${p.tache}` : ''}`, journee, date: p.date, debut, fin, lieu, description: desc, absence: false };
  }

  // Corps d'un événement Microsoft Graph (calendrier Outlook)
  function graph(e, { categorie = 'Pipe-Fit', rappel = 0 } = {}) {
    const html = String(e.description || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/\n/g, '<br>');
    return {
      subject: e.titre, body: { contentType: 'HTML', content: `${html}<br><br><small>Planning Pipe-Fit : modifié automatiquement, ne pas déplacer dans Outlook.</small>` },
      isAllDay: !e.journee,
      start: { dateTime: e.journee ? `${e.date}T${e.debut}:00` : `${e.date}T00:00:00`, timeZone: FUSEAU },
      end: { dateTime: e.journee ? `${e.date}T${e.fin}:00` : `${lendemain(e.date)}T00:00:00`, timeZone: FUSEAU },
      location: { displayName: e.lieu || '' }, categories: categorie ? [categorie] : [], showAs: e.absence ? 'oof' : 'busy',
      isReminderOn: !!rappel && !e.absence, reminderMinutesBeforeStart: rappel || 0,
    };
  }

  // Calendrier iCal (RFC 5545) : abonnement depuis un téléphone, Outlook, Google Agenda…
  const echap = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const plier = l => { const out = []; let x = l; while (Buffer.byteLength(x, 'utf8') > 74) { let n = 74; while (Buffer.byteLength(x.slice(0, n), 'utf8') > 74) n--; out.push(x.slice(0, n)); x = ` ${x.slice(n)}`; } out.push(x); return out.join('\r\n'); };
  const compact = d => d.replace(/-/g, '');
  const VTIMEZONE = ['BEGIN:VTIMEZONE', 'TZID:Europe/Paris', 'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD', 'END:VTIMEZONE'];
  function ical(evenements, { nom = 'Planning Pipe-Fit', domaine = 'pipefit', maintenant = new Date() } = {}) {
    const stamp = maintenant.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const l = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pipe-Fit//Planning//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${echap(nom)}`, 'X-WR-TIMEZONE:Europe/Paris', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H', ...VTIMEZONE];
    evenements.filter(Boolean).forEach(e => {
      l.push('BEGIN:VEVENT', `UID:${e.id}@${domaine}`, `DTSTAMP:${stamp}`);
      if (e.journee) l.push(`DTSTART;TZID=Europe/Paris:${compact(e.date)}T${e.debut.replace(':', '')}00`, `DTEND;TZID=Europe/Paris:${compact(e.date)}T${e.fin.replace(':', '')}00`);
      else l.push(`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(lendemain(e.date))}`);
      l.push(`SUMMARY:${echap(e.titre)}`);
      if (e.lieu) l.push(`LOCATION:${echap(e.lieu)}`);
      if (e.description) l.push(`DESCRIPTION:${echap(e.description)}`);
      l.push(`TRANSP:${e.absence ? 'TRANSPARENT' : 'OPAQUE'}`, 'END:VEVENT');
    });
    l.push('END:VCALENDAR');
    return `${l.map(plier).join('\r\n')}\r\n`;
  }
  return { evenement, graph, ical, lendemain };
})();
if (typeof module !== 'undefined') module.exports = Agenda;
