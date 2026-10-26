// kofservico: o serviço de rede do KOFstation no PC (Linux e Windows). O lançador abre junto com o navegador.
//   - anuncia o PC na rede de casa (UDP 8650: "KOFR?<app>" -> "KOFR!{json}")
//   - aceita aparelhos (TCP 8650): pareamento por código de 6 números ou QR, e conexão cifrada dos já pareados
//   - conversa com a página por WebSocket em 127.0.0.1:8644 (JSON; ver rede/PROTOCOLO.md)
//   - repassa mensagens por "canal" entre a página e os aparelhos (sincronizar, transmitir jogo...)
// Não sabe nada de jogo: o protocolo fica no kofrede.c, o resto é rede e arquivo. Opções:
//   kofservico [--pasta DIR] [--nome NOME] [--porta 8650] [--udp 8650] [--ws 8644] [--achar 255.255.255.255]
#define _GNU_SOURCE
#define _CRT_RAND_S
#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <direct.h>
#include <shellapi.h>
#define MSG_NOSIGNAL 0
#define fecharSock closesocket
#define strncasecmp _strnicmp
static wchar_t *largo(const char *u) { static wchar_t w[4][1200]; static int v; v = (v + 1) & 3; MultiByteToWideChar(CP_UTF8, 0, u, -1, w[v], 1200); return w[v]; }
#else
#include <arpa/inet.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#include <sys/time.h>
#define fecharSock close
#endif
#include <ctype.h>
#include <errno.h>
#include <pthread.h>
#include <signal.h>
#include <stdarg.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <time.h>
#include <unistd.h>
#include "kofrede.h"
#ifdef _WIN32
#define mkdir(c, m) _wmkdir(largo(c))
#define fopen(c, m) _wfopen(largo(c), largo(m))
#endif

#define APP "kofstation"
#define VERSAO 1
#define MAXPARES 32
static int portaTcp = 8650, portaUdp = 8650, portaWs = 8644, visivel = 1;
static char pasta[1024], nome[64], alvoAchar[64] = "255.255.255.255";
static uint8_t sk[32], pk[32];
static char meuId[17];
static pthread_mutex_t trava = PTHREAD_MUTEX_INITIALIZER;
static long long agora(void) { return (long long)time(NULL); }
static void soltar(void *(*f)(void *), void *a) { pthread_t t; if (!pthread_create(&t, NULL, f, a)) pthread_detach(t); }
static void aviso(const char *f, ...) { va_list a; va_start(a, f); fprintf(stderr, "[kofservico] "); vfprintf(stderr, f, a); fputc('\n', stderr); va_end(a); }

static void aleatorio(uint8_t *b, size_t n) {
#ifdef _WIN32
    for (size_t i = 0; i < n; i += 4) { unsigned v; rand_s(&v); for (size_t j = 0; j < 4 && i + j < n; j++) b[i + j] = (uint8_t)(v >> (8 * j)); }
#else
    FILE *f = fopen("/dev/urandom", "rb");
    if (!f || fread(b, 1, n, f) != n) { aviso("sem /dev/urandom"); exit(1); }
    fclose(f);
#endif
}
static void hex(char *o, const uint8_t *b, int n) { for (int i = 0; i < n; i++) sprintf(o + 2 * i, "%02x", b[i]); o[2 * n] = 0; }
static int dehex(uint8_t *b, const char *s, int n) {
    for (int i = 0; i < n; i++) { unsigned v; if (sscanf(s + 2 * i, "%2x", &v) != 1) return -1; b[i] = (uint8_t)v; }
    return 0;
}

// ---------------------------------------------------------------- texto/JSON
typedef struct { char *b; size_t n, cap; } Txt;
static void tx(Txt *t, const char *f, ...) {
    va_list a; va_start(a, f); int k = vsnprintf(NULL, 0, f, a); va_end(a);
    if (t->n + k + 1 > t->cap) { t->cap = (t->n + k + 1) * 2; t->b = realloc(t->b, t->cap); }
    va_start(a, f); vsnprintf(t->b + t->n, k + 1, f, a); va_end(a); t->n += k;
}
static void txs(Txt *t, const char *s, size_t n) {   // string JSON com aspas
    tx(t, "\"");
    for (size_t i = 0; i < n; i++) {
        unsigned char c = (unsigned char)s[i];
        if (c == '"' || c == '\\') tx(t, "\\%c", c);
        else if (c == '\n') tx(t, "\\n");
        else if (c < 0x20) tx(t, "\\u%04x", c);
        else { char d[2] = {(char)c, 0}; tx(t, "%s", d); }
    }
    tx(t, "\"");
}
static void utf8(Txt *t, unsigned u) {
    char o[5] = {0};
    if (u < 0x80) o[0] = (char)u;
    else if (u < 0x800) { o[0] = (char)(0xC0 | u >> 6); o[1] = (char)(0x80 | (u & 63)); }
    else if (u < 0x10000) { o[0] = (char)(0xE0 | u >> 12); o[1] = (char)(0x80 | (u >> 6 & 63)); o[2] = (char)(0x80 | (u & 63)); }
    else { o[0] = (char)(0xF0 | u >> 18); o[1] = (char)(0x80 | (u >> 12 & 63)); o[2] = (char)(0x80 | (u >> 6 & 63)); o[3] = (char)(0x80 | (u & 63)); }
    tx(t, "%s", o);
}
// valor de um campo do objeto JSON (string sem as aspas, ou o número/true/false como está). malloc; NULL se não tem
static char *jget(const char *j, const char *k, size_t *nout) {
    size_t nk = strlen(k);
    for (const char *p = j; (p = strchr(p, '"')); p++) {
        if (p > j && p[-1] != '{' && p[-1] != ',' && p[-1] != ' ' && p[-1] != '\n') continue;
        if (strncmp(p + 1, k, nk) || p[1 + nk] != '"') continue;
        const char *v = p + 2 + nk; while (*v == ' ') v++;
        if (*v != ':') continue;
        v++; while (*v == ' ') v++;
        Txt t = {0}; tx(&t, "");
        if (*v != '"') { while (*v && *v != ',' && *v != '}' && *v != ' ') { char d[2] = {*v++, 0}; tx(&t, "%s", d); } }
        else for (v++; *v && *v != '"'; v++) {
            if (*v != '\\') { char d[2] = {*v, 0}; tx(&t, "%s", d); continue; }
            v++;
            if (*v == 'n') tx(&t, "\n"); else if (*v == 't') tx(&t, "\t"); else if (*v == 'r') tx(&t, "\r");
            else if (*v == 'b') tx(&t, "\b"); else if (*v == 'f') tx(&t, "\f");
            else if (*v == 'u') {
                unsigned u = 0; sscanf(v + 1, "%4x", &u); v += 4;
                if (u >= 0xD800 && u < 0xDC00 && v[1] == '\\' && v[2] == 'u') { unsigned b = 0; sscanf(v + 3, "%4x", &b); v += 6; u = 0x10000 + ((u - 0xD800) << 10) + (b - 0xDC00); }
                utf8(&t, u);
            } else if (*v) { char d[2] = {*v, 0}; tx(&t, "%s", d); }
            else break;
        }
        if (nout) *nout = t.n;
        return t.b;
    }
    return NULL;
}

