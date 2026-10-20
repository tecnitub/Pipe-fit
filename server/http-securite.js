// Sécurité HTTP commune à Pipe-Fit et à l'application DOE :
// - HTTPS natif avec le certificat de l'entreprise (PEM ou PFX), rechargé à chaud quand il est renouvelé,
//   et redirection du port HTTP vers HTTPS ;
// - en-têtes de sécurité (CSP, HSTS, anti-cadre, permissions du navigateur) ;
// - adresse IP réelle du client derrière un reverse proxy (limitation des tentatives de connexion, première configuration).
//
// Certificat, par ordre de priorité :
//   TLS_PFX (+ TLS_PASSPHRASE)  ou  TLS_CERT + TLS_KEY (chemins de fichiers PEM)
//   sinon, dans le dossier TLS_DIR (par défaut <dossier des données>/tls) : certificat.pfx (+ TLS_PASSPHRASE)  ou  cert.pem + key.pem
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const https = require('node:https');
const crypto = require('node:crypto');
const tlsMod = require('node:tls');

function sourcesTLS(dossierDonnees) {
  const env = process.env, tls = env.TLS_DIR || (dossierDonnees ? path.join(dossierDonnees, 'tls') : '');
  if (env.TLS_PFX) return { pfx: env.TLS_PFX };
  if (env.TLS_CERT && env.TLS_KEY) return { cert: env.TLS_CERT, key: env.TLS_KEY };
  if (tls && fs.existsSync(path.join(tls, 'certificat.pfx'))) return { pfx: path.join(tls, 'certificat.pfx') };
  if (tls && fs.existsSync(path.join(tls, 'cert.pem')) && fs.existsSync(path.join(tls, 'key.pem'))) return { cert: path.join(tls, 'cert.pem'), key: path.join(tls, 'key.pem') };
  return null;
}
function chargerTLS(dossierDonnees) {
  const s = sourcesTLS(dossierDonnees);
  if (!s) return null;
  const opts = s.pfx ? { pfx: fs.readFileSync(s.pfx), passphrase: process.env.TLS_PASSPHRASE || undefined } : { cert: fs.readFileSync(s.cert), key: fs.readFileSync(s.key) };
  opts.minVersion = 'TLSv1.2';
  // Vérifie le certificat dès le démarrage (mot de passe du PFX, clé qui ne correspond pas…)
  tlsMod.createSecureContext(opts);
  return { opts, fichiers: Object.values(s), infos: infosCertificat(opts) };
}
// Sujet, émetteur et date d'expiration (affichés dans Paramètres → Sécurité)
function infosCertificat(opts) {
  try {
    let pem = opts.cert;
    if (!pem && opts.pfx) {
      const ctx = tlsMod.createSecureContext(opts).context;
      pem = ctx.getCertificate ? ctx.getCertificate() : null; // certificat (DER) extrait du PFX
    }
    if (!pem) return null;
    const x = new crypto.X509Certificate(pem);
    const fin = new Date(x.validTo);
    return { sujet: x.subject.replace(/\n/g, ', '), emetteur: x.issuer.replace(/\n/g, ', '), noms: x.subjectAltName || '', expire: fin.toISOString(),
      joursRestants: Math.floor((fin - Date.now()) / 86400000), autoSigne: x.subject === x.issuer };
  } catch (e) { return null; }
}

