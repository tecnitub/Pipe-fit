// Lecture des e-mails de demande des clients : .eml (MIME) et .msg (Outlook, fichier composé OLE).
const { test } = require('node:test');
const assert = require('node:assert');
const M = require('../public/js/mail-lecture');

test('.eml : en-têtes encodés, quoted-printable latin-1, multipart, pièces jointes', () => {
  const eml = ['From: =?UTF-8?B?TWFyYyBEdXJhbmQ=?= <m.durand@petrosud.example>', 'To: atelier@tecnitub.example', 'Subject: =?iso-8859-1?Q?Fuite_sur_la_vanne_DN80_=E0_l=27unit=E9_3?=',
    'Date: Fri, 16 Oct 2026 08:12:00 +0200', 'MIME-Version: 1.0', 'Content-Type: multipart/mixed; boundary="b1"', '', '--b1', 'Content-Type: multipart/alternative; boundary="b2"', '',
    '--b2', 'Content-Type: text/plain; charset=iso-8859-1', 'Content-Transfer-Encoding: quoted-printable', '', 'Bonjour,=0A=0ANous avons une fuite sur la vanne DN80 de l=27unit=E9 3.=0AMerci d=27intervenir.',
    '--b2', 'Content-Type: text/html; charset=utf-8', '', '<p>html</p>', '--b2--', '--b1', 'Content-Type: image/jpeg; name="photo fuite.jpg"', 'Content-Disposition: attachment; filename="photo fuite.jpg"',
    'Content-Transfer-Encoding: base64', '', '/9j/4AAQ', '--b1--', ''].join('\r\n');
  assert.deepStrictEqual(M.lireEML(new Uint8Array(Buffer.from(eml, 'latin1'))), { de: 'Marc Durand', deEmail: 'm.durand@petrosud.example', a: 'atelier@tecnitub.example',
    date: '2026-10-16T06:12:00.000Z', objet: 'Fuite sur la vanne DN80 à l\'unité 3', texte: 'Bonjour,\n\nNous avons une fuite sur la vanne DN80 de l\'unité 3.\nMerci d\'intervenir.', pieces: ['photo fuite.jpg'] });
  // Message HTML seul (sans partie texte) : texte reconstitué
  const html = 'From: a@b.example\r\nSubject: Test\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' + Buffer.from('<div>Bonjour&nbsp;!<br>Ligne 2</div><style>p{}</style>').toString('base64');
  assert.strictEqual(M.lireEML(new Uint8Array(Buffer.from(html))).texte, 'Bonjour !\nLigne 2');
});