// ---------------------------------------------------------------- sockets
static int lerTudo(int s, void *b, size_t n) { uint8_t *p = b; while (n) { ssize_t r = recv(s, (char *)p, n, 0); if (r <= 0) return -1; p += r; n -= r; } return 0; }
static int tudo(int s, const void *b, size_t n) { const uint8_t *p = b; while (n) { ssize_t r = send(s, (const char *)p, n, MSG_NOSIGNAL); if (r <= 0) return -1; p += r; n -= r; } return 0; }
static void prazo(int s, int ms) {
#ifdef _WIN32
    DWORD t = ms; setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, (const char *)&t, sizeof t);
#else
    struct timeval t = {ms / 1000, (ms % 1000) * 1000}; setsockopt(s, SOL_SOCKET, SO_RCVTIMEO, &t, sizeof t);
#endif
}
static void semAtraso(int s) { int um = 1; setsockopt(s, IPPROTO_TCP, TCP_NODELAY, (const char *)&um, sizeof um); }
// quadro na rede: u32 (big endian) com o tamanho + corpo
static uint8_t *lerQuadro(int s, size_t *n) {
    uint8_t c[4]; if (lerTudo(s, c, 4)) return NULL;
    uint32_t len = (uint32_t)c[0] << 24 | c[1] << 16 | c[2] << 8 | c[3];
    if (len > KR_MAX + 512) return NULL;
    uint8_t *d = malloc(len + 1); if (lerTudo(s, d, len)) { free(d); return NULL; }
    d[len] = 0; *n = len; return d;
}
static int mandarQuadro(int s, const void *a, size_t na, const void *b, size_t nb) {
    size_t n = na + nb; uint8_t *q = malloc(n + 4);
    q[0] = (uint8_t)(n >> 24); q[1] = (uint8_t)(n >> 16); q[2] = (uint8_t)(n >> 8); q[3] = (uint8_t)n;
    memcpy(q + 4, a, na); if (nb) memcpy(q + 4 + na, b, nb);
    int r = tudo(s, q, n + 4); free(q); return r;
}
static int privado(uint32_t ip) {   // só rede de casa (e a própria máquina, pros testes)
    return (ip >> 24) == 10 || (ip >> 24) == 127 || (ip >> 20) == 0xAC1 || (ip >> 16) == 0xC0A8 || (ip >> 16) == 0xA9FE;
}
static void meuIp(char *o, size_t n) {   // o endereço que a máquina usaria pra sair (nada é enviado)
    snprintf(o, n, "127.0.0.1");
    int s = (int)socket(AF_INET, SOCK_DGRAM, 0); if (s < 0) return;
    struct sockaddr_in a = {0}; a.sin_family = AF_INET; a.sin_port = htons(53); inet_pton(AF_INET, "192.168.0.1", &a.sin_addr);
    socklen_t na = sizeof a;
    if (!connect(s, (void *)&a, sizeof a) && !getsockname(s, (void *)&a, &na)) inet_ntop(AF_INET, &a.sin_addr, o, (socklen_t)n);
    fecharSock(s);
}

