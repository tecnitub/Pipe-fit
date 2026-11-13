/* Lanceur de Studio Diaporama (Windows) : StudioDiaporama.exe [projet.diapo]
 *
 * Sans argument : ouvre l'application (StudioDiaporama.html, à côté du lanceur) dans sa propre fenêtre
 * Microsoft Edge (mode application), avec un profil dédié pour que la fenêtre garde sa taille et ses réglages.
 * Avec un projet .diapo (double-clic dans l'Explorateur) : une page de démarrage est écrite dans
 * %LOCALAPPDATA%\StudioDiaporama\ouverture ; c'est l'application avec le projet inclus (bloc
 * <script type="application/octet-stream" id="diapo-projet"> en base64), car une page locale ne peut pas lire
 * elle-même un fichier du disque. Les pages de démarrage de plus de deux jours sont effacées à chaque lancement.
 *
 * Construction : x86_64-w64-mingw32-gcc -municode -mwindows (voir installer/build-diaporama.sh).
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
#define TAILLE_MAX (1024LL * 1024 * 1024)

static void message(const wchar_t *texte) {
  MessageBoxW(NULL, texte, L"Studio Diaporama", MB_OK | MB_ICONWARNING);
}

static void dossierDuProgramme(wchar_t *dossier) {
  GetModuleFileNameW(NULL, dossier, MAX_CHEMIN);
  wchar_t *barre = wcsrchr(dossier, L'\\');
  if (barre) *barre = 0;
}

static unsigned char *lireFichier(const wchar_t *chemin, DWORD *taille) {
  HANDLE h = CreateFileW(chemin, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
  if (h == INVALID_HANDLE_VALUE) return NULL;
  LARGE_INTEGER t;
  if (!GetFileSizeEx(h, &t) || t.QuadPart > TAILLE_MAX) { CloseHandle(h); return NULL; }
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

/* Chemin Windows -> adresse file:/// (UTF-8 encodé) */
static void adresseFichier(const wchar_t *chemin, wchar_t *adresse) {
  static char utf8[MAX_CHEMIN * 3], url[MAX_CHEMIN * 3 + 16];
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

/* Efface les pages de démarrage de plus de deux jours */
static void nettoyer(const wchar_t *dossier) {
  static wchar_t motif[MAX_CHEMIN], chemin[MAX_CHEMIN];
  swprintf(motif, MAX_CHEMIN, L"%ls\\Projet-*.html", dossier);
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

/* Écrit l'application avec le projet inclus juste après <meta charset="utf-8"> */
static BOOL preparerOuverture(const wchar_t *appli, const wchar_t *base, const wchar_t *projet, wchar_t *page) {
  DWORD tailleAppli = 0, tailleProjet = 0;
  unsigned char *html = lireFichier(appli, &tailleAppli);
  if (!html) { message(L"Fichier StudioDiaporama.html introuvable : réinstallez Studio Diaporama."); return FALSE; }
  unsigned char *donnees = lireFichier(projet, &tailleProjet);
  if (!donnees) {
    HeapFree(GetProcessHeap(), 0, html);
    static wchar_t m[MAX_CHEMIN + 128];
    swprintf(m, MAX_CHEMIN + 128, L"Projet illisible ou trop gros (1 Go au plus) :\n%ls", projet);
    message(m);
    return FALSE;
  }
  static wchar_t ouverture[MAX_CHEMIN];
  swprintf(ouverture, MAX_CHEMIN, L"%ls\\ouverture", base);
  CreateDirectoryW(ouverture, NULL);
  nettoyer(ouverture);
  swprintf(page, MAX_CHEMIN, L"%ls\\Projet-%lu-%lu.html", ouverture, GetCurrentProcessId(), GetTickCount());
  HANDLE h = CreateFileW(page, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  BOOL ok = h != INVALID_HANDLE_VALUE;
  if (ok) {
    DWORD avant = 0;
    for (DWORD i = 0; i + 14 <= tailleAppli && i < 4096 && !avant; i++)
      if (!memcmp(html + i, "<meta charset=", 14))
        for (DWORD k = i; k < tailleAppli && k < i + 64; k++) if (html[k] == '>') { avant = k + 1; break; }
    const char *debut = "\n<script type=\"application/octet-stream\" id=\"diapo-projet\">";
    ok = ecrire(h, html, avant) && ecrire(h, debut, (DWORD)strlen(debut)) && ecrireBase64(h, donnees, tailleProjet)
      && ecrire(h, "</script>\n", 10) && ecrire(h, html + avant, tailleAppli - avant);
    CloseHandle(h);
    if (!ok) { DeleteFileW(page); message(L"Impossible de préparer l'ouverture du projet (disque plein ?)."); }
  } else message(L"Impossible de préparer l'ouverture du projet (dossier temporaire inaccessible).");
  HeapFree(GetProcessHeap(), 0, html);
  HeapFree(GetProcessHeap(), 0, donnees);
  return ok;
}

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE prec, PWSTR ligne, int affichage) {
  (void)inst; (void)prec; (void)ligne; (void)affichage;
  int argc = 0;
  LPWSTR *argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  static wchar_t dossier[MAX_CHEMIN], appli[MAX_CHEMIN], page[MAX_CHEMIN], base[MAX_CHEMIN], profil[MAX_CHEMIN],
    adresse[MAX_CHEMIN * 3], edge[MAX_CHEMIN], commande[MAX_CHEMIN * 5];
  dossierDuProgramme(dossier);
  swprintf(appli, MAX_CHEMIN, L"%ls\\StudioDiaporama.html", dossier);
  if (GetFileAttributesW(appli) == INVALID_FILE_ATTRIBUTES) { message(L"Fichier StudioDiaporama.html introuvable : réinstallez Studio Diaporama."); return 1; }
  ExpandEnvironmentStringsW(L"%LOCALAPPDATA%\\StudioDiaporama", base, MAX_CHEMIN);
  CreateDirectoryW(base, NULL);
  swprintf(profil, MAX_CHEMIN, L"%ls\\Edge", base);
  wcscpy(page, appli);
  if (argc > 1 && !preparerOuverture(appli, base, argv[1], page)) return 1;

  adresseFichier(page, adresse);
  cheminEdge(edge);
  if (edge[0]) {
    /* Profil Edge dédié : fenêtre indépendante du navigateur, taille et autorisations mémorisées */
    swprintf(commande, MAX_CHEMIN * 5, L"\"%ls\" --app=\"%ls\" --user-data-dir=\"%ls\" --autoplay-policy=no-user-gesture-required --no-first-run --no-default-browser-check",
      edge, adresse, profil);
    STARTUPINFOW si = { .cb = sizeof(si) };
    PROCESS_INFORMATION pi;
    if (CreateProcessW(NULL, commande, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
      CloseHandle(pi.hThread);
      CloseHandle(pi.hProcess);
      return 0;
    }
  }
  /* Sans Edge : navigateur par défaut */
  if ((INT_PTR)ShellExecuteW(NULL, L"open", page, NULL, NULL, SW_SHOWNORMAL) <= 32) {
    message(L"Aucun navigateur trouvé pour ouvrir Studio Diaporama (Microsoft Edge conseillé).");
    return 1;
  }
  return 0;
}