// Politique de sécurité du contenu : scripts et styles de l'application uniquement (OCR : WebAssembly et worker local)
const CSP = ["default-src 'self'", "script-src 'self' 'wasm-unsafe-eval' blob:", "worker-src 'self' blob:", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "font-src 'self' data:", "connect-src 'self' blob: data:", "media-src 'self' blob: data:", "object-src 'none'",
  "frame-src 'self' blob: data:", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"].join('; ');

const estLoopback = a => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(a);
// Proxy de confiance : celui du même serveur (Caddy, Nginx, IIS installé sur la machine), ou tout proxy si TRUST_PROXY=1
const proxyDeConfiance = req => process.env.TRUST_PROXY === '1' || estLoopback(req.socket.remoteAddress);
const passeParUnProxy = req => !!(req.headers['x-forwarded-for'] || req.headers.forwarded || req.headers['x-real-ip']);
// Adresse du client : la dernière ajoutée par le proxy de confiance (celles écrites par le client lui-même sont ignorées)
function ipClient(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  if (xff.length && proxyDeConfiance(req)) return xff[xff.length - 1];
  return req.socket.remoteAddress || '';
}
// Requête faite sur le serveur lui-même (et non relayée par un proxy installé sur la même machine)
const estLocal = req => estLoopback(req.socket.remoteAddress) && !passeParUnProxy(req);
const estHttps = req => !!req.socket.encrypted || (proxyDeConfiance(req) && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');

function entetes(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), interest-cohort=()');
  if (estHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
}

// Écriture (POST, PUT, DELETE) venant d'une page d'un autre site : refusée (en plus des cookies SameSite et du JSON obligatoire)
function origineRefusee(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return false;
  const o = req.headers.origin;
  if (!o || o === 'null') return o === 'null';
  let hote;
  try { hote = new URL(o).host; } catch (e) { return true; }
  const attendus = [req.headers.host, ...String(proxyDeConfiance(req) ? req.headers['x-forwarded-host'] || '' : '').split(',').map(s => s.trim())].filter(Boolean);
  return !attendus.includes(hote);
}

// Serveur HTTP ou HTTPS selon la présence d'un certificat.
// Avec un certificat, un seul port reçoit les deux : HTTPS normalement ; HTTP venant du réseau renvoyé vers HTTPS ;
// HTTP venant du serveur lui-même (raccourci du poste serveur, application DOE, reverse proxy local) servi tel quel.
function creerServeur(handler, { dossierDonnees, nom = 'Pipe-Fit' } = {}) {
  // Certificat prévu mais illisible : arrêt plutôt qu'un démarrage en HTTP simple (mots de passe en clair sans qu'on le sache)
  let tls;
  try { tls = chargerTLS(dossierDonnees); } catch (e) {
    throw new Error(`${nom} : certificat HTTPS illisible (${e.message}). Vérifiez le fichier et TLS_PASSPHRASE, ou retirez le certificat pour démarrer en HTTP.`);
  }
  const traiter = (req, res) => { entetes(req, res); handler(req, res); };
  const etat = { https: !!tls, certificat: tls ? tls.infos : null, recharge: null };
  if (!tls) return { server: http.createServer(traiter), etat, surveiller() {}, redirection() {} };

  const versHttps = (req, res, port) => {
    const hote = String(req.headers.host || 'localhost').replace(/:\d+$/, '').replace(/[^\w.-]/g, '');
    res.writeHead(301, { Location: `https://${hote}${+port === 443 ? '' : `:${port}`}${String(req.url || '/').startsWith('/') ? req.url : '/'}`, 'Content-Type': 'text/plain' });
    res.end('HTTPS requis');
  };
  const securise = https.createServer(tls.opts, traiter);
  const clair = http.createServer((req, res) => (estLoopback(req.socket.remoteAddress) ? traiter(req, res) : versHttps(req, res, req.socket.localPort)));
  // Aiguillage d'après le premier octet reçu : 0x16 = début d'une négociation TLS
  const server = net.createServer(sock => {
    sock.setTimeout(30000, () => sock.destroy());
    sock.once('data', buf => {
      sock.setTimeout(0);
      sock.pause(); sock.unshift(buf);
      (buf[0] === 0x16 ? securise : clair).emit('connection', sock);
      process.nextTick(() => sock.resume()); // reprise après la prise en charge par le serveur TLS ou HTTP
    });
    sock.on('error', () => sock.destroy());
  });
  server.closeAllConnections = () => { securise.closeAllConnections(); clair.closeAllConnections(); };

  // Certificat renouvelé (Let's Encrypt, certificat d'entreprise…) : rechargé sans redémarrer
  function surveiller() {
    tls.fichiers.forEach(f => fs.watchFile(f, { interval: 60000 }, () => {
      try { const t = chargerTLS(dossierDonnees); securise.setSecureContext(t.opts); Object.assign(etat, { certificat: t.infos, recharge: new Date().toISOString() }); console.log(`${nom} : certificat HTTPS rechargé`); }
      catch (e) { console.error(`${nom} : nouveau certificat illisible, l'ancien reste en service (${e.message})`); }
    }).unref());
  }
  // Port HTTP standard (80) qui renvoie vers le port HTTPS
  function redirection(portHttp, host, portHttps) {
    const r = http.createServer((req, res) => versHttps(req, res, portHttps));
    r.on('error', e => console.error(`${nom} : redirection HTTP -> HTTPS impossible sur le port ${portHttp} (${e.message})`));
    r.listen(portHttp, host);
    return r;
  }
  return { server, etat, surveiller, redirection };
}

module.exports = { CSP, entetes, origineRefusee, ipClient, estLocal, estHttps, proxyDeConfiance, creerServeur, chargerTLS, infosCertificat };