// ---------------------------------------------------------------- página (WebSocket local, um cliente)
static int pagina = -1;
static pthread_mutex_t envPag = PTHREAD_MUTEX_INITIALIZER;
static void sha1(const uint8_t *d, size_t n, uint8_t out[20]) {
    uint32_t h[5] = {0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0};
    size_t total = ((n + 8) / 64 + 1) * 64; uint8_t *m = calloc(total, 1);
    memcpy(m, d, n); m[n] = 0x80; uint64_t bits = (uint64_t)n * 8;
    for (int i = 0; i < 8; i++) m[total - 1 - i] = (uint8_t)(bits >> (8 * i));
    for (size_t b = 0; b < total; b += 64) {
        uint32_t w[80];
        for (int i = 0; i < 16; i++) w[i] = (uint32_t)m[b + 4 * i] << 24 | m[b + 4 * i + 1] << 16 | m[b + 4 * i + 2] << 8 | m[b + 4 * i + 3];
        for (int i = 16; i < 80; i++) { uint32_t x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = x << 1 | x >> 31; }
        uint32_t a = h[0], bb = h[1], c = h[2], dd = h[3], e = h[4];
        for (int i = 0; i < 80; i++) {
            uint32_t f, k;
            if (i < 20) { f = (bb & c) | (~bb & dd); k = 0x5A827999; } else if (i < 40) { f = bb ^ c ^ dd; k = 0x6ED9EBA1; }
            else if (i < 60) { f = (bb & c) | (bb & dd) | (c & dd); k = 0x8F1BBCDC; } else { f = bb ^ c ^ dd; k = 0xCA62C1D6; }
            uint32_t t = (a << 5 | a >> 27) + f + e + k + w[i]; e = dd; dd = c; c = bb << 30 | bb >> 2; bb = a; a = t;
        }
        h[0] += a; h[1] += bb; h[2] += c; h[3] += dd; h[4] += e;
    }
    free(m);
    for (int i = 0; i < 20; i++) out[i] = (uint8_t)(h[i / 4] >> (24 - 8 * (i % 4)));
}
static void base64(const uint8_t *d, int n, char *out) {
    static const char t[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"; int o = 0;
    for (int i = 0; i < n; i += 3) {
        uint32_t v = d[i] << 16 | (i + 1 < n ? d[i + 1] << 8 : 0) | (i + 2 < n ? d[i + 2] : 0);
        out[o++] = t[v >> 18 & 63]; out[o++] = t[v >> 12 & 63]; out[o++] = i + 1 < n ? t[v >> 6 & 63] : '='; out[o++] = i + 2 < n ? t[v & 63] : '=';
    }
    out[o] = 0;
}
static void paraPagina(const char *json) {
    size_t n = strlen(json); uint8_t cab[10]; int nc = 2; cab[0] = 0x81;
    if (n < 126) cab[1] = (uint8_t)n;
    else if (n < 65536) { cab[1] = 126; cab[2] = (uint8_t)(n >> 8); cab[3] = (uint8_t)n; nc = 4; }
    else { cab[1] = 127; for (int i = 0; i < 8; i++) cab[2 + i] = (uint8_t)((uint64_t)n >> (56 - 8 * i)); nc = 10; }
    pthread_mutex_lock(&envPag);
    if (pagina >= 0 && (tudo(pagina, cab, nc) || tudo(pagina, json, n))) { fecharSock(pagina); pagina = -1; }
    pthread_mutex_unlock(&envPag);
}
static void paraPaginaTxt(Txt *t) { if (t->b) paraPagina(t->b); free(t->b); t->b = NULL; t->n = t->cap = 0; }

// ---------------------------------------------------------------- aparelhos pareados
typedef struct Con { int sock, ref, morta; kr_canal can; pthread_mutex_t env; long long ultimo; } Con;
typedef struct { uint8_t pk[32]; char id[17], nome[64], tipo[16], ip[48]; int porta; long long visto; Con *con; int tentando; } Par;
static Par pares[MAXPARES];
static int npares;

static void limpar(char *s) {   // sem tab/linha nova, e sem letra cortada no meio (o WebSocket só aceita UTF-8 inteiro)
    char *ini = s; for (; *s; s++) if (*s == '\t' || *s == '\n' || *s == '\r') *s = ' ';
    char *u = s; while (u > ini && (u[-1] & 0xC0) == 0x80) u--;
    if (u > ini && (u[-1] & 0x80)) { unsigned char c = (unsigned char)u[-1]; int precisa = c >= 0xF0 ? 3 : c >= 0xE0 ? 2 : c >= 0xC0 ? 1 : 0; if (s - u != precisa) u[-1] = 0; }
}
static void caminho(char *o, size_t n, const char *arq) { snprintf(o, n, "%s/%s", pasta, arq); }
static void gravarPares(void) {   // com a trava
    char c[1200], tmp[1210]; caminho(c, sizeof c, "pareados.txt"); snprintf(tmp, sizeof tmp, "%s.novo", c);
    FILE *f = fopen(tmp, "w"); if (!f) return;
    for (int i = 0; i < npares; i++) { char h[65]; hex(h, pares[i].pk, 32); fprintf(f, "%s\t%s\t%s\t%lld\t%s\t%d\n", h, pares[i].tipo, pares[i].nome, pares[i].visto, pares[i].ip, pares[i].porta); }
    fclose(f);
#ifdef _WIN32
    MoveFileExW(largo(tmp), largo(c), MOVEFILE_REPLACE_EXISTING);
#else
    rename(tmp, c);
#endif
}
static void lerPares(void) {
    char c[1200], l[512]; caminho(c, sizeof c, "pareados.txt");
    FILE *f = fopen(c, "r"); if (!f) return;
    while (npares < MAXPARES && fgets(l, sizeof l, f)) {
        Par *p = &pares[npares]; memset(p, 0, sizeof *p);
        char *campo[6] = {0}; int nc = 0; char *s = l;
        l[strcspn(l, "\n")] = 0;
        while (nc < 6) { campo[nc++] = s; s = strchr(s, '\t'); if (!s) break; *s++ = 0; }
        if (nc < 3 || strlen(campo[0]) != 64 || dehex(p->pk, campo[0], 32)) continue;
        kr_id(p->id, p->pk);
        snprintf(p->tipo, sizeof p->tipo, "%s", campo[1]); snprintf(p->nome, sizeof p->nome, "%s", campo[2]);
        if (nc > 3) p->visto = atoll(campo[3]);
        if (nc > 4) snprintf(p->ip, sizeof p->ip, "%s", campo[4]);
        if (nc > 5) p->porta = atoi(campo[5]);
        npares++;
    }
    fclose(f);
}
static Par *acharPk(const uint8_t k[32]) { for (int i = 0; i < npares; i++) if (!memcmp(pares[i].pk, k, 32)) return &pares[i]; return NULL; }
static Par *acharId(const char *id) { for (int i = 0; i < npares; i++) if (!strcmp(pares[i].id, id)) return &pares[i]; return NULL; }

static void gravarConfig(void) {
    char c[1200]; caminho(c, sizeof c, "config.txt"); FILE *f = fopen(c, "w"); if (!f) return;
    fprintf(f, "nome=%s\nvisivel=%d\n", nome, visivel); fclose(f);
}
static void lerConfig(void) {
    char c[1200], l[256]; caminho(c, sizeof c, "config.txt"); FILE *f = fopen(c, "r"); if (!f) return;
    while (fgets(l, sizeof l, f)) {
        l[strcspn(l, "\r\n")] = 0;
        if (!strncmp(l, "nome=", 5) && l[5]) snprintf(nome, sizeof nome, "%s", l + 5);
        if (!strncmp(l, "visivel=", 8)) visivel = atoi(l + 8);
    }
    fclose(f);
}
static void identidade(void) {
    char c[1200]; caminho(c, sizeof c, "identidade.bin");
    FILE *f = fopen(c, "rb");
    if (!f || fread(sk, 1, 32, f) != 32) {
        if (f) fclose(f);
        aleatorio(sk, 32); f = fopen(c, "wb");
        if (!f || fwrite(sk, 1, 32, f) != 32) { aviso("não consegui gravar %s", c); exit(1); }
#ifndef _WIN32
        chmod(c, 0600);
#endif
    }
    fclose(f);
    kr_publica(pk, sk); kr_id(meuId, pk);
}

static void listaJson(Txt *t) {   // com a trava
    tx(t, "{\"t\":\"lista\",\"eu\":{\"id\":\"%s\",\"nome\":", meuId); txs(t, nome, strlen(nome));
    tx(t, ",\"visivel\":%s},\"aparelhos\":[", visivel ? "true" : "false");
    for (int i = 0; i < npares; i++) {
        Par *p = &pares[i];
        tx(t, "%s{\"id\":\"%s\",\"nome\":", i ? "," : "", p->id); txs(t, p->nome, strlen(p->nome));
        tx(t, ",\"tipo\":"); txs(t, p->tipo, strlen(p->tipo));
        tx(t, ",\"online\":%s,\"visto\":%lld,\"ip\":\"%s\"}", p->con && !p->con->morta ? "true" : "false", p->visto, p->ip);
    }
    tx(t, "]}");
}
static void avisarLista(void) { Txt t = {0}; pthread_mutex_lock(&trava); listaJson(&t); pthread_mutex_unlock(&trava); paraPaginaTxt(&t); }

// mensagem cifrada: canal_len(1) | canal | dados
static int mandarCon(Con *c, const char *canal, const void *d, size_t n) {
    size_t nc = strlen(canal); if (nc > 255 || n + nc + 1 > KR_MAX) return -1;
    uint8_t *p = malloc(1 + nc + n), *q = malloc(1 + nc + n + KR_MAC);
    p[0] = (uint8_t)nc; memcpy(p + 1, canal, nc); if (n) memcpy(p + 1 + nc, d, n);
    pthread_mutex_lock(&c->env);
    kr_cifrar(&c->can, q, p, 1 + nc + n);
    int r = mandarQuadro(c->sock, q, 1 + nc + n + KR_MAC, NULL, 0);
    pthread_mutex_unlock(&c->env);
    free(p); free(q); return r;
}
static Con *pegarCon(Par *p) { Con *c = p->con; if (c && !c->morta) c->ref++; else c = NULL; return c; }   // com a trava
static void soltarCon(Con *c) { pthread_mutex_lock(&trava); int fim = --c->ref == 0; pthread_mutex_unlock(&trava); if (fim) { pthread_mutex_destroy(&c->env); free(c); } }

// a conexão de um pareado já autenticada: lê até cair. Serve pro lado servidor e pro cliente
static void laco(Par *p0, int s, kr_canal *can) {
    Con *c = calloc(1, sizeof *c); c->sock = s; c->can = *can; c->ref = 1; c->ultimo = agora(); pthread_mutex_init(&c->env, NULL);
    pthread_mutex_lock(&trava);
    Par *p = p0; Con *velha = p->con;
    if (velha) { velha->morta = 1; shutdown(velha->sock, 2); }
    p->con = c; c->ref++; p->visto = agora(); gravarPares();
    char id[17]; memcpy(id, p->id, 17);
    pthread_mutex_unlock(&trava);
    aviso("conectado: %s", id);
    avisarLista();
    prazo(s, 0);
    for (;;) {
        size_t n; uint8_t *q = lerQuadro(s, &n); if (!q) break;
        if (n < KR_MAC + 1) { free(q); break; }
        uint8_t *m = malloc(n);
        if (kr_decifrar(&c->can, m, q, n)) { free(q); free(m); aviso("mensagem adulterada de %s", id); break; }
        free(q); n -= KR_MAC; m[n] = 0;
        c->ultimo = agora();
        size_t nc = m[0]; if (1 + nc > n) { free(m); break; }
        char canal[256]; memcpy(canal, m + 1, nc); canal[nc] = 0;
        const char *d = (char *)m + 1 + nc; size_t nd = n - 1 - nc;
        if (!nc) { if (nd == 1 && d[0] == 'p') mandarCon(c, "", "P", 1); free(m); continue; }   // canal de controle: ping
        Txt t = {0}; tx(&t, "{\"t\":\"msg\",\"de\":\"%s\",\"canal\":", id); txs(&t, canal, nc); tx(&t, ",\"dados\":"); txs(&t, d, nd); tx(&t, "}");
        paraPaginaTxt(&t); free(m);
    }
    pthread_mutex_lock(&trava);
    c->morta = 1; if (p->con == c) { p->con = NULL; c->ref--; p->visto = agora(); gravarPares(); }
    pthread_mutex_unlock(&trava);
    shutdown(s, 2); fecharSock(s); soltarCon(c);
    aviso("desconectado: %s", id);
    avisarLista();
}

// ---------------------------------------------------------------- pareamento (janela aberta pela página)
static char parCodigo[7], parSegredo[33];
static long long parAte;
static int parFalhas;
static void fecharJanela(const char *motivo) {
    pthread_mutex_lock(&trava); int estava = parAte != 0; parAte = 0; pthread_mutex_unlock(&trava);
    if (estava && motivo) { Txt t = {0}; tx(&t, "{\"t\":\"parear-fim\",\"motivo\":"); txs(&t, motivo, strlen(motivo)); tx(&t, "}"); paraPaginaTxt(&t); }
}
static void urlenc(Txt *t, const char *s) { for (; *s; s++) { unsigned char c = (unsigned char)*s; if (isalnum(c) || c == '-' || c == '_' || c == '.') tx(t, "%c", c); else tx(t, "%%%02X", c); } }
static void abrirJanela(void) {
    uint8_t r[20]; aleatorio(r, 20);
    pthread_mutex_lock(&trava);
    snprintf(parCodigo, sizeof parCodigo, "%06u", (unsigned)((r[0] | r[1] << 8 | (uint32_t)r[2] << 16 | (uint32_t)r[3] << 24) % 1000000u));
    hex(parSegredo, r + 4, 16);
    parAte = agora() + 120; parFalhas = 0;
    pthread_mutex_unlock(&trava);
    char ip[64]; meuIp(ip, sizeof ip);
    Txt t = {0}; tx(&t, "{\"t\":\"parear\",\"codigo\":\"%s\",\"seg\":120,\"ip\":\"%s\",\"porta\":%d,\"qr\":\"%s://parear?ip=%s&p=%d&id=%s&s=%s&n=", parCodigo, ip, portaTcp, APP, ip, portaTcp, meuId, parSegredo);
    urlenc(&t, nome); tx(&t, "\"}");
    paraPaginaTxt(&t);
}
// o que cada lado conta de si depois de parear: pk(32) | porta(2) | tipo_len(1) | tipo | nome
static size_t minhaFicha(uint8_t *o, const char *tipo) {
    size_t nt = strlen(tipo), nn = strlen(nome);
    memcpy(o, pk, 32); o[32] = (uint8_t)(portaTcp >> 8); o[33] = (uint8_t)portaTcp; o[34] = (uint8_t)nt;
    memcpy(o + 35, tipo, nt); memcpy(o + 35 + nt, nome, nn); return 35 + nt + nn;
}
// guarda o aparelho da ficha (com a trava). NULL = ficha inválida ou lista cheia
static Par *guardarFicha(const uint8_t *f, size_t n, const char *ip) {
    if (n < 35 || 35 + (size_t)f[34] > n) return NULL;
    Par *p = acharPk(f);
    if (!p) { if (npares >= MAXPARES) return NULL; p = &pares[npares++]; memset(p, 0, sizeof *p); memcpy(p->pk, f, 32); kr_id(p->id, p->pk); }
    p->porta = f[32] << 8 | f[33];
    size_t nt = f[34] < 15 ? f[34] : 15; memcpy(p->tipo, f + 35, nt); p->tipo[nt] = 0;
    size_t nn = n - 35 - f[34]; if (nn > 63) nn = 63; memcpy(p->nome, f + 35 + f[34], nn); p->nome[nn] = 0;
    limpar(p->nome); limpar(p->tipo);
    snprintf(p->ip, sizeof p->ip, "%s", ip); p->visto = agora();
    gravarPares();
    return p;
}
static void avisarPareado(Par *p) {
    Txt t = {0};
    pthread_mutex_lock(&trava);
    tx(&t, "{\"t\":\"pareado\",\"aparelho\":{\"id\":\"%s\",\"nome\":", p->id); txs(&t, p->nome, strlen(p->nome));
    tx(&t, ",\"tipo\":"); txs(&t, p->tipo, strlen(p->tipo)); tx(&t, "}}");
    pthread_mutex_unlock(&trava);
    paraPaginaTxt(&t); avisarLista();
}
static void erroPagina(const char *t0, const char *texto) { Txt t = {0}; tx(&t, "{\"t\":\"%s\",\"texto\":", t0); txs(&t, texto, strlen(texto)); tx(&t, "}"); paraPaginaTxt(&t); }

// ---------------------------------------------------------------- lado servidor (TCP 8650)
typedef struct { int s; char ip[48]; } Chegada;
static void recusar(int s, const char *t) { uint8_t x = 'X'; mandarQuadro(s, &x, 1, t, strlen(t)); }
static void *atender(void *a) {
    Chegada ch = *(Chegada *)a; free(a);
    int s = ch.s; size_t n; uint8_t *h = NULL, *q = NULL;
    prazo(s, 10000); semAtraso(s);
    h = lerQuadro(s, &n);
    size_t na = h && n >= 8 ? h[7] : 0;
    if (!h || n < 8 + na || memcmp(h, "KOFR", 4) || h[4] != VERSAO || h[0] != 'K') goto fim;
    if (na != strlen(APP) || memcmp(h + 8, APP, na)) { recusar(s, "outro app"); goto fim; }
    uint8_t *corpo = h + 8 + na; size_t nc = n - 8 - na;
    if (h[5] == 'P' && nc == 49) {   // pareamento: corpo = modo('c'|'q') | msg1
        char senha[40];
        pthread_mutex_lock(&trava);
        int aberta = parAte && agora() < parAte;
        snprintf(senha, sizeof senha, "%s", corpo[0] == 'q' ? parSegredo : parCodigo);
        pthread_mutex_unlock(&trava);
        if (!aberta) { recusar(s, "o pareamento não está aberto no PC"); goto fim; }
        kr_par par; kr_canal can; uint8_t r[32], m2[49]; aleatorio(r, 32);
        m2[0] = 'R';
        if (kr_par_servidor(&par, APP, senha, corpo + 1, r, m2 + 1)) goto fim;
        if (mandarQuadro(s, m2, 49, NULL, 0)) goto fim;
        q = lerQuadro(s, &n);
        if (!q || n != 17 || q[0] != 'F' || kr_par_servidor2(&par, APP, q + 1, &can)) {
            pthread_mutex_lock(&trava); int f = ++parFalhas; pthread_mutex_unlock(&trava);
            aviso("pareamento com senha errada (%d)", f);
            if (f >= 5) fecharJanela("muitas tentativas erradas: gere outro código");
            goto fim;
        }
        free(q); q = lerQuadro(s, &n);   // ficha do aparelho, cifrada
        uint8_t ficha[400];
        if (!q || n < KR_MAC + 36 || n > sizeof ficha || kr_decifrar(&can, ficha, q, n)) goto fim;
        size_t nf = n - KR_MAC;
        if (ficha[0] != 3 || memcmp(ficha + 1, "par", 3)) goto fim;
        pthread_mutex_lock(&trava); Par *p = guardarFicha(ficha + 4, nf - 4, ch.ip); pthread_mutex_unlock(&trava);
        if (!p) { recusar(s, "lista de aparelhos cheia"); goto fim; }
        uint8_t minha[200], cif[260]; minha[0] = 3; memcpy(minha + 1, "par", 3);
        size_t nm = 4 + minhaFicha(minha + 4, "pc");
        kr_cifrar(&can, cif, minha, nm); mandarQuadro(s, cif, nm + KR_MAC, NULL, 0);
        aviso("pareado: %s (%s)", p->nome, p->id);
        fecharJanela(NULL); avisarPareado(p);
        goto fim;
    }
    if (h[5] == 'C' && nc == 64) {   // conexão de um pareado
        pthread_mutex_lock(&trava); Par *p = acharPk(corpo); pthread_mutex_unlock(&trava);
        if (!p) { recusar(s, "aparelho não pareado com este PC"); goto fim; }
        kr_con con; kr_canal can; uint8_t r[32], m2[49]; aleatorio(r, 32);
        m2[0] = 'R';
        if (kr_con_servidor(&con, APP, sk, corpo, r, m2 + 1, &can) || mandarQuadro(s, m2, 49, NULL, 0)) goto fim;
        q = lerQuadro(s, &n);
        if (!q || n != 17 || q[0] != 'F' || kr_con_servidor2(&con, q + 1)) goto fim;
        free(h); free(q);
        pthread_mutex_lock(&trava); snprintf(p->ip, sizeof p->ip, "%s", ch.ip); pthread_mutex_unlock(&trava);
        laco(p, s, &can);
        return NULL;
    }
fim:
    free(h); free(q); fecharSock(s);
    return NULL;
}
static void *servidorTcp(void *x) {
    (void)x;
    int s = (int)socket(AF_INET, SOCK_STREAM, 0);
#ifndef _WIN32
    int um = 1; setsockopt(s, SOL_SOCKET, SO_REUSEADDR, (const char *)&um, sizeof um);   // reabrir logo depois de fechar (TIME_WAIT)
#endif
    struct sockaddr_in a = {0}; a.sin_family = AF_INET; a.sin_addr.s_addr = htonl(INADDR_ANY);
    int ok = 0;
    for (int tent = 0; tent < 10 && !ok; tent++) { a.sin_port = htons(portaTcp); if (!bind(s, (void *)&a, sizeof a)) ok = 1; else portaTcp++; }
    if (!ok || listen(s, 8)) { aviso("sem porta TCP livre"); exit(2); }
    aviso("aparelhos na porta %d", portaTcp);
    for (;;) {
        struct sockaddr_in de; socklen_t nd = sizeof de;
        int c = (int)accept(s, (void *)&de, &nd); if (c < 0) continue;
        if (!privado(ntohl(de.sin_addr.s_addr))) { fecharSock(c); continue; }
        Chegada *ch = malloc(sizeof *ch); ch->s = c; inet_ntop(AF_INET, &de.sin_addr, ch->ip, sizeof ch->ip);
        soltar(atender, ch);
    }
    return NULL;
}

// ---------------------------------------------------------------- lado cliente (PC com PC; e os testes)
static int conectarTcp(const char *ip, int porta) {
    int s = (int)socket(AF_INET, SOCK_STREAM, 0);
    struct sockaddr_in a = {0}; a.sin_family = AF_INET; a.sin_port = htons(porta);
    if (inet_pton(AF_INET, ip, &a.sin_addr) != 1 || connect(s, (void *)&a, sizeof a)) { fecharSock(s); return -1; }
    semAtraso(s); prazo(s, 10000); return s;
}
static int ola(int s, char modo, const void *corpo, size_t n) {
    uint8_t h[64]; size_t na = strlen(APP);
    memcpy(h, "KOFR", 4); h[4] = VERSAO; h[5] = modo; h[6] = 0; h[7] = (uint8_t)na; memcpy(h + 8, APP, na);
    return mandarQuadro(s, h, 8 + na, corpo, n);
}
static char *respostaErro(uint8_t *q, size_t n) { static char e[200]; snprintf(e, sizeof e, "%.*s", (int)(n - 1), q + 1); return e; }
typedef struct { char ip[48], senha[40]; int porta; char modo; } PedidoPar;
static void *parearCom(void *a) {
    PedidoPar pp = *(PedidoPar *)a; free(a);
    const char *erro = "não consegui falar com o aparelho";
    uint8_t *q = NULL; size_t n;
    int s = conectarTcp(pp.ip, pp.porta); if (s < 0) goto falhou;
    kr_par par; kr_canal can; uint8_t sid[16], r[32], m1[49], m3[17];
    aleatorio(sid, 16); aleatorio(r, 32); m1[0] = (uint8_t)pp.modo;
    kr_par_cliente(&par, APP, pp.senha, sid, r, m1 + 1);
    if (ola(s, 'P', m1, 49) || !(q = lerQuadro(s, &n))) goto falhou;
    if (q[0] == 'X') { erro = respostaErro(q, n); goto falhou; }
    m3[0] = 'F';
    if (n != 49 || q[0] != 'R' || kr_par_cliente2(&par, APP, q + 1, m3 + 1, &can)) { erro = "código errado"; goto falhou; }
    mandarQuadro(s, m3, 17, NULL, 0);
    uint8_t minha[200], cif[260], ficha[400]; minha[0] = 3; memcpy(minha + 1, "par", 3);
    size_t nm = 4 + minhaFicha(minha + 4, "pc");
    kr_cifrar(&can, cif, minha, nm); mandarQuadro(s, cif, nm + KR_MAC, NULL, 0);
    free(q); q = lerQuadro(s, &n);
    if (!q || n < KR_MAC + 36 || n > sizeof ficha || kr_decifrar(&can, ficha, q, n) || ficha[0] != 3) { erro = "código errado"; goto falhou; }
    pthread_mutex_lock(&trava); Par *p = guardarFicha(ficha + 4, n - KR_MAC - 4, pp.ip); pthread_mutex_unlock(&trava);
    free(q); fecharSock(s);
    if (!p) { erroPagina("par-erro", "lista de aparelhos cheia"); return NULL; }
    avisarPareado(p);
    return NULL;
falhou:
    free(q); if (s >= 0) fecharSock(s);
    erroPagina("par-erro", erro);
    return NULL;
}
static void *conectarPar(void *a) {
    Par *p = a; char ip[48]; int porta; uint8_t pks[32];
    pthread_mutex_lock(&trava); snprintf(ip, sizeof ip, "%s", p->ip); porta = p->porta; memcpy(pks, p->pk, 32); pthread_mutex_unlock(&trava);
    uint8_t *q = NULL; size_t n;
    int s = conectarTcp(ip, porta);
    if (s >= 0) {
        kr_con con; kr_canal can; uint8_t r[32], m1[64], m3[17]; aleatorio(r, 32);
        kr_con_cliente(&con, sk, r, m1); m3[0] = 'F';
        if (!ola(s, 'C', m1, 64) && (q = lerQuadro(s, &n)) && n == 49 && q[0] == 'R' && !kr_con_cliente2(&con, APP, sk, pks, q + 1, m3 + 1, &can) && !mandarQuadro(s, m3, 17, NULL, 0)) {
            free(q); pthread_mutex_lock(&trava); p->tentando = 0; pthread_mutex_unlock(&trava);
            laco(p, s, &can);
            return NULL;
        }
        free(q); fecharSock(s);
    }
    pthread_mutex_lock(&trava); p->tentando = 0; pthread_mutex_unlock(&trava);
    return NULL;
}

// ---------------------------------------------------------------- achar na rede (UDP)
static void fichaUdp(Txt *t) {
    tx(t, "KOFR!{\"app\":\"%s\",\"v\":%d,\"id\":\"%s\",\"porta\":%d,\"tipo\":\"pc\",\"nome\":", APP, VERSAO, meuId, portaTcp); txs(t, nome, strlen(nome)); tx(t, "}");
}
static void *servidorUdp(void *x) {
    (void)x;
    int s = (int)socket(AF_INET, SOCK_DGRAM, 0), um = 1;
    setsockopt(s, SOL_SOCKET, SO_REUSEADDR, (const char *)&um, sizeof um);
#ifdef SO_REUSEPORT
    setsockopt(s, SOL_SOCKET, SO_REUSEPORT, (const char *)&um, sizeof um);
#endif
    struct sockaddr_in a = {0}; a.sin_family = AF_INET; a.sin_port = htons(portaUdp); a.sin_addr.s_addr = htonl(INADDR_ANY);
    if (bind(s, (void *)&a, sizeof a)) { aviso("porta UDP %d ocupada: o PC não vai aparecer sozinho na rede", portaUdp); return NULL; }
    char b[600], pedido[64]; snprintf(pedido, sizeof pedido, "KOFR?%s", APP);
    for (;;) {
        struct sockaddr_in de; socklen_t nd = sizeof de;
        int n = (int)recvfrom(s, b, sizeof b - 1, 0, (void *)&de, &nd); if (n <= 0) continue;
        b[n] = 0;
        if (!visivel || strcmp(b, pedido) || !privado(ntohl(de.sin_addr.s_addr))) continue;
        Txt t = {0}; pthread_mutex_lock(&trava); fichaUdp(&t); pthread_mutex_unlock(&trava);
        sendto(s, t.b, (int)t.n, 0, (void *)&de, nd); free(t.b);
    }
    return NULL;
}
// pergunta na rede quem está aí (1,5 s). Atualiza o IP dos pareados. Devolve o JSON pra página (ou NULL)
static void achar(Txt *saida) {
    int s = (int)socket(AF_INET, SOCK_DGRAM, 0), um = 1;
    setsockopt(s, SOL_SOCKET, SO_BROADCAST, (const char *)&um, sizeof um);
    char alvo[64]; snprintf(alvo, sizeof alvo, "%s", alvoAchar); char *dp = strchr(alvo, ':'); int pu = portaUdp; if (dp) { *dp = 0; pu = atoi(dp + 1); }   // "ip:porta" nos testes
    struct sockaddr_in a = {0}; a.sin_family = AF_INET; a.sin_port = htons(pu); inet_pton(AF_INET, alvo, &a.sin_addr);
    char pedido[64]; snprintf(pedido, sizeof pedido, "KOFR?%s", APP);
    sendto(s, pedido, (int)strlen(pedido), 0, (void *)&a, sizeof a);
    prazo(s, 300);
    char vistos[16][17]; int nv = 0;
    if (saida) tx(saida, "{\"t\":\"achados\",\"lista\":[");
    long long fim = agora() + 2;
    while (agora() < fim) {
        char b[600]; struct sockaddr_in de; socklen_t nd = sizeof de;
        int n = (int)recvfrom(s, b, sizeof b - 1, 0, (void *)&de, &nd); if (n <= 5) continue;
        b[n] = 0; if (strncmp(b, "KOFR!", 5)) continue;
        char *id = jget(b + 5, "id", NULL), *po = jget(b + 5, "porta", NULL), *no = jget(b + 5, "nome", NULL), *ti = jget(b + 5, "tipo", NULL);
        int dup = !id || strlen(id) != 16 || !strcmp(id, meuId);
        for (int i = 0; i < nv && !dup; i++) dup = !strcmp(vistos[i], id);
        if (!dup && nv < 16) {
            memcpy(vistos[nv++], id, 17);
            char ip[48]; inet_ntop(AF_INET, &de.sin_addr, ip, sizeof ip);
            pthread_mutex_lock(&trava);
            Par *p = acharId(id); if (p && po) { snprintf(p->ip, sizeof p->ip, "%s", ip); p->porta = atoi(po); }
            pthread_mutex_unlock(&trava);
            if (saida) {
                tx(saida, "%s{\"id\":\"%s\",\"ip\":\"%s\",\"porta\":%d,\"pareado\":%s,\"tipo\":", nv > 1 ? "," : "", id, ip, po ? atoi(po) : 0, p ? "true" : "false");
                txs(saida, ti ? ti : "", ti ? strlen(ti) : 0); tx(saida, ",\"nome\":"); txs(saida, no ? no : "", no ? strlen(no) : 0); tx(saida, "}");
            }
        }
        free(id); free(po); free(no); free(ti);
    }
    if (saida) tx(saida, "]}");
    fecharSock(s);
}
static void *acharPelaPagina(void *x) { (void)x; Txt t = {0}; achar(&t); paraPaginaTxt(&t); return NULL; }

// ---------------------------------------------------------------- relógio: pareamento que expira, ping, religar
static void *relogio(void *x) {
    (void)x; long long ultimoAchar = 0;
    for (int tique = 0;; tique++) {
        sleep(5);
        pthread_mutex_lock(&trava); int expirou = parAte && agora() >= parAte; pthread_mutex_unlock(&trava);
        if (expirou) fecharJanela("tempo esgotado");
        // ping a cada 15 s; 45 s sem ouvir nada = caiu
        Con *cs[MAXPARES]; int nc = 0, faltando = 0;
        pthread_mutex_lock(&trava);
        for (int i = 0; i < npares; i++) {
            Con *c = pegarCon(&pares[i]);
            if (c) cs[nc++] = c;
            else if (!strcmp(pares[i].tipo, "pc") && pares[i].porta && pares[i].ip[0] && strcmp(meuId, pares[i].id) < 0 && !pares[i].tentando) faltando = 1;
        }
        pthread_mutex_unlock(&trava);
        for (int i = 0; i < nc; i++) {
            if (agora() - cs[i]->ultimo > 45) { cs[i]->morta = 1; shutdown(cs[i]->sock, 2); }
            else if (tique % 3 == 0) mandarCon(cs[i], "", "p", 1);
            soltarCon(cs[i]);
        }
        // outro PC pareado fora do ar: quem tem o id menor liga (assim os dois não ligam ao mesmo tempo)
        if (faltando && tique % 6 == 0) {
            if (agora() - ultimoAchar > 55) { ultimoAchar = agora(); achar(NULL); }
            pthread_mutex_lock(&trava);
            for (int i = 0; i < npares; i++) {
                Par *p = &pares[i];
                if (!p->con && !p->tentando && !strcmp(p->tipo, "pc") && p->porta && p->ip[0] && strcmp(meuId, p->id) < 0) { p->tentando = 1; soltar(conectarPar, p); }
            }
            pthread_mutex_unlock(&trava);
        }
    }
    return NULL;
}

// ---------------------------------------------------------------- pedidos da página
static void daPagina(char *j) {
    char *t = jget(j, "t", NULL); if (!t) return;
    if (!strcmp(t, "eu") || !strcmp(t, "lista")) avisarLista();
    else if (!strcmp(t, "nome")) {
        char *v = jget(j, "nome", NULL);
        if (v && *v) { pthread_mutex_lock(&trava); snprintf(nome, sizeof nome, "%s", v); limpar(nome); gravarConfig(); pthread_mutex_unlock(&trava); }
        free(v); avisarLista();
    } else if (!strcmp(t, "visivel")) {
        char *v = jget(j, "sim", NULL); pthread_mutex_lock(&trava); visivel = v && !strcmp(v, "true"); gravarConfig(); pthread_mutex_unlock(&trava); free(v); avisarLista();
    } else if (!strcmp(t, "parear")) abrirJanela();
    else if (!strcmp(t, "parear-fim")) fecharJanela(NULL);
    else if (!strcmp(t, "remover")) {
        char *id = jget(j, "id", NULL);
        pthread_mutex_lock(&trava);
        Par *p = id ? acharId(id) : NULL;
        if (p && !p->tentando) {
            if (p->con) { p->con->morta = 1; shutdown(p->con->sock, 2); p->con = NULL; }   // a referência do pareado fica com o laço, que solta
            *p = pares[--npares]; gravarPares();
        }
        pthread_mutex_unlock(&trava); free(id); avisarLista();
    } else if (!strcmp(t, "enviar")) {
        size_t nd = 0; char *para = jget(j, "para", NULL), *canal = jget(j, "canal", NULL), *d = jget(j, "dados", &nd);
        Con *c = NULL;
        pthread_mutex_lock(&trava); Par *p = para ? acharId(para) : NULL; if (p) c = pegarCon(p); pthread_mutex_unlock(&trava);
        if (!c || !canal || !*canal || mandarCon(c, canal, d ? d : "", d ? nd : 0)) {
            Txt e = {0}; tx(&e, "{\"t\":\"nao-enviou\",\"para\":"); txs(&e, para ? para : "", para ? strlen(para) : 0); tx(&e, "}"); paraPaginaTxt(&e);
        }
        if (c) soltarCon(c);
        free(para); free(canal); free(d);
    } else if (!strcmp(t, "achar")) soltar(acharPelaPagina, NULL);
    else if (!strcmp(t, "parear-com")) {
        char *ip = jget(j, "ip", NULL), *po = jget(j, "porta", NULL), *se = jget(j, "senha", NULL), *mo = jget(j, "modo", NULL);
        if (ip && po && se) {
            PedidoPar *pp = calloc(1, sizeof *pp);
            snprintf(pp->ip, sizeof pp->ip, "%s", ip); snprintf(pp->senha, sizeof pp->senha, "%s", se); pp->porta = atoi(po); pp->modo = mo && *mo == 'q' ? 'q' : 'c';
            soltar(parearCom, pp);
        }
        free(ip); free(po); free(se); free(mo);
    } else if (!strcmp(t, "conectar")) {   // liga já pra um PC pareado (sem esperar o relógio)
        char *id = jget(j, "id", NULL);
        pthread_mutex_lock(&trava); Par *p = id ? acharId(id) : NULL;
        if (p && !p->con && !p->tentando && p->porta && p->ip[0]) { p->tentando = 1; soltar(conectarPar, p); }
        pthread_mutex_unlock(&trava); free(id);
    }
    free(t);
}
static void atenderPagina(int s) {
    char req[8192]; int n = 0;
    while (n < (int)sizeof req - 1) { ssize_t r = recv(s, req + n, 1, 0); if (r <= 0) { fecharSock(s); return; } n++; req[n] = 0; if (n >= 4 && !memcmp(req + n - 4, "\r\n\r\n", 4)) break; }
    char *k = NULL, *origem = NULL;
    for (char *q = req; *q; q++) {
        if (!k && !strncasecmp(q, "\nSec-WebSocket-Key:", 19)) k = q + 19;
        if (!origem && !strncasecmp(q, "\nOrigin:", 8)) origem = q + 8;
    }
    if (origem) { while (*origem == ' ') origem++; }
    // site da internet aberto no navegador não fala com o serviço: só a página do arquivo (file://, origem "null")
    if (origem && !strncasecmp(origem, "http", 4)) { const char *r = "HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"; tudo(s, r, strlen(r)); fecharSock(s); return; }
    if (!k) { const char *r = "HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nConnection: close\r\n\r\nkofservico ok\n"; tudo(s, r, strlen(r)); fecharSock(s); return; }
    while (*k == ' ') k++;
    char chave[160]; int i = 0; while (k[i] && k[i] != '\r' && i < 100) { chave[i] = k[i]; i++; } chave[i] = 0;
    strcat(chave, "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    uint8_t h[20]; sha1((uint8_t *)chave, strlen(chave), h); char aceite[64]; base64(h, 20, aceite);
    char r[256]; int nr = snprintf(r, sizeof r, "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n", aceite);
    pthread_mutex_lock(&envPag); if (pagina >= 0) fecharSock(pagina); tudo(s, r, nr); pagina = s; pthread_mutex_unlock(&envPag);
    semAtraso(s);
    uint8_t *junta = NULL; size_t njunta = 0;
    for (;;) {
        uint8_t c[2]; if (lerTudo(s, c, 2)) break;
        int op = c[0] & 15, fim = c[0] & 0x80; uint64_t len = c[1] & 127;
        if (len == 126) { uint8_t e[2]; if (lerTudo(s, e, 2)) break; len = e[0] << 8 | e[1]; }
        else if (len == 127) { uint8_t e[8]; if (lerTudo(s, e, 8)) break; len = 0; for (int j = 0; j < 8; j++) len = len << 8 | e[j]; }
        uint8_t m[4] = {0}; if ((c[1] & 0x80) && lerTudo(s, m, 4)) break;
        if (len > (8u << 20)) break;
        uint8_t *d = malloc(len + 1); if (lerTudo(s, d, len)) { free(d); break; }
        for (uint64_t j = 0; j < len; j++) d[j] ^= m[j & 3];
        if (op == 8) { free(d); break; }
        if (op == 9 || op == 10) { free(d); continue; }
        if (op == 1 || op == 2) { free(junta); junta = d; njunta = len; }
        else if (op == 0 && junta) { junta = realloc(junta, njunta + len + 1); memcpy(junta + njunta, d, len); njunta += len; free(d); }
        else { free(d); continue; }
        if (!fim) continue;
        junta[njunta] = 0; daPagina((char *)junta); free(junta); junta = NULL; njunta = 0;
    }
    free(junta);
    pthread_mutex_lock(&envPag); if (pagina == s) pagina = -1; pthread_mutex_unlock(&envPag);
    fecharSock(s);
}
static void *servidorPagina(void *x) {
    (void)x;
    int s = (int)socket(AF_INET, SOCK_STREAM, 0);
#ifndef _WIN32
    int um = 1; setsockopt(s, SOL_SOCKET, SO_REUSEADDR, (const char *)&um, sizeof um);
#endif
    struct sockaddr_in a = {0}; a.sin_family = AF_INET; a.sin_port = htons(portaWs); a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(s, (void *)&a, sizeof a) || listen(s, 4)) { aviso("porta %d ocupada (já tem outro kofservico aberto?)", portaWs); exit(2); }
    for (;;) { int c = (int)accept(s, NULL, NULL); if (c >= 0) atenderPagina(c); }
    return NULL;
}

static void criarPasta(const char *p) {   // mkdir -p
    char b[1024]; snprintf(b, sizeof b, "%s", p);
    for (char *q = b + 1; *q; q++) if (*q == '/' || *q == '\\') { char c = *q; *q = 0; mkdir(b, 0700); *q = c; }
    mkdir(b, 0700);
}
static void sair(int x) { (void)x; _exit(0); }
int main(int argc, char **argv) {
#ifdef _WIN32
    WSADATA w; WSAStartup(MAKEWORD(2, 2), &w);
    int nw; wchar_t **wa = CommandLineToArgvW(GetCommandLineW(), &nw);
    char **av = calloc(nw + 1, sizeof *av);
    for (int i = 0; i < nw; i++) { int n = WideCharToMultiByte(CP_UTF8, 0, wa[i], -1, NULL, 0, NULL, NULL); av[i] = malloc(n); WideCharToMultiByte(CP_UTF8, 0, wa[i], -1, av[i], n, NULL, NULL); }
    argc = nw; argv = av;
    const wchar_t *la = _wgetenv(L"LOCALAPPDATA"); char base[900] = ".";
    if (la) WideCharToMultiByte(CP_UTF8, 0, la, -1, base, sizeof base, NULL, NULL);
    snprintf(pasta, sizeof pasta, "%s\\KOFnes\\rede", base);
#else
    signal(SIGPIPE, SIG_IGN);
    const char *x = getenv("XDG_DATA_HOME"), *home = getenv("HOME");
    if (x && *x) snprintf(pasta, sizeof pasta, "%s/KOFnes/rede", x); else snprintf(pasta, sizeof pasta, "%s/.local/share/KOFnes/rede", home ? home : ".");
#endif
    signal(SIGTERM, sair); signal(SIGINT, sair);
    const char *nomeArg = NULL;
    for (int i = 1; i + 1 < argc; i += 2) {
        if (!strcmp(argv[i], "--pasta")) snprintf(pasta, sizeof pasta, "%s", argv[i + 1]);
        else if (!strcmp(argv[i], "--nome")) nomeArg = argv[i + 1];
        else if (!strcmp(argv[i], "--porta")) portaTcp = atoi(argv[i + 1]);
        else if (!strcmp(argv[i], "--udp")) portaUdp = atoi(argv[i + 1]);
        else if (!strcmp(argv[i], "--ws")) portaWs = atoi(argv[i + 1]);
        else if (!strcmp(argv[i], "--achar")) snprintf(alvoAchar, sizeof alvoAchar, "%s", argv[i + 1]);
    }
    criarPasta(pasta);
    char host[64] = "PC"; gethostname(host, sizeof host); host[sizeof host - 1] = 0;
    snprintf(nome, sizeof nome, "PC %s", host);
    lerConfig();
    if (nomeArg) snprintf(nome, sizeof nome, "%s", nomeArg);
    limpar(nome);
    identidade(); lerPares();
    aviso("aparelho %s (%s), dados em %s", meuId, nome, pasta);
    soltar(servidorTcp, NULL); soltar(servidorUdp, NULL); soltar(relogio, NULL);
    servidorPagina(NULL);
    return 0;
}
