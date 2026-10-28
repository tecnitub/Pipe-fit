// Envoi d'e-mails par Microsoft Graph (Microsoft 365) : le message part de la boîte de l'utilisateur
// et est enregistré dans ses « Éléments envoyés » (saveToSentItems).
// Prérequis : une application Entra ID (Azure AD) avec l'autorisation d'application Mail.Send.
const LOGIN = () => process.env.M365_LOGIN_URL || 'https://login.microsoftonline.com';
const GRAPH = () => process.env.M365_GRAPH_URL || 'https://graph.microsoft.com';
const jetons = new Map(); // « tenant|client » -> { token, exp }

async function jeton(cfg) {
  const cle = `${cfg.tenantId}|${cfg.clientId}`;
  const j = jetons.get(cle);
  if (j && j.exp > Date.now() + 60000) return j.token;
  const res = await fetch(`${LOGIN()}/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  }).catch(e => { throw new Error(`Microsoft 365 injoignable (${e.message}) : vérifiez l'accès Internet du serveur.`); });
  const r = await res.json().catch(() => ({}));
  if (!res.ok || !r.access_token) throw new Error(`Connexion à Microsoft 365 refusée : ${String(r.error_description || r.error || res.status).split(/\r?\n/)[0]}`);
  jetons.set(cle, { token: r.access_token, exp: Date.now() + (r.expires_in || 3600) * 1000 });
  return r.access_token;
}

async function envoyer(cfg, expediteur, msg) {
  const token = await jeton(cfg);
  const adr = l => (l || []).map(address => ({ emailAddress: { address } }));
  const res = await fetch(`${GRAPH()}/v1.0/users/${encodeURIComponent(expediteur)}/sendMail`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: msg.subject, body: { contentType: 'HTML', content: msg.html },
        toRecipients: adr(msg.to), ccRecipients: adr(msg.cc), bccRecipients: adr(msg.bcc), ...(msg.replyTo && msg.replyTo.length ? { replyTo: adr(msg.replyTo) } : {}),
        attachments: (msg.attachments || []).map(a => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: a.name, contentType: a.contentType || 'application/pdf', contentBytes: a.base64 })),
      },
      saveToSentItems: true,
    }),
  }).catch(e => { throw new Error(`Microsoft 365 injoignable (${e.message}).`); });
  if (res.ok) return;
  const r = await res.json().catch(() => ({}));
  const detail = (r.error && r.error.message) || res.status;
  if (res.status === 401 || res.status === 403) throw new Error(`Envoi refusé par Microsoft 365 pour ${expediteur} : l'application doit avoir l'autorisation Mail.Send (consentement administrateur) et cette boîte doit être autorisée. (${detail})`);
  if (res.status === 404) throw new Error(`Boîte aux lettres ${expediteur} introuvable dans Microsoft 365. (${detail})`);
  throw new Error(`Microsoft 365 : ${detail}`);
}

// Calendrier d'une boîte (planning) : création, mise à jour, suppression d'un événement
// Prérequis : autorisation d'application Calendars.ReadWrite (consentement administrateur).
async function evenement(cfg, boite, methode, id, corps) {
  const token = await jeton(cfg);
  const url = `${GRAPH()}/v1.0/users/${encodeURIComponent(boite)}/events${id ? `/${encodeURIComponent(id)}` : ''}`;
  const res = await fetch(url, { method: methode, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined })
    .catch(e => { throw new Error(`Microsoft 365 injoignable (${e.message}).`); });
  if (res.status === 204) return {};
  const r = await res.json().catch(() => ({}));
  if (res.ok) return r;
  const detail = (r.error && r.error.message) || res.status;
  const err = new Error(res.status === 401 || res.status === 403 ? `Agenda de ${boite} refusé : l'application doit avoir l'autorisation Calendars.ReadWrite (consentement administrateur). (${detail})`
    : res.status === 404 ? `Introuvable dans Microsoft 365 (${boite}) : ${detail}` : `Microsoft 365 : ${detail}`);
  err.status = res.status;
  throw err;
}

// Appel Graph générique sur une boîte aux lettres (relève des factures reçues par e-mail).
// Prérequis : autorisation d'application Mail.ReadWrite (consentement administrateur).
async function boite(cfg, adresse, methode, chemin, corps) {
  const token = await jeton(cfg);
  const res = await fetch(`${GRAPH()}/v1.0/users/${encodeURIComponent(adresse)}${chemin}`, { method: methode, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined })
    .catch(e => { throw new Error(`Microsoft 365 injoignable (${e.message}).`); });
  if (res.status === 204) return {};
  const r = await res.json().catch(() => ({}));
  if (res.ok) return r;
  const detail = (r.error && r.error.message) || res.status;
  const err = new Error(res.status === 401 || res.status === 403 ? `Boîte ${adresse} refusée : l'application doit avoir l'autorisation Mail.ReadWrite (consentement administrateur). (${detail})`
    : res.status === 404 ? `Boîte aux lettres ${adresse} introuvable dans Microsoft 365. (${detail})` : `Microsoft 365 : ${detail}`);
  err.status = res.status;
  throw err;
}

module.exports = { jeton, envoyer, evenement, boite, oublier: () => jetons.clear() };
