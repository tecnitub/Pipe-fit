/* Lanceur d'Atelier PDF (Windows) : AtelierPDF.exe [fichier.pdf ...]
 *
 * Sans argument : ouvre l'application (AtelierPDF.html, à côté du lanceur) dans une fenêtre Microsoft Edge.
 * Avec des fichiers (double-clic sur un PDF, « Ouvrir avec », plusieurs fichiers sélectionnés) : une page de
 * démarrage est écrite dans %LOCALAPPDATA%\AtelierPDF\ouverture ; c'est l'application, avec le contenu des
 * fichiers inclus (blocs <script type="application/octet-stream"> en base64, non exécutés : rapides à charger),
 * car une page locale ne peut pas lire elle-même un fichier du disque.
 * Les pages de démarrage de plus de deux jours sont effacées à chaque lancement.
 *
 * Construction : x86_64-w64-mingw32-gcc -municode -mwindows (voir installer/build-pdf.sh).
 */
#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <shellapi.h>
#include <stdio.h>
#include <string.h>

#define MAX_CHEMIN 32768

static void message(const wchar_t *texte) {
  MessageBoxW(NULL, texte, L"Atelier PDF", MB_OK | MB_ICONWARNING);
}

/* Dossier du lanceur (sans la barre finale) */
static void dossierDuProgramme(wchar_t *dossier) {
  GetModuleFileNameW(NULL, dossier, MAX_CHEMIN);
  wchar_t *barre = wcsrchr(dossier, L'\\');
  if (barre) *barre = 0;
}