// Petit fichier composé (CFB) pour le test : secteurs de 512 octets, une FAT, flux dans des secteurs normaux
function cfb(entrees) { // entrees : [{ nom, type: 1|2, parent: index (0 = racine), data }]
  const S = 512, secteurs = [], fat = [0xFFFFFFFD];
  const chaine = data => { const n = Math.max(1, Math.ceil(data.length / S)), debut = secteurs.length + 1; for (let i = 0; i < n; i++) { const s = Buffer.alloc(S); data.copy(s, 0, i * S, (i + 1) * S); secteurs.push(s); fat.push(i === n - 1 ? 0xFFFFFFFE : debut + i + 1); } return debut; };
  const tous = [{ nom: 'Root Entry', type: 5, parent: -1 }, ...entrees];
  const dirData = Buffer.alloc(Math.ceil(tous.length / 4) * 512);
  const dirDebut = chaine(dirData);
  tous.forEach((e, i) => { e.debut = e.type === 2 ? chaine(e.data) : 0xFFFFFFFE; e.enfant = 0xFFFFFFFF; e.droite = 0xFFFFFFFF; });
  tous.forEach((e, i) => { if (i === 0) return; const p = tous[e.parent]; if (p.enfant === 0xFFFFFFFF) p.enfant = i; else { let k = tous[p.enfant]; while (k.droite !== 0xFFFFFFFF) k = tous[k.droite]; k.droite = i; } });
  tous.forEach((e, i) => { const o = i * 128, n = Buffer.from(`${e.nom}\0`, 'utf16le'); n.copy(dirData, o); dirData.writeUInt16LE(n.length, o + 64); dirData[o + 66] = e.type; dirData[o + 67] = 1;
    dirData.writeUInt32LE(0xFFFFFFFF, o + 68); dirData.writeUInt32LE(e.droite, o + 72); dirData.writeUInt32LE(e.enfant, o + 76); dirData.writeUInt32LE(e.debut, o + 116); dirData.writeUInt32LE(e.type === 2 ? e.data.length : 0, o + 120); });
  for (let i = 0; i < dirData.length / S; i++) dirData.copy(secteurs[dirDebut - 1 + i], 0, i * S, (i + 1) * S);
  const h = Buffer.alloc(512, 0); Buffer.from('d0cf11e0a1b11ae1', 'hex').copy(h, 0);
  h.writeUInt16LE(0x3E, 24); h.writeUInt16LE(3, 26); h.writeUInt16LE(0xFFFE, 28); h.writeUInt16LE(9, 30); h.writeUInt16LE(6, 32); h.writeUInt32LE(1, 44); h.writeUInt32LE(dirDebut, 48);
  h.writeUInt32LE(0, 56); h.writeUInt32LE(0xFFFFFFFE, 60); h.writeUInt32LE(0xFFFFFFFE, 68); for (let i = 0; i < 109; i++) h.writeUInt32LE(i === 0 ? 0 : 0xFFFFFFFF, 76 + 4 * i);
  const f = Buffer.alloc(S, 0xFF); fat.forEach((v, i) => f.writeUInt32LE(v, i * 4));
  return new Uint8Array(Buffer.concat([h, f, ...secteurs]));
}
const u16 = s => Buffer.from(s, 'utf16le');

test('.msg Outlook : expéditeur, objet, date, texte, pièces jointes', () => {
  const props = Buffer.alloc(32 + 16); props.writeUInt32LE(0x00390040, 32);
  const ft = (Date.parse('2026-10-16T06:12:00Z') + 11644473600000) * 10000; props.writeUInt32LE(ft % 4294967296, 40); props.writeUInt32LE(Math.floor(ft / 4294967296), 44);
  const fichier = cfb([
    { nom: '__substg1.0_0037001F', type: 2, parent: 0, data: u16('Demande d\'intervention : purgeur vapeur') },
    { nom: '__substg1.0_0C1A001F', type: 2, parent: 0, data: u16('Marc Durand') },
    { nom: '__substg1.0_5D01001F', type: 2, parent: 0, data: u16('m.durand@petrosud.example') },
    { nom: '__substg1.0_0E04001F', type: 2, parent: 0, data: u16('Atelier TECNITUB') },
    { nom: '__substg1.0_1000001F', type: 2, parent: 0, data: u16('Bonjour,\r\nLe purgeur P-14 fuit.\r\nCordialement') },
    { nom: '__properties_version1.0', type: 2, parent: 0, data: props },
    { nom: '__attach_version1.0_#00000000', type: 1, parent: 0 },
    { nom: '__substg1.0_3707001F', type: 2, parent: 7, data: u16('photo P-14.jpg') },
    // Même propriété dans la pièce jointe : ne doit pas remplacer l'objet du message
    { nom: '__substg1.0_0037001F', type: 2, parent: 7, data: u16('objet de la pièce jointe') },
  ]);
  assert.deepStrictEqual(M.lire('demande.msg', fichier), { de: 'Marc Durand', deEmail: 'm.durand@petrosud.example', a: 'Atelier TECNITUB', date: '2026-10-16T06:12:00.000Z',
    objet: 'Demande d\'intervention : purgeur vapeur', texte: 'Bonjour,\nLe purgeur P-14 fuit.\nCordialement', pieces: ['photo P-14.jpg'] });
  assert.throws(() => M.lire('faux.msg', new Uint8Array(600)), /n'est pas un message Outlook/);
});