/* Lecture complète d'un fichier ; NULL en cas d'échec */
static unsigned char *lireFichier(const wchar_t *chemin, DWORD *taille) {
  HANDLE h = CreateFileW(chemin, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
  if (h == INVALID_HANDLE_VALUE) return NULL;
  LARGE_INTEGER t;
  if (!GetFileSizeEx(h, &t) || t.QuadPart > 400LL * 1024 * 1024) { CloseHandle(h); return NULL; }
  unsigned char *o = (unsigned char *)HeapAlloc(GetProcessHeap(), 0, (SIZE_T)t.QuadPart + 1);
  DWORD lu = 0, total = 0;
  while (o && total < (DWORD)t.QuadPart && ReadFile(h, o + total, (DWORD)t.QuadPart - total, &lu, NULL) && lu) total += lu;
  CloseHandle(h);
  if (!o || total != (DWORD)t.QuadPart) { if (o) HeapFree(GetProcessHeap(), 0, o); return NULL; }
  *taille = total;
  return o;
}

static BOOL ecrire(HANDLE h, const void *d, DWORD n) {
  DWORD e = 0;
  return WriteFile(h, d, n, &e, NULL) && e == n;
}

/* Base64 écrit par blocs */
static BOOL ecrireBase64(HANDLE h, const unsigned char *d, DWORD n) {
  static const char T[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  char tampon[65536];
  DWORD p = 0;
  for (DWORD i = 0; i < n; i += 3) {
    unsigned v = d[i] << 16 | (i + 1 < n ? d[i + 1] << 8 : 0) | (i + 2 < n ? d[i + 2] : 0);
    tampon[p++] = T[(v >> 18) & 63];
    tampon[p++] = T[(v >> 12) & 63];
    tampon[p++] = i + 1 < n ? T[(v >> 6) & 63] : '=';
    tampon[p++] = i + 2 < n ? T[v & 63] : '=';
    if (p > sizeof(tampon) - 8) { if (!ecrire(h, tampon, p)) return FALSE; p = 0; }
  }
  return p == 0 || ecrire(h, tampon, p);
}

/* Nom de fichier (sans le dossier) en valeur d'attribut HTML, UTF-8 */
static BOOL ecrireNomAttribut(HANDLE h, const wchar_t *chemin) {
  const wchar_t *nom = chemin;
  for (const wchar_t *c = chemin; *c; c++) if (*c == L'\\' || *c == L'/') nom = c + 1;
  char utf8[4096], attr[16384];
  int n = WideCharToMultiByte(CP_UTF8, 0, nom, -1, utf8, sizeof(utf8), NULL, NULL);
  if (n <= 0) return FALSE;
  int p = 0;
  attr[p++] = '"';
  for (int i = 0; utf8[i] && p < (int)sizeof(attr) - 8; i++) {
    unsigned char c = (unsigned char)utf8[i];
    if (c == '&') p += sprintf(attr + p, "&amp;");
    else if (c == '"') p += sprintf(attr + p, "&quot;");
    else if (c == '<') p += sprintf(attr + p, "&lt;");
    else if (c == '>') p += sprintf(attr + p, "&gt;");
    else attr[p++] = c;
  }
  attr[p++] = '"';
  return ecrire(h, attr, p);
}

/* Chemin Windows -> adresse file:/// (UTF-8, caractères spéciaux encodés) */
static void adresseFichier(const wchar_t *chemin, wchar_t *adresse) {
  char utf8[MAX_CHEMIN * 3], url[MAX_CHEMIN * 3 + 16];
  WideCharToMultiByte(CP_UTF8, 0, chemin, -1, utf8, sizeof(utf8), NULL, NULL);
  int p = sprintf(url, "file:///");
  for (int i = 0; utf8[i] && p < (int)sizeof(url) - 4; i++) {
    unsigned char c = (unsigned char)utf8[i];
    if (c == '\\') url[p++] = '/';
    else if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || strchr("-._~/:", c)) url[p++] = c;
    else p += sprintf(url + p, "%%%02X", c);
  }
  url[p] = 0;
  MultiByteToWideChar(CP_UTF8, 0, url, -1, adresse, MAX_CHEMIN * 3);
}

/* Chemin de msedge.exe, ou chaîne vide */
static void cheminEdge(wchar_t *edge) {
  DWORD t = MAX_CHEMIN * sizeof(wchar_t);
  const wchar_t *cle = L"SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\msedge.exe";
  edge[0] = 0;
  if (RegGetValueW(HKEY_LOCAL_MACHINE, cle, NULL, RRF_RT_REG_SZ | RRF_SUBKEY_WOW6464KEY, NULL, edge, &t) == ERROR_SUCCESS && GetFileAttributesW(edge) != INVALID_FILE_ATTRIBUTES) return;
  t = MAX_CHEMIN * sizeof(wchar_t);
  if (RegGetValueW(HKEY_LOCAL_MACHINE, cle, NULL, RRF_RT_REG_SZ | RRF_SUBKEY_WOW6432KEY, NULL, edge, &t) == ERROR_SUCCESS && GetFileAttributesW(edge) != INVALID_FILE_ATTRIBUTES) return;
  t = MAX_CHEMIN * sizeof(wchar_t);
  if (RegGetValueW(HKEY_CURRENT_USER, cle, NULL, RRF_RT_REG_SZ, NULL, edge, &t) == ERROR_SUCCESS && GetFileAttributesW(edge) != INVALID_FILE_ATTRIBUTES) return;
  const wchar_t *connus[] = { L"%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe", L"%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe", L"%LOCALAPPDATA%\\Microsoft\\Edge\\Application\\msedge.exe" };
  for (int i = 0; i < 3; i++) {
    ExpandEnvironmentStringsW(connus[i], edge, MAX_CHEMIN);
    if (GetFileAttributesW(edge) != INVALID_FILE_ATTRIBUTES) return;
  }
  edge[0] = 0;
}

/* Regroupement des fichiers : quand plusieurs fichiers sont sélectionnés dans l'Explorateur, Windows peut lancer un
 * lanceur par fichier. Le premier crée la file d'attente et attend que plus rien n'arrive ; les suivants y ajoutent
 * leurs fichiers et s'arrêtent. Une seule fenêtre s'ouvre avec tous les fichiers. File protégée par un mutex nommé. */
static HANDLE verrou;
static void verrouiller(void) { WaitForSingleObject(verrou, 5000); }
static void deverrouiller(void) { ReleaseMutex(verrou); }
static LONGLONG tailleFile(const wchar_t *file) {
  WIN32_FILE_ATTRIBUTE_DATA a;
  if (!GetFileAttributesExW(file, GetFileExInfoStandard, &a)) return -1;
  return ((LONGLONG)a.nFileSizeHigh << 32) | a.nFileSizeLow;
}
static void ajouterALaFile(HANDLE h, int argc, LPWSTR *argv) {
  wchar_t complet[MAX_CHEMIN];
  for (int i = 1; i < argc; i++) {
    DWORD n = GetFullPathNameW(argv[i], MAX_CHEMIN, complet, NULL);
    if (!n || n >= MAX_CHEMIN) continue;
    ecrire(h, complet, n * sizeof(wchar_t));
    ecrire(h, L"\n", sizeof(wchar_t));
  }
}
/* Renvoie 0 si ce lanceur a confié ses fichiers à un autre ; sinon la liste complète (à libérer) et son nombre */
static LPWSTR *regrouper(const wchar_t *dossier, int argc, LPWSTR *argv, int *nb) {
  wchar_t file[MAX_CHEMIN];
  swprintf(file, MAX_CHEMIN, L"%ls\\file-attente.txt", dossier);
  verrou = CreateMutexW(NULL, FALSE, L"Local\\AtelierPDF-file-attente");
  verrouiller();
  BOOL existe = GetFileAttributesW(file) != INVALID_FILE_ATTRIBUTES;
  /* File abandonnée (lanceur interrompu) : plus de 10 secondes, on repart de zéro */
  if (existe) {
    WIN32_FILE_ATTRIBUTE_DATA a; FILETIME m;
    GetFileAttributesExW(file, GetFileExInfoStandard, &a);
    GetSystemTimeAsFileTime(&m);
    ULARGE_INTEGER t1 = { .LowPart = a.ftLastWriteTime.dwLowDateTime, .HighPart = a.ftLastWriteTime.dwHighDateTime };
    ULARGE_INTEGER t2 = { .LowPart = m.dwLowDateTime, .HighPart = m.dwHighDateTime };
    if (t2.QuadPart - t1.QuadPart > 10ULL * 10000000ULL) { DeleteFileW(file); existe = FALSE; }
  }
  HANDLE h = CreateFileW(file, FILE_APPEND_DATA, FILE_SHARE_READ, NULL, existe ? OPEN_EXISTING : CREATE_NEW, FILE_ATTRIBUTE_NORMAL, NULL);
  if (h != INVALID_HANDLE_VALUE) { ajouterALaFile(h, argc, argv); CloseHandle(h); }
  deverrouiller();
  if (existe && h != INVALID_HANDLE_VALUE) return NULL; /* un autre lanceur ouvrira la fenêtre */
  if (h == INVALID_HANDLE_VALUE) { *nb = argc - 1; return argv + 1; }
  /* Premier lanceur : on attend que la file ne bouge plus */
  LONGLONG avant = -2;
  BOOL stable = FALSE;
  for (int essai = 0; essai < 40 && !stable; essai++) {
    Sleep(250);
    verrouiller();
    LONGLONG t = tailleFile(file);
    stable = t == avant;
    avant = t;
    if (!stable) deverrouiller();
  }
  if (!stable) verrouiller();
  /* (verrou tenu) lecture puis suppression de la file */
  DWORD n = 0;
  unsigned char *d = lireFichier(file, &n);
  DeleteFileW(file);
  deverrouiller();
  CloseHandle(verrou);
  if (!d) { *nb = argc - 1; return argv + 1; }
  wchar_t *texte = (wchar_t *)d;
  DWORD nbCar = n / sizeof(wchar_t);
  LPWSTR *liste = (LPWSTR *)HeapAlloc(GetProcessHeap(), 0, sizeof(LPWSTR) * (nbCar + 1));
  int k = 0;
  wchar_t *debut = texte;
  for (DWORD i = 0; i < nbCar; i++) {
    if (texte[i] != L'\n') continue;
    texte[i] = 0;
    if (*debut) {
      BOOL double_ = FALSE; /* même fichier envoyé deux fois */
      for (int j = 0; j < k; j++) if (!_wcsicmp(liste[j], debut)) double_ = TRUE;
      if (!double_) liste[k++] = debut;
    }
    debut = texte + i + 1;
  }
  *nb = k;
  return liste;
}

/* Efface les pages de démarrage de plus de deux jours */
static void nettoyer(const wchar_t *dossier) {
  wchar_t motif[MAX_CHEMIN], chemin[MAX_CHEMIN];
  swprintf(motif, MAX_CHEMIN, L"%ls\\Atelier-*.html", dossier);
  WIN32_FIND_DATAW f;
  HANDLE r = FindFirstFileW(motif, &f);
  if (r == INVALID_HANDLE_VALUE) return;
  FILETIME maintenant;
  GetSystemTimeAsFileTime(&maintenant);
  ULARGE_INTEGER m = { .LowPart = maintenant.dwLowDateTime, .HighPart = maintenant.dwHighDateTime };
  do {
    ULARGE_INTEGER d = { .LowPart = f.ftLastWriteTime.dwLowDateTime, .HighPart = f.ftLastWriteTime.dwHighDateTime };
    if (m.QuadPart - d.QuadPart > 2ULL * 24 * 3600 * 10000000ULL) {
      swprintf(chemin, MAX_CHEMIN, L"%ls\\%ls", dossier, f.cFileName);
      DeleteFileW(chemin);
    }
  } while (FindNextFileW(r, &f));
  FindClose(r);
}

/* ----- Mises à jour : nouvelle version déposée dans le dossier d'installation d'origine (dossier réseau) -----
 * L'installateur enregistre ce dossier (HKCU\Software\AtelierPDF, « DossierMisesAJour ») quand il a été lancé depuis
 * le réseau. Au démarrage, une fois par jour au plus et sans retarder l'ouverture, on y cherche
 * AtelierPDF-Setup-x.y.z.exe plus récent que cette version, et on propose de l'installer. */
#ifndef VERSION_ATELIER
#define VERSION_ATELIER "0.0.0"
#endif
#define CLE_ATELIER L"Software\\AtelierPDF"
/* Question posée à l'utilisateur (remplaçable pour les essais automatiques) */
#ifndef DEMANDER
#define DEMANDER(m) MessageBoxW(NULL, (m), L"Atelier PDF — mise à jour", MB_YESNO | MB_ICONINFORMATION | MB_SETFOREGROUND)
#endif
static wchar_t setupTrouve[MAX_CHEMIN], versionTrouvee[64];
static int comparerVersions(const wchar_t *a, const wchar_t *b) {
  unsigned va[3] = {0}, vb[3] = {0};
  for (int i = 0, k = 0; a[i] && k < 3; i++) { if (a[i] == L'.') k++; else if (a[i] >= L'0' && a[i] <= L'9') va[k] = va[k] * 10 + (a[i] - L'0'); }
  for (int i = 0, k = 0; b[i] && k < 3; i++) { if (b[i] == L'.') k++; else if (b[i] >= L'0' && b[i] <= L'9') vb[k] = vb[k] * 10 + (b[i] - L'0'); }
  for (int i = 0; i < 3; i++) if (va[i] != vb[i]) return va[i] < vb[i] ? -1 : 1;
  return 0;
}
static DWORD WINAPI chercherMiseAJour(LPVOID inutile) {
  (void)inutile;
  wchar_t dossier[MAX_CHEMIN], motif[MAX_CHEMIN], actuelle[64];
  DWORD t = sizeof(dossier);
  if (RegGetValueW(HKEY_CURRENT_USER, CLE_ATELIER, L"DossierMisesAJour", RRF_RT_REG_SZ, NULL, dossier, &t) != ERROR_SUCCESS || !dossier[0]) return 0;
  MultiByteToWideChar(CP_UTF8, 0, VERSION_ATELIER, -1, actuelle, 64);
  swprintf(motif, MAX_CHEMIN, L"%ls\\AtelierPDF-Setup-*.exe", dossier);
  WIN32_FIND_DATAW f;
  HANDLE r = FindFirstFileW(motif, &f);
  if (r == INVALID_HANDLE_VALUE) return 0;
  wchar_t meilleure[64];
  wcscpy(meilleure, actuelle);
  do {
    /* « AtelierPDF-Setup-1.7.2.exe » -> « 1.7.2 » (lu à la main : swscanf et %[ diffèrent selon les bibliothèques C) */
    wchar_t v[64] = {0};
    const wchar_t *debut = f.cFileName + wcslen(L"AtelierPDF-Setup-");
    size_t n = 0;
    while (n < 63 && ((debut[n] >= L'0' && debut[n] <= L'9') || debut[n] == L'.')) { v[n] = debut[n]; n++; }
    while (n && v[n - 1] == L'.') v[--n] = 0;
    if (n && _wcsicmp(debut + wcslen(v), L".exe") == 0 && comparerVersions(v, meilleure) > 0) {
      wcscpy(meilleure, v);
      swprintf(setupTrouve, MAX_CHEMIN, L"%ls\\%ls", dossier, f.cFileName);
    }
  } while (FindNextFileW(r, &f));
  FindClose(r);
  if (setupTrouve[0]) wcscpy(versionTrouvee, meilleure);
  return 0;
}
static BOOL verificationDuJour(void) {
  SYSTEMTIME st;
  GetLocalTime(&st);
  DWORD aujourdhui = st.wYear * 10000 + st.wMonth * 100 + st.wDay, derniere = 0, t = sizeof(derniere);
  RegGetValueW(HKEY_CURRENT_USER, CLE_ATELIER, L"DerniereVerification", RRF_RT_REG_DWORD, NULL, &derniere, &t);
  if (derniere == aujourdhui) return FALSE;
  HKEY k;
  if (RegCreateKeyExW(HKEY_CURRENT_USER, CLE_ATELIER, 0, NULL, 0, KEY_SET_VALUE, NULL, &k, NULL) == ERROR_SUCCESS) {
    RegSetValueExW(k, L"DerniereVerification", 0, REG_DWORD, (const BYTE *)&aujourdhui, sizeof(aujourdhui));
    RegCloseKey(k);
  }
  return TRUE;
}
/* Après l'ouverture de la fenêtre : attend la recherche (10 s au plus, dossier réseau lent) puis propose l'installation */
static void proposerMiseAJour(HANDLE recherche) {
  if (!recherche) return;
  if (WaitForSingleObject(recherche, 10000) != WAIT_OBJECT_0) return;
  CloseHandle(recherche);
  if (!setupTrouve[0]) return;
  wchar_t m[MAX_CHEMIN + 256];
  swprintf(m, MAX_CHEMIN + 256, L"Une nouvelle version d'Atelier PDF (%ls) est disponible :\n%ls\n\nL'installer maintenant ? Enregistrez d'abord votre travail en cours (il est aussi sauvegardé automatiquement).", versionTrouvee, setupTrouve);
  if (DEMANDER(m) == IDYES)
    ShellExecuteW(NULL, L"open", setupTrouve, NULL, NULL, SW_SHOWNORMAL);
}

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE prec, PWSTR ligne, int affichage) {
  (void)inst; (void)prec; (void)ligne; (void)affichage;
  int argc = 0;
  LPWSTR *argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  static wchar_t dossier[MAX_CHEMIN], appli[MAX_CHEMIN], page[MAX_CHEMIN], adresse[MAX_CHEMIN * 3], edge[MAX_CHEMIN], commande[MAX_CHEMIN * 4];
  dossierDuProgramme(dossier);
  swprintf(appli, MAX_CHEMIN, L"%ls\\AtelierPDF.html", dossier);
  DWORD tailleAppli = 0;
  unsigned char *html = NULL;
  wcscpy(page, appli);
  /* Recherche d'une mise à jour en parallèle (lancement simple seulement : on n'interrompt pas l'ouverture d'un document) */
  HANDLE recherche = (argc <= 1 && verificationDuJour()) ? CreateThread(NULL, 0, chercherMiseAJour, NULL, 0, NULL) : NULL;

  if (argc > 1) {
    html = lireFichier(appli, &tailleAppli);
    if (!html) { message(L"Fichier AtelierPDF.html introuvable : réinstallez Atelier PDF."); return 1; }
    wchar_t base[MAX_CHEMIN], ouverture[MAX_CHEMIN];
    ExpandEnvironmentStringsW(L"%LOCALAPPDATA%\\AtelierPDF", base, MAX_CHEMIN);
    CreateDirectoryW(base, NULL);
    swprintf(ouverture, MAX_CHEMIN, L"%ls\\ouverture", base);
    CreateDirectoryW(ouverture, NULL);
    nettoyer(ouverture);
    int nbFichiers = 0;
    LPWSTR *fichiers = regrouper(ouverture, argc, argv, &nbFichiers);
    if (!fichiers) return 0;
    swprintf(page, MAX_CHEMIN, L"%ls\\Atelier-%lu-%lu.html", ouverture, GetCurrentProcessId(), GetTickCount());
    HANDLE h = CreateFileW(page, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) { message(L"Impossible de préparer l'ouverture du fichier (dossier temporaire inaccessible)."); return 1; }
    /* Les données sont placées juste après <meta charset="utf-8"> : le navigateur doit trouver l'encodage dans les
       premiers octets du fichier (sinon les accents des noms sont mal lus), et rien avant le doctype (mode standard) */
    const char *debutTete = NULL;
    for (DWORD i = 0; i + 14 <= tailleAppli && i < 4096 && !debutTete; i++) {
      if (!memcmp(html + i, "<meta charset=", 14)) {
        for (DWORD k = i; k < tailleAppli && k < i + 64; k++) if (html[k] == '>') { debutTete = (const char *)html + k + 1; break; }
      }
    }
    for (DWORD i = 0; !debutTete && i + 6 <= tailleAppli && i < 4096; i++) if (!memcmp(html + i, "<head>", 6)) { debutTete = (const char *)html + i + 6; break; }
    DWORD avant = debutTete ? (DWORD)(debutTete - (const char *)html) : 0;
    BOOL ok = ecrire(h, html, avant);
    int ouverts = 0;
    for (int i = 0; i < nbFichiers && ok; i++) {
      DWORD n = 0;
      unsigned char *d = lireFichier(fichiers[i], &n);
      if (!d) {
        wchar_t m[MAX_CHEMIN + 128];
        swprintf(m, MAX_CHEMIN + 128, L"Fichier illisible ou trop gros (400 Mo au plus) :\n%ls", fichiers[i]);
        message(m);
        continue;
      }
      char debut[96];
      int ld = sprintf(debut, "\n<script type=\"application/octet-stream\" id=\"atelier-fichier-%d\" data-nom=", ouverts);
      ok = ecrire(h, debut, ld) && ecrireNomAttribut(h, fichiers[i]) && ecrire(h, ">", 1) && ecrireBase64(h, d, n) && ecrire(h, "</script>", 9);
      HeapFree(GetProcessHeap(), 0, d);
      ouverts++;
    }
    ok = ok && ecrire(h, "\n", 1) && ecrire(h, html + avant, tailleAppli - avant);
    CloseHandle(h);
    HeapFree(GetProcessHeap(), 0, html);
    if (!ok) { DeleteFileW(page); message(L"Impossible de préparer l'ouverture du fichier (disque plein ?)."); return 1; }
    if (!ouverts) { DeleteFileW(page); return 1; }
  }

  adresseFichier(page, adresse);
  cheminEdge(edge);
  if (edge[0]) {
    swprintf(commande, MAX_CHEMIN * 4, L"\"%ls\" --app=\"%ls\"", edge, adresse);
    STARTUPINFOW si = { .cb = sizeof(si) };
    PROCESS_INFORMATION pi;
    if (CreateProcessW(NULL, commande, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
      CloseHandle(pi.hThread);
      CloseHandle(pi.hProcess);
      proposerMiseAJour(recherche);
      return 0;
    }
  }
  /* Sans Edge : navigateur par défaut */
  if ((INT_PTR)ShellExecuteW(NULL, L"open", page, NULL, NULL, SW_SHOWNORMAL) <= 32) {
    message(L"Aucun navigateur trouvé pour ouvrir Atelier PDF (Microsoft Edge conseillé).");
    proposerMiseAJour(recherche);
    return 1;
  }
  proposerMiseAJour(recherche);
  return 0;
}
