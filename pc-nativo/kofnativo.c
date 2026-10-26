// kofnativo: roda um núcleo libretro NATIVO no PC (hoje o PS2: LRPS2, o PCSX2 do libretro) numa janela própria, comandado
// pela página do KOFstation. O navegador não aguenta o PS2 pesado (Shadow of the Colossus); aqui o núcleo roda de verdade.
// A página continua sendo o KOFstation: biblioteca, menus, saves e filtros. Ela fala com este programa por WebSocket em
// 127.0.0.1:8643 (só o próprio PC alcança). A imagem passa pelo MESMO shader de filtro da página (KofVisual.fonte),
// convertido de GLSL do WebGL pro OpenGL 3.3.
//
// Protocolo (texto, uma linha; "ab" = a próxima mensagem binária é o conteúdo):
//   página -> aqui: abrir <tamanho> <nome>   (o disco é lido aos pedaços pela página: kof://disco/<nome>)
//                   bios <arquivo> + ab      sistema <chave> <valor>   (opção do núcleo)
//                   pad <botões libretro> <eixos int8 x4>     teclas <codigo>:<id> ...   (teclado, ids do libretro)
//                   mostrar | esconder | reiniciar | fechar | volume <0..1>
//                   modo pagina | modo janela   (página: sem janela, os quadros vão pra página como binário 'Q')
//                   filtro\n<fonte GLSL>   uni <4 floats u> <52 floats p>
//                   estado (responde binário 'E') | carregar + ab | cartao + ab (pasta de saves) | pedecartao (responde 'M')
//                   binário 'D' <id u32> <dados>: resposta de um "ler"
//   aqui -> página: ler <id> <início> <tamanho> | pronto <largura> <altura> <fps> | erro <texto> | log <texto>
//                   pausou (Esc na janela) | quadros <n> | binário 'E' estado, 'M' cartão de memória,
//                   'Q' <largura u16><altura u16><RGB> (modo página: um quadro, a origem em cima; RGBA com KOF_RGBA)
// Compilar: pc-nativo/construir.sh. Uso: kofnativo <núcleo.so> <pasta de dados>
#define _GNU_SOURCE
#define GL_GLEXT_PROTOTYPES
#ifdef _WIN32
// Windows (compilado com o llvm-mingw): soquetes do winsock, DLL pelo LoadLibrary, caminhos UTF-8 convertidos pra UTF-16
// e o OpenGL 3.3 pelo glad (o opengl32 do Windows só traz o 1.1; o resto é carregado depois que o contexto existe)
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shellapi.h>
#include <direct.h>
#include "glad.h"
#define SDL_MAIN_HANDLED
#include <SDL2/SDL.h>
#define MSG_NOSIGNAL 0
#define fecharSock closesocket
static wchar_t *largo(const char *u) { static wchar_t w[4][1200]; static int v; v = (v + 1) & 3; MultiByteToWideChar(CP_UTF8, 0, u, -1, w[v], 1200); return w[v]; }
#else
#include <SDL2/SDL.h>
#include <SDL2/SDL_opengl.h>
#include <arpa/inet.h>
#include <dlfcn.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <sys/socket.h>
#define fecharSock close
#endif
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
#include "libretro.h"
#ifdef _WIN32
#define mkdir(c, m) _wmkdir(largo(c))
#define fopen(c, m) _wfopen(largo(c), largo(m))
#endif

#define PORTA 8643
static char pastaDados[1024], pastaSistema[1100], pastaSaves[1100];

// ---------------------------------------------------------------- WebSocket (um cliente: a página)
static int cliente = -1;
static pthread_mutex_t envio = PTHREAD_MUTEX_INITIALIZER;

static void sha1(const uint8_t *d, size_t n, uint8_t out[20]) {
    uint32_t h[5] = {0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0};
    size_t total = ((n + 8) / 64 + 1) * 64;
    uint8_t *m = calloc(total, 1);
    memcpy(m, d, n); m[n] = 0x80;
    uint64_t bits = (uint64_t)n * 8;
    for (int i = 0; i < 8; i++) m[total - 1 - i] = bits >> (8 * i);
    for (size_t b = 0; b < total; b += 64) {
        uint32_t w[80];
        for (int i = 0; i < 16; i++) w[i] = m[b + 4 * i] << 24 | m[b + 4 * i + 1] << 16 | m[b + 4 * i + 2] << 8 | m[b + 4 * i + 3];
        for (int i = 16; i < 80; i++) { uint32_t x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = x << 1 | x >> 31; }
        uint32_t a = h[0], bb = h[1], c = h[2], dd = h[3], e = h[4];
        for (int i = 0; i < 80; i++) {
            uint32_t f, k;
            if (i < 20) { f = (bb & c) | (~bb & dd); k = 0x5A827999; }
            else if (i < 40) { f = bb ^ c ^ dd; k = 0x6ED9EBA1; }
            else if (i < 60) { f = (bb & c) | (bb & dd) | (c & dd); k = 0x8F1BBCDC; }
            else { f = bb ^ c ^ dd; k = 0xCA62C1D6; }
            uint32_t t = (a << 5 | a >> 27) + f + e + k + w[i];
            e = dd; dd = c; c = bb << 30 | bb >> 2; bb = a; a = t;
        }
        h[0] += a; h[1] += bb; h[2] += c; h[3] += dd; h[4] += e;
    }
    free(m);
    for (int i = 0; i < 20; i++) out[i] = h[i / 4] >> (24 - 8 * (i % 4));
}
static void base64(const uint8_t *d, int n, char *out) {
    static const char t[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    int o = 0;
    for (int i = 0; i < n; i += 3) {
        uint32_t v = d[i] << 16 | (i + 1 < n ? d[i + 1] << 8 : 0) | (i + 2 < n ? d[i + 2] : 0);
        out[o++] = t[v >> 18 & 63]; out[o++] = t[v >> 12 & 63];
        out[o++] = i + 1 < n ? t[v >> 6 & 63] : '='; out[o++] = i + 2 < n ? t[v & 63] : '=';
    }
    out[o] = 0;
}
static int tudo(int s, const void *b, size_t n) {
    const uint8_t *p = b;
    while (n) { ssize_t r = send(s, (const char *)p, n, MSG_NOSIGNAL); if (r <= 0) return -1; p += r; n -= r; }
    return 0;
}
// manda um quadro: op 1 = texto, 2 = binário; "pre" vai na frente dos dados (ex.: a letra do binário)
static void enviar(int op, const void *pre, size_t np, const void *d, size_t n) {
    pthread_mutex_lock(&envio);
    if (cliente >= 0) {
        uint8_t cab[10]; size_t nc = 2, t = np + n;
        cab[0] = 0x80 | op;
        if (t < 126) cab[1] = t;
        else if (t < 65536) { cab[1] = 126; cab[2] = t >> 8; cab[3] = t; nc = 4; }
        else { cab[1] = 127; for (int i = 0; i < 8; i++) cab[2 + i] = (uint64_t)t >> (56 - 8 * i); nc = 10; }
        if (tudo(cliente, cab, nc) || (np && tudo(cliente, pre, np)) || (n && tudo(cliente, d, n))) { fecharSock(cliente); cliente = -1; }
    }
    pthread_mutex_unlock(&envio);
}
static void dizer(const char *fmt, ...) {
    char b[4096]; va_list a; va_start(a, fmt); int n = vsnprintf(b, sizeof b, fmt, a); va_end(a);
    if (n > (int)sizeof b - 1) n = sizeof b - 1;
    enviar(1, NULL, 0, b, n);
    fprintf(stderr, "[kofnativo] %s\n", b);
}

// ---------------------------------------------------------------- disco lido aos pedaços pela página (VFS kof://)
// O núcleo lê o DVD por aqui: blocos de 1 MB pedidos à página (File.slice) e guardados num cache pequeno
#define BLOCO (1 << 20)
#define NCACHE 48
static struct { int64_t ini; uint8_t *d; int n; unsigned uso; } cache[NCACHE];
static unsigned usoRelogio;
static pthread_mutex_t discoTrava = PTHREAD_MUTEX_INITIALIZER;
static pthread_cond_t discoChegou = PTHREAD_COND_INITIALIZER;
static uint32_t pedido; static uint8_t *resposta; static int respostaN = -1;
static int64_t discoTam; static char discoNome[512];

static uint8_t *blocoDoDisco(int64_t ini, int *n) {   // chama com discoTrava preso
    for (int i = 0; i < NCACHE; i++) if (cache[i].d && cache[i].ini == ini) { cache[i].uso = ++usoRelogio; *n = cache[i].n; return cache[i].d; }
    int len = (int)(discoTam - ini < BLOCO ? discoTam - ini : BLOCO);
    uint32_t id = ++pedido; respostaN = -1;
    char m[96]; int k = snprintf(m, sizeof m, "ler %u %lld %d", id, (long long)ini, len);
    enviar(1, NULL, 0, m, k);
    struct timespec ate; clock_gettime(CLOCK_REALTIME, &ate); ate.tv_sec += 20;
    while (respostaN < 0 && cliente >= 0) if (pthread_cond_timedwait(&discoChegou, &discoTrava, &ate) == ETIMEDOUT) break;
    if (respostaN < 0) { *n = 0; return NULL; }
    int v = 0; for (int i = 1; i < NCACHE; i++) if (!cache[i].d || cache[i].uso < cache[v].uso) { v = i; if (!cache[i].d) break; }
    free(cache[v].d); cache[v].d = resposta; cache[v].n = respostaN; cache[v].ini = ini; cache[v].uso = ++usoRelogio;
    resposta = NULL; respostaN = -1;
    *n = cache[v].n; return cache[v].d;
}
struct retro_vfs_file_handle { int64_t pos; char caminho[600]; };
static const char *vfs_caminho(struct retro_vfs_file_handle *h) { return h->caminho; }
static struct retro_vfs_file_handle *vfs_abrir(const char *c, unsigned modo, unsigned dicas) {
    (void)dicas;
    if (strncmp(c, "kof://disco/", 12) || (modo & RETRO_VFS_FILE_ACCESS_WRITE)) return NULL;
    struct retro_vfs_file_handle *h = calloc(1, sizeof *h); snprintf(h->caminho, sizeof h->caminho, "%s", c); return h;
}
static int vfs_fechar(struct retro_vfs_file_handle *h) { free(h); return 0; }
static int64_t vfs_tamanho(struct retro_vfs_file_handle *h) { (void)h; return discoTam; }
static int64_t vfs_onde(struct retro_vfs_file_handle *h) { return h->pos; }
static int64_t vfs_ir(struct retro_vfs_file_handle *h, int64_t o, int de) {
    int64_t p = de == RETRO_VFS_SEEK_POSITION_START ? o : de == RETRO_VFS_SEEK_POSITION_CURRENT ? h->pos + o : discoTam + o;
    if (p < 0) return -1;
    h->pos = p; return 0;   // como o RetroArch: 0 = deu certo (o LRPS2 confere seek != 0; devolver a posição só funcionava no começo do disco)
}
static int64_t vfs_ler(struct retro_vfs_file_handle *h, void *dst, uint64_t n) {
    uint8_t *o = dst; int64_t lidos = 0;
    pthread_mutex_lock(&discoTrava);
    while (n > 0 && h->pos < discoTam) {
        int64_t ini = h->pos / BLOCO * BLOCO; int bn; uint8_t *b = blocoDoDisco(ini, &bn);
        if (!b) break;
        int64_t dentro = h->pos - ini, pega = bn - dentro; if (pega > (int64_t)n) pega = n; if (pega <= 0) break;
        memcpy(o, b + dentro, pega); o += pega; n -= pega; h->pos += pega; lidos += pega;
    }
    pthread_mutex_unlock(&discoTrava);
    return lidos ? lidos : (n ? -1 : 0);
}
static int64_t vfs_escrever(struct retro_vfs_file_handle *h, const void *s, uint64_t n) { (void)h; (void)s; (void)n; return -1; }
static int vfs_descarregar(struct retro_vfs_file_handle *h) { (void)h; return 0; }
static int vfs_apagar(const char *c) { (void)c; return -1; }
static int vfs_renomear(const char *a, const char *b) { (void)a; (void)b; return -1; }
static int64_t vfs_truncar(struct retro_vfs_file_handle *h, int64_t l) { (void)h; (void)l; return -1; }
static int vfs_stat(const char *c, int32_t *tam) {
    if (strncmp(c, "kof://disco/", 12)) return 0;
    if (tam) *tam = (int32_t)(discoTam > 0x7fffffff ? 0x7fffffff : discoTam);
    return RETRO_VFS_STAT_IS_VALID;
}
static int vfs_mkdir(const char *c) { (void)c; return -1; }
static struct retro_vfs_dir_handle *vfs_opendir(const char *c, bool o) { (void)c; (void)o; return NULL; }
static bool vfs_readdir(struct retro_vfs_dir_handle *d) { (void)d; return false; }
static const char *vfs_dnome(struct retro_vfs_dir_handle *d) { (void)d; return NULL; }
static bool vfs_ddir(struct retro_vfs_dir_handle *d) { (void)d; return false; }
static int vfs_closedir(struct retro_vfs_dir_handle *d) { (void)d; return 0; }
static struct retro_vfs_interface vfs = { vfs_caminho, vfs_abrir, vfs_fechar, vfs_tamanho, vfs_onde, vfs_ir, vfs_ler, vfs_escrever,
    vfs_descarregar, vfs_apagar, vfs_renomear, vfs_truncar, vfs_stat, vfs_mkdir, vfs_opendir, vfs_readdir, vfs_dnome, vfs_ddir, vfs_closedir };

// ---------------------------------------------------------------- núcleo libretro
static struct {
    void (*init)(void); void (*deinit)(void); void (*run)(void); void (*reset)(void);
    bool (*load_game)(const struct retro_game_info *); void (*unload_game)(void);
    void (*get_av_info)(struct retro_system_av_info *); size_t (*serialize_size)(void);
    bool (*serialize)(void *, size_t); bool (*unserialize)(const void *, size_t);
    void (*set_environment)(retro_environment_t); void (*set_video_refresh)(retro_video_refresh_t);
    void (*set_audio_sample)(retro_audio_sample_t); void (*set_audio_sample_batch)(retro_audio_sample_batch_t);
    void (*set_input_poll)(retro_input_poll_t); void (*set_input_state)(retro_input_state_t);
} nucleo;
static struct retro_hw_render_callback hw;
static int temHw;
static enum retro_pixel_format formato = RETRO_PIXEL_FORMAT_0RGB1555;
static struct retro_system_av_info av;
static char opcoes[512][2][256]; static int nopcoes;   // opções do núcleo (padrão do SET_VARIABLES + as da página)

static void opcao(const char *k, const char *v) {
    for (int i = 0; i < nopcoes; i++) if (!strcmp(opcoes[i][0], k)) { snprintf(opcoes[i][1], 256, "%s", v); return; }
    if (nopcoes < 512) { snprintf(opcoes[nopcoes][0], 256, "%s", k); snprintf(opcoes[nopcoes][1], 256, "%s", v); nopcoes++; }
}
static int opcaoMudou;
static void logNucleo(enum retro_log_level n, const char *fmt, ...) {
    char b[1024]; va_list a; va_start(a, fmt); vsnprintf(b, sizeof b, fmt, a); va_end(a);
    size_t l = strlen(b); while (l && (b[l - 1] == '\n' || b[l - 1] == '\r')) b[--l] = 0;
    if (n >= RETRO_LOG_WARN) dizer("log %s", b); else fprintf(stderr, "%s\n", b);
}

// imagem: o núcleo desenha (HW) no nosso framebuffer ou entrega pixels (software) que viram textura
static GLuint fbo, fboTex, fboProf, texQuadro[2]; static int vez, fboL, fboA;
static int quadroL, quadroA, quadroNovo, quadroHw, texL[2], texA[2];
static uintptr_t pegarFbo(void) { return fbo; }
static retro_proc_address_t pegarFuncao(const char *n) { return (retro_proc_address_t)SDL_GL_GetProcAddress(n); }
static void criarFbo(int l, int a) {
    if (fbo && l <= fboL && a <= fboA) return;
    if (fbo) { glDeleteFramebuffers(1, &fbo); glDeleteTextures(1, &fboTex); glDeleteRenderbuffers(1, &fboProf); }
    fboL = l; fboA = a;
    glGenTextures(1, &fboTex); glBindTexture(GL_TEXTURE_2D, fboTex);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, l, a, 0, GL_RGBA, GL_UNSIGNED_BYTE, NULL);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glGenRenderbuffers(1, &fboProf); glBindRenderbuffer(GL_RENDERBUFFER, fboProf);
    glRenderbufferStorage(GL_RENDERBUFFER, GL_DEPTH24_STENCIL8, l, a);
    glGenFramebuffers(1, &fbo); glBindFramebuffer(GL_FRAMEBUFFER, fbo);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, fboTex, 0);
    glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_DEPTH_STENCIL_ATTACHMENT, GL_RENDERBUFFER, fboProf);
    glBindFramebuffer(GL_FRAMEBUFFER, 0);
}
// o quadro (do FBO ou dos pixels) vira a textura "t"; a anterior fica como "tp" (fantasma etc.)
static void videoQuadro(const void *d, unsigned l, unsigned a, size_t passo) {
    if (!d) return;   // repetiu o quadro anterior
    vez ^= 1; quadroL = l; quadroA = a; quadroNovo = 1;
    if (d == RETRO_HW_FRAME_BUFFER_VALID) { quadroHw = 1; return; }   // aqui é o contexto do núcleo: a cópia vem depois, no da janela
    glBindTexture(GL_TEXTURE_2D, texQuadro[vez]);
    if (formato == RETRO_PIXEL_FORMAT_XRGB8888) {
        glPixelStorei(GL_UNPACK_ROW_LENGTH, passo / 4);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, l, a, 0, GL_BGRA, GL_UNSIGNED_BYTE, d);
    } else {
        glPixelStorei(GL_UNPACK_ROW_LENGTH, passo / 2);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGB, l, a, 0, GL_RGB, GL_UNSIGNED_SHORT_5_6_5, d);
    }
    glPixelStorei(GL_UNPACK_ROW_LENGTH, 0);
    texL[vez] = l; texA[vez] = a;
}

// som: o núcleo entrega estéreo int16; vai pra fila do SDL, que também dita o ritmo
static SDL_AudioDeviceID som; static float volume = 1;
static size_t somLote(const int16_t *d, size_t quadros) {
    if (!som) return quadros;
    if (volume >= 0.999f) SDL_QueueAudio(som, d, quadros * 4);
    else { int16_t t[4096]; for (size_t i = 0; i < quadros * 2; i += 2048) { size_t n = quadros * 2 - i < 2048 ? quadros * 2 - i : 2048; for (size_t k = 0; k < n; k++) t[k] = d[i + k] * volume; SDL_QueueAudio(som, t, n * 2); } }
    return quadros;
}
static void somUm(int16_t e, int16_t dd) { int16_t s[2] = {e, dd}; somLote(s, 1); }

// controles: o que vem da página (celular, teclado da página) + o controle ligado aqui + o teclado desta janela
static volatile uint32_t padPagina; static volatile int32_t eixosPagina;
static uint32_t padTeclado; static SDL_GameController *controle;
static struct { SDL_Scancode s; int id; } teclas[32]; static int nteclas;
static void lerEntrada(void) {}
static int16_t estadoEntrada(unsigned porta, unsigned disp, unsigned indice, unsigned id) {
    if (porta) return 0;
    if (disp == RETRO_DEVICE_JOYPAD) {
        uint32_t b = padPagina | padTeclado;
        if (controle) {
            static const int mapa[][2] = {{SDL_CONTROLLER_BUTTON_A, 0}, {SDL_CONTROLLER_BUTTON_X, 1}, {SDL_CONTROLLER_BUTTON_BACK, 2},
                {SDL_CONTROLLER_BUTTON_START, 3}, {SDL_CONTROLLER_BUTTON_DPAD_UP, 4}, {SDL_CONTROLLER_BUTTON_DPAD_DOWN, 5},
                {SDL_CONTROLLER_BUTTON_DPAD_LEFT, 6}, {SDL_CONTROLLER_BUTTON_DPAD_RIGHT, 7}, {SDL_CONTROLLER_BUTTON_B, 8},
                {SDL_CONTROLLER_BUTTON_Y, 9}, {SDL_CONTROLLER_BUTTON_LEFTSHOULDER, 10}, {SDL_CONTROLLER_BUTTON_RIGHTSHOULDER, 11},
                {SDL_CONTROLLER_BUTTON_LEFTSTICK, 14}, {SDL_CONTROLLER_BUTTON_RIGHTSTICK, 15}};
            for (unsigned i = 0; i < sizeof mapa / sizeof *mapa; i++) if (SDL_GameControllerGetButton(controle, mapa[i][0])) b |= 1u << mapa[i][1];
            if (SDL_GameControllerGetAxis(controle, SDL_CONTROLLER_AXIS_TRIGGERLEFT) > 12000) b |= 1u << 12;
            if (SDL_GameControllerGetAxis(controle, SDL_CONTROLLER_AXIS_TRIGGERRIGHT) > 12000) b |= 1u << 13;
        }
        if (id == RETRO_DEVICE_ID_JOYPAD_MASK) return (int16_t)b;
        return (b >> id) & 1;
    }
    if (disp == RETRO_DEVICE_ANALOG && indice < 2 && id < 2) {
        int k = indice * 2 + id;
        int v = (int8_t)(eixosPagina >> (8 * k)) * 258;
        if (controle) {
            static const SDL_GameControllerAxis ax[4] = {SDL_CONTROLLER_AXIS_LEFTX, SDL_CONTROLLER_AXIS_LEFTY, SDL_CONTROLLER_AXIS_RIGHTX, SDL_CONTROLLER_AXIS_RIGHTY};
            int c = SDL_GameControllerGetAxis(controle, ax[k]); if (abs(c) > abs(v)) v = c;
        }
        return v > 32767 ? 32767 : v < -32767 ? -32767 : v;
    }
    return 0;
}

static bool ambiente(unsigned cmd, void *d) {
    switch (cmd) {
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: ((struct retro_log_callback *)d)->log = logNucleo; return true;
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY: *(const char **)d = pastaSistema; return true;
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: *(const char **)d = pastaSaves; return true;
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: formato = *(enum retro_pixel_format *)d; return true;
    case RETRO_ENVIRONMENT_GET_CAN_DUPE: *(bool *)d = true; return true;
    case RETRO_ENVIRONMENT_GET_PREFERRED_HW_RENDER: *(unsigned *)d = RETRO_HW_CONTEXT_OPENGL_CORE; return true;
    case RETRO_ENVIRONMENT_SET_HW_RENDER: {
        struct retro_hw_render_callback *h = d;
        if (h->context_type != RETRO_HW_CONTEXT_OPENGL_CORE && h->context_type != RETRO_HW_CONTEXT_OPENGL) return false;
        h->get_current_framebuffer = pegarFbo; h->get_proc_address = pegarFuncao;
        hw = *h; temHw = 1; return true;
    }
    case RETRO_ENVIRONMENT_GET_VFS_INTERFACE: {
        struct retro_vfs_interface_info *i = d;
        if (i->required_interface_version > 3) return false;
        i->iface = &vfs; return true;
    }
    case RETRO_ENVIRONMENT_SET_VARIABLES: {   // guarda o padrão de cada opção ("Descrição; padrão|outro")
        for (const struct retro_variable *v = d; v->key; v++) {
            const char *p = v->value ? strchr(v->value, ';') : NULL; if (!p) continue;
            p++; while (*p == ' ') p++;
            char padrao[256]; int k = 0; while (p[k] && p[k] != '|' && k < 255) { padrao[k] = p[k]; k++; } padrao[k] = 0;
            int ja = 0; for (int i = 0; i < nopcoes; i++) if (!strcmp(opcoes[i][0], v->key)) ja = 1;
            if (!ja) opcao(v->key, padrao);
        }
        return true;
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE: {
        struct retro_variable *v = d;
        for (int i = 0; i < nopcoes; i++) if (!strcmp(opcoes[i][0], v->key)) { v->value = opcoes[i][1]; if (getenv("KOF_DEBUG")) fprintf(stderr, "opção %s = %s\n", v->key, v->value); return true; }
        if (getenv("KOF_DEBUG")) fprintf(stderr, "opção %s = (nenhuma)\n", v->key);
        v->value = NULL; return false;
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: *(bool *)d = opcaoMudou; opcaoMudou = 0; return true;
    case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION: *(unsigned *)d = 0; return true;
    case RETRO_ENVIRONMENT_SET_GEOMETRY: av.geometry = *(struct retro_game_geometry *)d; return true;
    case RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO: av = *(struct retro_system_av_info *)d; return true;
    case RETRO_ENVIRONMENT_GET_INPUT_BITMASKS: return true;
    case RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME: case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS: case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
    case RETRO_ENVIRONMENT_SET_PERFORMANCE_LEVEL: case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_DISPLAY:
        return true;
    default: return false;
    }
}

// ---------------------------------------------------------------- comandos da página (fila: o núcleo só é mexido na linha principal)
typedef struct Cmd { char *texto; uint8_t *bin; int nbin; struct Cmd *prox; } Cmd;
static Cmd *fila, **filaFim = &fila; static pthread_mutex_t filaTrava = PTHREAD_MUTEX_INITIALIZER;
static void enfileirar(char *t, uint8_t *b, int nb) {
    Cmd *c = calloc(1, sizeof *c); c->texto = t; c->bin = b; c->nbin = nb;
    pthread_mutex_lock(&filaTrava); *filaFim = c; filaFim = &c->prox; pthread_mutex_unlock(&filaTrava);
}
static Cmd *tirar(void) {
    pthread_mutex_lock(&filaTrava); Cmd *c = fila; if (c) { fila = c->prox; if (!fila) filaFim = &fila; } pthread_mutex_unlock(&filaTrava); return c;
}

static int lerTudo(int s, void *b, size_t n) { uint8_t *p = b; while (n) { ssize_t r = recv(s, (char *)p, n, 0); if (r <= 0) return -1; p += r; n -= r; } return 0; }
static void atender(int s) {
    char req[8192]; int n = 0;
    while (n < (int)sizeof req - 1) { ssize_t r = recv(s, req + n, 1, 0); if (r <= 0) { fecharSock(s); return; } n++; req[n] = 0; if (n >= 4 && !memcmp(req + n - 4, "\r\n\r\n", 4)) break; }
    char *k = NULL; for (char *q = req; *q && !k; q++) if (!strncasecmp(q, "Sec-WebSocket-Key:", 18)) k = q;   // strcasestr não existe no Windows
    if (!k) {   // navegador comum: diz que está vivo
        const char *r = "HTTP/1.1 200 OK\r\nContent-Type: text/plain; charset=utf-8\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\nkofnativo ok\n";
        tudo(s, r, strlen(r)); fecharSock(s); return;
    }
    k += 18; while (*k == ' ') k++;
    char chave[128]; int i = 0; while (k[i] && k[i] != '\r' && i < 100) { chave[i] = k[i]; i++; } chave[i] = 0;
    strcat(chave, "258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
    uint8_t h[20]; sha1((uint8_t *)chave, strlen(chave), h); char aceite[64]; base64(h, 20, aceite);
    char r[256]; int nr = snprintf(r, sizeof r, "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n", aceite);
    pthread_mutex_lock(&envio); if (cliente >= 0) fecharSock(cliente); tudo(s, r, nr); cliente = s; pthread_mutex_unlock(&envio);
    int one = 1, buf = 8 << 20; setsockopt(s, IPPROTO_TCP, TCP_NODELAY, (const char *)&one, sizeof one); setsockopt(s, SOL_SOCKET, SO_SNDBUF, (const char *)&buf, sizeof buf);
    uint8_t *junta = NULL; size_t njunta = 0; int opJunta = 0;
    for (;;) {
        uint8_t c[2]; if (lerTudo(s, c, 2)) break;
        int op = c[0] & 15, fim = c[0] & 0x80; uint64_t len = c[1] & 127;
        if (len == 126) { uint8_t e[2]; if (lerTudo(s, e, 2)) break; len = e[0] << 8 | e[1]; }
        else if (len == 127) { uint8_t e[8]; if (lerTudo(s, e, 8)) break; len = 0; for (int j = 0; j < 8; j++) len = len << 8 | e[j]; }
        uint8_t m[4] = {0}; if ((c[1] & 0x80) && lerTudo(s, m, 4)) break;
        if (len > (64u << 20)) break;
        uint8_t *d = malloc(len + 1); if (lerTudo(s, d, len)) { free(d); break; }
        for (uint64_t j = 0; j < len; j++) d[j] ^= m[j & 3];
        if (op == 8) { free(d); break; }
        if (op == 9) { enviar(10, NULL, 0, d, len); free(d); continue; }
        if (op == 1 || op == 2) { free(junta); junta = d; njunta = len; opJunta = op; }
        else if (op == 0 && junta) { junta = realloc(junta, njunta + len + 1); memcpy(junta + njunta, d, len); njunta += len; free(d); }
        else { free(d); continue; }
        if (!fim) continue;
        uint8_t *msg = junta; size_t nmsg = njunta; junta = NULL; njunta = 0;
        if (opJunta == 2 && nmsg >= 5 && msg[0] == 'D') {   // pedaço do disco: entrega pra quem está esperando
            uint32_t id = msg[1] | msg[2] << 8 | msg[3] << 16 | (uint32_t)msg[4] << 24;
            pthread_mutex_lock(&discoTrava);
            if (id == pedido) { resposta = malloc(nmsg - 5 + 1); memcpy(resposta, msg + 5, nmsg - 5); respostaN = nmsg - 5; pthread_cond_broadcast(&discoChegou); }
            pthread_mutex_unlock(&discoTrava); free(msg); continue;
        }
        if (opJunta == 1) {
            msg[nmsg] = 0;
            if (!strncmp((char *)msg, "pad ", 4)) { unsigned b; int e; if (sscanf((char *)msg + 4, "%u %d", &b, &e) == 2) { padPagina = b; eixosPagina = e; } free(msg); continue; }
            enfileirar((char *)msg, NULL, 0);
        } else enfileirar(NULL, msg, nmsg);
    }
    free(junta);
    pthread_mutex_lock(&envio); if (cliente == s) cliente = -1; pthread_mutex_unlock(&envio);
    fecharSock(s);
    pthread_mutex_lock(&discoTrava); pthread_cond_broadcast(&discoChegou); pthread_mutex_unlock(&discoTrava);
    enfileirar(strdup("caiu"), NULL, 0);
}
static void *servidor(void *x) {
    (void)x;
    int s = socket(AF_INET, SOCK_STREAM, 0), one = 1;
#ifndef _WIN32
    setsockopt(s, SOL_SOCKET, SO_REUSEADDR, (const char *)&one, sizeof one);   // no Windows o REUSEADDR deixaria dois kofnativo na mesma porta
#endif
    (void)one;
    struct sockaddr_in a = {0}; a.sin_family = AF_INET; a.sin_port = htons(PORTA); a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(s, (void *)&a, sizeof a) || listen(s, 4)) { fprintf(stderr, "[kofnativo] porta %d ocupada (já tem outro aberto?)\n", PORTA); exit(2); }
    for (;;) { int c = (int)accept(s, NULL, NULL); if (c >= 0) atender(c); }
    return NULL;
}

// ---------------------------------------------------------------- filtro (o shader da página, convertido pro OpenGL 3.3)
static GLuint prog, progPadrao, vao, vbo; static GLint uT, uTp, uTela, uU, uP;
static float uniU[4] = {0, 0, 1, 0}, uniP[52];
static GLuint compilar(GLenum tipo, const char *f, char *erro, int nerro) {
    GLuint s = glCreateShader(tipo); glShaderSource(s, 1, &f, NULL); glCompileShader(s);
    GLint ok; glGetShaderiv(s, GL_COMPILE_STATUS, &ok);
    if (!ok) { glGetShaderInfoLog(s, nerro, NULL, erro); glDeleteShader(s); return 0; }
    return s;
}
static GLuint montarPrograma(const char *frag, char *erro, int nerro) {
    static const char *vert = "#version 330 core\nlayout(location=0) in vec2 p; out vec2 uv;\n"
        "void main() { uv = vec2(p.x * .5 + .5, .5 - p.y * .5); gl_Position = vec4(p, 0., 1.); }\n";
    // GLSL do WebGL 1 -> 3.3: varying vira in, texture2D vira texture, gl_FragColor vira uma saída
    size_t n = strlen(frag);
    char *f = malloc(n + 512); strcpy(f, "#version 330 core\n#define texture2D texture\nout vec4 kofCor;\n#define gl_FragColor kofCor\n");
    const char *p = frag; char *o = f + strlen(f);
    while (*p) { if (!strncmp(p, "varying ", 8)) { memcpy(o, "in ", 3); o += 3; p += 8; } else *o++ = *p++; }
    *o = 0;
    GLuint v = compilar(GL_VERTEX_SHADER, vert, erro, nerro), fr = compilar(GL_FRAGMENT_SHADER, f, erro, nerro);
    free(f);
    if (!v || !fr) return 0;
    GLuint pr = glCreateProgram(); glAttachShader(pr, v); glAttachShader(pr, fr); glLinkProgram(pr);
    GLint ok; glGetProgramiv(pr, GL_LINK_STATUS, &ok);
    if (!ok) { glGetProgramInfoLog(pr, nerro, NULL, erro); return 0; }
    return pr;
}
static void usarPrograma(GLuint pr) {
    prog = pr; glUseProgram(pr);
    uT = glGetUniformLocation(pr, "t"); uTp = glGetUniformLocation(pr, "tp"); uTela = glGetUniformLocation(pr, "tela");
    uU = glGetUniformLocation(pr, "u"); uP = glGetUniformLocation(pr, "p");
}

// ---------------------------------------------------------------- principal
static SDL_Window *janela; static int visivel, jogoAberto; static volatile sig_atomic_t rodando;
// o núcleo HW tem o próprio contexto OpenGL (compartilhado com o da janela, como o RetroArch faz): o PCSX2 guarda o estado
// do GL (VAO, programa, texturas, framebuffer) e conta que ninguém mexe nele; desenhar a janela no mesmo contexto trocava o
// VAO dele pelo nosso (sem buffer de índices) e o glDrawElements seguinte lia ponteiro inválido (segfault na Mesa)
static SDL_GLContext ctxJanela, ctxNucleo; static GLuint fboLeitura, fboLeituraTex, fboEscrita;
static void noNucleo(void) { if (ctxNucleo) SDL_GL_MakeCurrent(janela, ctxNucleo); }
static void naJanela(void) { if (ctxNucleo) SDL_GL_MakeCurrent(janela, ctxJanela); }
static void criarContextoNucleo(void) {
    if (ctxNucleo) return;
    SDL_GL_MakeCurrent(janela, ctxJanela);
    if (hw.version_major > 3 || (hw.version_major == 3 && hw.version_minor > 3)) {
        SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, hw.version_major); SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, hw.version_minor);
    }
    SDL_GL_SetAttribute(SDL_GL_SHARE_WITH_CURRENT_CONTEXT, 1);
    ctxNucleo = SDL_GL_CreateContext(janela);   // já fica como o atual
    if (!ctxNucleo) { fprintf(stderr, "[kofnativo] contexto do núcleo: %s (segue no da janela)\n", SDL_GetError()); SDL_GL_MakeCurrent(janela, ctxJanela); }
}
// o quadro que o núcleo desenhou no fbo dele (a textura fboTex é compartilhada) vira texQuadro[vez], já no contexto da janela
static void copiarQuadroHw(void) {
    if (!quadroHw) return;
    quadroHw = 0;
    if (!fboLeitura) glGenFramebuffers(1, &fboLeitura);
    glBindFramebuffer(GL_READ_FRAMEBUFFER, fboLeitura);
    if (fboLeituraTex != fboTex) { glFramebufferTexture2D(GL_READ_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, fboTex, 0); fboLeituraTex = fboTex; }
    if (texL[vez] != quadroL || texA[vez] != quadroA) {
        glBindTexture(GL_TEXTURE_2D, texQuadro[vez]);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, quadroL, quadroA, 0, GL_RGBA, GL_UNSIGNED_BYTE, NULL);
        texL[vez] = quadroL; texA[vez] = quadroA;
    }
    // o GL desenha com a origem embaixo; a textura do quadro fica com a origem em cima, igual aos quadros de software
    if (!fboEscrita) glGenFramebuffers(1, &fboEscrita);
    glBindFramebuffer(GL_DRAW_FRAMEBUFFER, fboEscrita);
    glFramebufferTexture2D(GL_DRAW_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, texQuadro[vez], 0);
    int vira = hw.bottom_left_origin;
    glBlitFramebuffer(0, 0, quadroL, quadroA, 0, vira ? quadroA : 0, quadroL, vira ? 0 : quadroA, GL_COLOR_BUFFER_BIT, GL_NEAREST);
    glBindFramebuffer(GL_READ_FRAMEBUFFER, 0); glBindFramebuffer(GL_DRAW_FRAMEBUFFER, 0);
}
// modo página: a janela fica escondida e cada quadro vai pra página (binário 'Q' <largura u16><altura u16><RGB>), que desenha
// com a interface dela por cima (tema, moldura, menus). A leitura do GPU é assíncrona (PBO: pega o quadro anterior, que já
// ficou pronto) e o envio é numa thread: se a página atrasar, fica só o quadro mais novo e o jogo não espera
static int modoPagina, bppPagina = 3; static GLuint fboPagina, pboQ[2]; static int pboVez, pboL[2], pboA[2], pboCheio[2]; static size_t pboTam[2];
typedef struct { uint8_t *d; size_t cap; int l, a; } QBuf;
static QBuf qEscrita, qPendente, qEnvio; static int qNovo; static unsigned qPulados;
static pthread_mutex_t qTrava = PTHREAD_MUTEX_INITIALIZER; static pthread_cond_t qTem = PTHREAD_COND_INITIALIZER;
static void *enviarQuadros(void *x) {
    (void)x;
    for (;;) {
        pthread_mutex_lock(&qTrava);
        while (!qNovo) pthread_cond_wait(&qTem, &qTrava);
        QBuf t = qEnvio; qEnvio = qPendente; qPendente = t; qNovo = 0;
        pthread_mutex_unlock(&qTrava);
        uint8_t cab[5] = {'Q', qEnvio.l, qEnvio.l >> 8, qEnvio.a, qEnvio.a >> 8};
        enviar(2, cab, 5, qEnvio.d, (size_t)qEnvio.l * qEnvio.a * bppPagina);
    }
    return NULL;
}
static void entregarQuadro(const void *d, int l, int a) {
    size_t n = (size_t)l * a * bppPagina;
    if (qEscrita.cap < n) { free(qEscrita.d); qEscrita.d = malloc(n); qEscrita.cap = n; }
    memcpy(qEscrita.d, d, n); qEscrita.l = l; qEscrita.a = a;
    pthread_mutex_lock(&qTrava);
    QBuf t = qPendente; qPendente = qEscrita; qEscrita = t;
    if (qNovo) qPulados++;   // a página ainda não levou o anterior: ele é descartado
    qNovo = 1; pthread_cond_signal(&qTem);
    pthread_mutex_unlock(&qTrava);
}
static void lerQuadroPagina(void) {
    int l = quadroL, a = quadroA, i = pboVez, j = i ^ 1; pboVez = j;
    if (!fboPagina) { glGenFramebuffers(1, &fboPagina); glGenBuffers(2, pboQ); }
    glBindFramebuffer(GL_FRAMEBUFFER, fboPagina);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, GL_TEXTURE_2D, texQuadro[vez], 0);
    if (bppPagina == 4) { glColorMask(0, 0, 0, 1); glClearColor(0, 0, 0, 1); glClear(GL_COLOR_BUFFER_BIT); glColorMask(1, 1, 1, 1); }   // a página quer alfa 255
    glBindBuffer(GL_PIXEL_PACK_BUFFER, pboQ[i]);
    if (pboTam[i] < (size_t)l * a * bppPagina) { pboTam[i] = (size_t)l * a * bppPagina; glBufferData(GL_PIXEL_PACK_BUFFER, pboTam[i], NULL, GL_STREAM_READ); }
    glPixelStorei(GL_PACK_ALIGNMENT, 1);
    glReadPixels(0, 0, l, a, bppPagina == 4 ? GL_RGBA : GL_RGB, GL_UNSIGNED_BYTE, 0);
    pboL[i] = l; pboA[i] = a; pboCheio[i] = 1;
    if (pboCheio[j]) {
        glBindBuffer(GL_PIXEL_PACK_BUFFER, pboQ[j]);
        const void *m = glMapBufferRange(GL_PIXEL_PACK_BUFFER, 0, (size_t)pboL[j] * pboA[j] * bppPagina, GL_MAP_READ_BIT);
        if (m) { entregarQuadro(m, pboL[j], pboA[j]); glUnmapBuffer(GL_PIXEL_PACK_BUFFER); }
        pboCheio[j] = 0;
    }
    glBindBuffer(GL_PIXEL_PACK_BUFFER, 0); glBindFramebuffer(GL_FRAMEBUFFER, 0);
}
static void mostrar(int sim) {
    visivel = sim;
    if (sim) { if (!modoPagina) { SDL_ShowWindow(janela); SDL_RaiseWindow(janela); } SDL_PauseAudioDevice(som, 0); }
    else { SDL_HideWindow(janela); SDL_PauseAudioDevice(som, 1); SDL_ClearQueuedAudio(som); }
}
static SDL_Scancode codigoParaTecla(const char *c) {   // KeyboardEvent.code (página) -> tecla do SDL
    if (!strncmp(c, "Key", 3) && c[3] && !c[4]) return SDL_SCANCODE_A + (c[3] - 'A');
    if (!strncmp(c, "Digit", 5)) return c[5] == '0' ? SDL_SCANCODE_0 : SDL_SCANCODE_1 + (c[5] - '1');
    static const struct { const char *c; SDL_Scancode s; } t[] = {{"ArrowUp", SDL_SCANCODE_UP}, {"ArrowDown", SDL_SCANCODE_DOWN},
        {"ArrowLeft", SDL_SCANCODE_LEFT}, {"ArrowRight", SDL_SCANCODE_RIGHT}, {"Enter", SDL_SCANCODE_RETURN}, {"Space", SDL_SCANCODE_SPACE},
        {"ShiftLeft", SDL_SCANCODE_LSHIFT}, {"ShiftRight", SDL_SCANCODE_RSHIFT}, {"ControlLeft", SDL_SCANCODE_LCTRL},
        {"ControlRight", SDL_SCANCODE_RCTRL}, {"AltLeft", SDL_SCANCODE_LALT}, {"Backslash", SDL_SCANCODE_BACKSLASH},
        {"Comma", SDL_SCANCODE_COMMA}, {"Period", SDL_SCANCODE_PERIOD}, {"Slash", SDL_SCANCODE_SLASH}, {"Semicolon", SDL_SCANCODE_SEMICOLON}};
    for (unsigned i = 0; i < sizeof t / sizeof *t; i++) if (!strcmp(c, t[i].c)) return t[i].s;
    return SDL_SCANCODE_UNKNOWN;
}
static void gravarArquivo(const char *caminho, const uint8_t *d, int n) {
    FILE *f = fopen(caminho, "wb"); if (f) { fwrite(d, 1, n, f); fclose(f); }
}
static uint8_t *lerArquivo(const char *caminho, long *n) {
    FILE *f = fopen(caminho, "rb"); if (!f) return NULL;
    fseek(f, 0, SEEK_END); *n = ftell(f); fseek(f, 0, SEEK_SET);
    uint8_t *d = malloc(*n); if (fread(d, 1, *n, f) != (size_t)*n) { free(d); d = NULL; } fclose(f); return d;
}
// a pasta de saves inteira (cartões de memória do PCSX2) <-> um pacote só: [u16 nome][nome][u32 tamanho][dados] por arquivo,
// caminhos relativos à pasta; a página guarda o pacote no banco (vai no backup .kofsave)
static uint8_t *pacote; static size_t npacote, cappacote;
static void poe(const void *d, size_t n) { if (npacote + n > cappacote) { cappacote = (npacote + n) * 2; pacote = realloc(pacote, cappacote); } memcpy(pacote + npacote, d, n); npacote += n; }
static void juntarUm(const char *c) {
    long n; uint8_t *d = lerArquivo(c, &n); if (!d) return;
    const char *rel = c + strlen(pastaSaves) + 1; uint16_t nl = strlen(rel); uint32_t tam = n;
    poe(&nl, 2); poe(rel, nl); poe(&tam, 4); poe(d, n); free(d);
}
#ifdef _WIN32
static void percorrer(const char *dir, int fundo) {
    if (fundo > 16) return;
    char c[2048]; snprintf(c, sizeof c, "%s/*", dir);
    WIN32_FIND_DATAW e; HANDLE h = FindFirstFileW(largo(c), &e); if (h == INVALID_HANDLE_VALUE) return;
    do {
        char nome[1024]; WideCharToMultiByte(CP_UTF8, 0, e.cFileName, -1, nome, sizeof nome, NULL, NULL);
        if (!strcmp(nome, ".") || !strcmp(nome, "..")) continue;
        snprintf(c, sizeof c, "%s/%s", dir, nome);
        if (e.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) percorrer(c, fundo + 1); else juntarUm(c);
    } while (FindNextFileW(h, &e));
    FindClose(h);
}
#else
#include <dirent.h>
static void percorrer(const char *dir, int fundo) {
    if (fundo > 16) return;
    DIR *d = opendir(dir); if (!d) return;
    for (struct dirent *e; (e = readdir(d));) {
        if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) continue;
        char c[2048]; snprintf(c, sizeof c, "%s/%s", dir, e->d_name);
        struct stat st; if (lstat(c, &st)) continue;
        if (S_ISDIR(st.st_mode)) percorrer(c, fundo + 1); else if (S_ISREG(st.st_mode)) juntarUm(c);
    }
    closedir(d);
}
#endif
static void juntarSaves(void) { npacote = 0; percorrer(pastaSaves, 0); }
static void espalharSaves(const uint8_t *d, size_t n) {
    for (size_t o = 0; o + 6 <= n;) {
        uint16_t nl; memcpy(&nl, d + o, 2); uint32_t tam; memcpy(&tam, d + o + 2 + nl, 4);
        if (o + 6 + nl + tam > n) break;
        char c[2048]; snprintf(c, sizeof c, "%s/%.*s", pastaSaves, nl, (const char *)d + o + 2);
        if (!strstr(c, "..")) {
            for (char *b = c + strlen(pastaSaves) + 1; (b = strchr(b, '/')); b++) { *b = 0; mkdir(c, 0755); *b = '/'; }
            gravarArquivo(c, d + o + 6 + nl, tam);
        }
        o += 6 + nl + tam;
    }
}

static void sair(int s) { (void)s; if (!rodando) _exit(0); rodando = 0; }   // o 2º sinal (ou antes de ligar) fecha na hora

static void abrirJogo(void) {
    noNucleo();
    if (jogoAberto) { nucleo.unload_game(); jogoAberto = 0; }
    pthread_mutex_lock(&discoTrava); for (int i = 0; i < NCACHE; i++) { free(cache[i].d); cache[i].d = NULL; } pthread_mutex_unlock(&discoTrava);
    char caminho[600]; snprintf(caminho, sizeof caminho, "kof://disco/%s", discoNome);
    struct retro_game_info g = {caminho, NULL, 0, NULL};
    if (!nucleo.load_game(&g)) { naJanela(); mostrar(0); dizer("erro o núcleo não abriu o jogo (falta a BIOS do PS2? o disco é de PS2?)"); return; }
    jogoAberto = 1;
    nucleo.get_av_info(&av);
    if (temHw) { criarContextoNucleo(); criarFbo(av.geometry.max_width, av.geometry.max_height); if (hw.context_reset) hw.context_reset(); }
    naJanela();
    dizer("pronto %u %u %.3f", av.geometry.base_width, av.geometry.base_height, av.timing.fps);
}

static void comando(Cmd *c) {
    if (!c->texto) return;   // binário solto (sem comando antes): ignora
    char *t = c->texto;
    static char esperaBin[64], esperaArg[512];
    if (!strcmp(t, "ab")) return;
    if (!strncmp(t, "abrir ", 6)) {
        long long tam; char *nome = strchr(t + 6, ' ');
        if (!nome || sscanf(t + 6, "%lld", &tam) != 1) return;
        discoTam = tam; snprintf(discoNome, sizeof discoNome, "%s", nome + 1);
        abrirJogo(); return;
    }
    if (!strncmp(t, "bios ", 5) || !strcmp(t, "carregar") || !strcmp(t, "cartao")) {   // o conteúdo vem na mensagem binária seguinte
        snprintf(esperaBin, sizeof esperaBin, "%.*s", (int)strcspn(t, " "), t);
        snprintf(esperaArg, sizeof esperaArg, "%s", strchr(t, ' ') ? strchr(t, ' ') + 1 : "");
        Cmd *b = NULL;
        for (int i = 0; i < 2000 && !(b = tirar()); i++) SDL_Delay(5);   // a binária chega logo atrás
        if (!b || !b->bin) { dizer("log faltou o conteúdo de '%s'", esperaBin); if (b) { free(b->texto); free(b->bin); free(b); } return; }
        if (!strcmp(esperaBin, "bios")) {
            char d[1300]; snprintf(d, sizeof d, "%s/pcsx2", pastaSistema); mkdir(d, 0755);
            snprintf(d, sizeof d, "%s/pcsx2/bios", pastaSistema); mkdir(d, 0755);
            char *barra = strrchr(esperaArg, '/'); snprintf(d, sizeof d, "%s/pcsx2/bios/%s", pastaSistema, barra ? barra + 1 : esperaArg);
            gravarArquivo(d, b->bin, b->nbin);
            // o LRPS2 procura a BIOS só ao ligar (retro_init, antes desta chegar): diz direto qual arquivo usar
            opcao("pcsx2_bios", barra ? barra + 1 : esperaArg); opcaoMudou = 1;
            if (getenv("KOF_DEBUG")) fprintf(stderr, "BIOS recebida: %s (%d bytes)\n", d, b->nbin);
        } else if (!strcmp(esperaBin, "cartao")) espalharSaves(b->bin, b->nbin);
        else if (jogoAberto && (noNucleo(), !nucleo.unserialize(b->bin, b->nbin))) { naJanela(); dizer("erro o PS2 recusou o estado"); }
        else if (jogoAberto) { naJanela(); dizer("carregou"); }
        free(b->texto); free(b->bin); free(b); return;
    }
    if (!strcmp(t, "estado")) {
        if (!jogoAberto) { dizer("erro nenhum jogo aberto"); return; }
        noNucleo(); size_t n = nucleo.serialize_size(); naJanela(); uint8_t *d = malloc(n);
        noNucleo(); int ok = nucleo.serialize(d, n); naJanela();
        if (ok) enviar(2, "E", 1, d, n); else dizer("erro o PS2 não salvou o estado");
        free(d); return;
    }
    if (!strcmp(t, "pedecartao")) { juntarSaves(); enviar(2, "M", 1, pacote, npacote); return; }
    if (!strncmp(t, "sistema ", 8)) { char k[256], v[256]; if (sscanf(t + 8, "%255s %255[^\n]", k, v) == 2) { opcao(k, v); opcaoMudou = 1; } return; }
    if (!strncmp(t, "teclas", 6)) {
        nteclas = 0; char *p = t + 6, cod[64]; int id, lidos;
        while (nteclas < 32 && sscanf(p, " %63[^:]:%d%n", cod, &id, &lidos) == 2) { teclas[nteclas].s = codigoParaTecla(cod); teclas[nteclas].id = id; nteclas++; p += lidos; }
        return;
    }
    if (!strncmp(t, "volume ", 7)) { volume = atof(t + 7); return; }
    if (!strcmp(t, "modo pagina") || !strcmp(t, "modo janela")) {
        modoPagina = t[5] == 'p'; pboCheio[0] = pboCheio[1] = 0; pboTam[0] = pboTam[1] = 0;
        bppPagina = getenv("KOF_RGBA") ? 4 : 3;
        if (modoPagina) SDL_HideWindow(janela); else if (visivel) mostrar(1);
        return;
    }
    if (!strcmp(t, "mostrar")) { mostrar(1); return; }
    if (!strcmp(t, "esconder")) { mostrar(0); return; }
    if (!strcmp(t, "reiniciar")) { if (jogoAberto) { noNucleo(); nucleo.reset(); naJanela(); } return; }
    if (!strcmp(t, "fechar") || !strcmp(t, "caiu")) { mostrar(0); if (jogoAberto) { noNucleo(); nucleo.unload_game(); naJanela(); jogoAberto = 0; } return; }
    if (!strcmp(t, "sair")) { rodando = 0; return; }
    if (!strncmp(t, "filtro\n", 7)) {
        char erro[2048] = "";
        GLuint pr = montarPrograma(t + 7, erro, sizeof erro);
        if (!pr) { dizer("log filtro não compilou aqui (fica sem filtro): %.300s", erro); pr = progPadrao; }
        else if (prog && prog != progPadrao) glDeleteProgram(prog);
        usarPrograma(pr); return;
    }
    if (!strncmp(t, "uni ", 4)) {
        char *p = t + 4; for (int i = 0; i < 4; i++) uniU[i] = strtof(p, &p);
        for (int i = 0; i < 52; i++) uniP[i] = strtof(p, &p);
        return;
    }
}

static void desenhar(void) {
    int jl, ja; SDL_GL_GetDrawableSize(janela, &jl, &ja);
    glBindFramebuffer(GL_FRAMEBUFFER, 0); glViewport(0, 0, jl, ja);
    glClearColor(0, 0, 0, 1); glClear(GL_COLOR_BUFFER_BIT);
    if (quadroL > 0) {
        // 4:3 no meio da janela, como a página faz
        double asp = av.geometry.aspect_ratio > 0 ? av.geometry.aspect_ratio : 4.0 / 3;
        int l = jl, a = (int)(jl / asp); if (a > ja) { a = ja; l = (int)(ja * asp); }
        glViewport((jl - l) / 2, (ja - a) / 2, l, a);
        glUseProgram(prog);
        glActiveTexture(GL_TEXTURE1); glBindTexture(GL_TEXTURE_2D, texQuadro[vez ^ 1]);
        glActiveTexture(GL_TEXTURE0); glBindTexture(GL_TEXTURE_2D, texQuadro[vez]);
        glUniform1i(uT, 0); glUniform1i(uTp, 1);
        glUniform4f(uTela, quadroL, quadroA, l, a);
        uniU[0] = (SDL_GetTicks() % 1000000) / 1000.0f;
        glUniform4fv(uU, 1, uniU); glUniform4fv(uP, 13, uniP);
        glBindVertexArray(vao); glDrawArrays(GL_TRIANGLE_STRIP, 0, 4);
    }
    SDL_GL_SwapWindow(janela);
}

int main(int argc, char **argv) {
#ifdef _WIN32
    // argumentos em UTF-8 (o argv do Windows vem na página de código local e estraga caminho com acento)
    { int n; wchar_t **w = CommandLineToArgvW(GetCommandLineW(), &n); static char *u[8]; argc = n < 8 ? n : 8;
      for (int i = 0; i < argc; i++) { u[i] = malloc(2048); WideCharToMultiByte(CP_UTF8, 0, w[i], -1, u[i], 2048, NULL, NULL); } argv = u; }
    WSADATA wsa; WSAStartup(MAKEWORD(2, 2), &wsa);
#endif
    if (argc < 3) { fprintf(stderr, "uso: kofnativo <núcleo.so> <pasta de dados>\n"); return 1; }
    snprintf(pastaDados, sizeof pastaDados, "%s", argv[2]); mkdir(pastaDados, 0755);
    snprintf(pastaSistema, sizeof pastaSistema, "%s/sistema", pastaDados); mkdir(pastaSistema, 0755);
    snprintf(pastaSaves, sizeof pastaSaves, "%s/saves", pastaDados); mkdir(pastaSaves, 0755);
    opcao("pcsx2_renderer", getenv("KOF_RENDERER") ? getenv("KOF_RENDERER") : "OpenGL");
    // o EE (a CPU do PS2) é o gargalo em PC modesto: no Ryzen 5 4600H o SotC ia a ~42 fps (70%) com a thread do EE em 90%;
    // o cycle skip leve deixou em 60 cravado (a página ainda pode trocar com "sistema pcsx2_ee_cycle_skip disabled")
    opcao("pcsx2_ee_cycle_skip", getenv("KOF_EE_SKIP") ? getenv("KOF_EE_SKIP") : "Mild Underclock");

#ifdef _WIN32
    HMODULE so = LoadLibraryW(largo(argv[1]));
    if (!so) { fprintf(stderr, "[kofnativo] não abri o núcleo (erro %lu)\n", GetLastError()); return 1; }
#define dlsym(m, n) (void *)GetProcAddress(m, n)
#else
    void *so = dlopen(argv[1], RTLD_NOW | RTLD_LOCAL);
    if (!so) { fprintf(stderr, "[kofnativo] não abri o núcleo: %s\n", dlerror()); return 1; }
#endif
#define PEGA(c, n) *(void **)&nucleo.c = dlsym(so, "retro_" n); if (!nucleo.c) { fprintf(stderr, "falta retro_%s\n", n); return 1; }
    PEGA(init, "init") PEGA(deinit, "deinit") PEGA(run, "run") PEGA(reset, "reset") PEGA(load_game, "load_game")
    PEGA(unload_game, "unload_game") PEGA(get_av_info, "get_system_av_info") PEGA(serialize_size, "serialize_size")
    PEGA(serialize, "serialize") PEGA(unserialize, "unserialize") PEGA(set_environment, "set_environment")
    PEGA(set_video_refresh, "set_video_refresh") PEGA(set_audio_sample, "set_audio_sample")
    PEGA(set_audio_sample_batch, "set_audio_sample_batch") PEGA(set_input_poll, "set_input_poll") PEGA(set_input_state, "set_input_state")

    // SIGTERM/SIGINT/SIGHUP = sair de verdade (o SDL transformava em SDL_QUIT, que aqui só pausa: o processo ficava órfão segurando a porta)
    SDL_SetHint(SDL_HINT_NO_SIGNAL_HANDLERS, "1");
    signal(SIGTERM, sair); signal(SIGINT, sair);
#ifdef SIGHUP
    signal(SIGHUP, sair);
#endif
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_AUDIO | SDL_INIT_GAMECONTROLLER) < 0) { fprintf(stderr, "SDL: %s\n", SDL_GetError()); return 1; }
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_PROFILE_MASK, SDL_GL_CONTEXT_PROFILE_CORE);
    SDL_GL_SetAttribute(SDL_GL_CONTEXT_MAJOR_VERSION, 3); SDL_GL_SetAttribute(SDL_GL_CONTEXT_MINOR_VERSION, 3);
    SDL_GL_SetAttribute(SDL_GL_DEPTH_SIZE, 24); SDL_GL_SetAttribute(SDL_GL_STENCIL_SIZE, 8);
    janela = SDL_CreateWindow("KOFstation", SDL_WINDOWPOS_CENTERED, SDL_WINDOWPOS_CENTERED, 960, 720,
        SDL_WINDOW_OPENGL | SDL_WINDOW_HIDDEN | SDL_WINDOW_RESIZABLE | (getenv("KOF_JANELA") ? 0 : SDL_WINDOW_FULLSCREEN_DESKTOP));
    if (!janela) { fprintf(stderr, "SDL janela: %s\n", SDL_GetError()); return 1; }
    SDL_GLContext ctx = ctxJanela = SDL_GL_CreateContext(janela);
    if (!ctx) { fprintf(stderr, "OpenGL 3.3: %s\n", SDL_GetError()); return 1; }
#ifdef _WIN32
    if (!gladLoadGLLoader((GLADloadproc)SDL_GL_GetProcAddress)) { fprintf(stderr, "OpenGL 3.3: o glad não carregou as funções\n"); return 1; }
#endif
    SDL_GL_SetSwapInterval(0);
    glGenTextures(2, texQuadro);
    for (int i = 0; i < 2; i++) { glBindTexture(GL_TEXTURE_2D, texQuadro[i]); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
        glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE); glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
        glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA8, 4, 4, 0, GL_RGBA, GL_UNSIGNED_BYTE, NULL); }
    static const float tri[] = {-1, -1, 1, -1, -1, 1, 1, 1};
    glGenVertexArrays(1, &vao); glBindVertexArray(vao); glGenBuffers(1, &vbo); glBindBuffer(GL_ARRAY_BUFFER, vbo);
    glBufferData(GL_ARRAY_BUFFER, sizeof tri, tri, GL_STATIC_DRAW); glEnableVertexAttribArray(0); glVertexAttribPointer(0, 2, GL_FLOAT, GL_FALSE, 0, 0);
    { char erro[1024]; progPadrao = montarPrograma("uniform sampler2D t, tp; uniform vec4 tela, u, p[13]; varying vec2 uv;\nvoid main() { gl_FragColor = vec4(texture2D(t, uv * tela.xy / tela.xy).rgb, 1.); }\n", erro, sizeof erro);
      if (!progPadrao) { fprintf(stderr, "shader padrão: %s\n", erro); return 1; } usarPrograma(progPadrao); }

    SDL_AudioSpec quer = {0}, tem; quer.freq = 48000; quer.format = AUDIO_S16SYS; quer.channels = 2; quer.samples = 1024;
    som = SDL_OpenAudioDevice(NULL, 0, &quer, &tem, 0);
    for (int i = 0; i < SDL_NumJoysticks() && !controle; i++) if (SDL_IsGameController(i)) controle = SDL_GameControllerOpen(i);

    nucleo.set_environment(ambiente); nucleo.set_video_refresh(videoQuadro); nucleo.set_audio_sample(somUm);
    nucleo.set_audio_sample_batch(somLote); nucleo.set_input_poll(lerEntrada); nucleo.set_input_state(estadoEntrada);
    nucleo.init();

    pthread_t th; pthread_create(&th, NULL, servidor, NULL); pthread_create(&th, NULL, enviarQuadros, NULL);
    fprintf(stderr, "[kofnativo] esperando o KOFstation em 127.0.0.1:%d\n", PORTA);
    rodando = 1;
    uint64_t freq = SDL_GetPerformanceFrequency(), proximo = SDL_GetPerformanceCounter(); unsigned contados = 0; uint32_t marco = SDL_GetTicks();
    while (rodando) {
        SDL_Event e;
        while (SDL_PollEvent(&e)) {
            if (e.type == SDL_QUIT) { mostrar(0); dizer("pausou"); }
            else if (e.type == SDL_KEYDOWN && !e.key.repeat && (e.key.keysym.scancode == SDL_SCANCODE_ESCAPE || e.key.keysym.scancode == SDL_SCANCODE_F1)) { mostrar(0); dizer("pausou"); }
            else if (e.type == SDL_CONTROLLERDEVICEADDED && !controle) controle = SDL_GameControllerOpen(e.cdevice.which);
            else if (e.type == SDL_CONTROLLERBUTTONDOWN && e.cbutton.button == SDL_CONTROLLER_BUTTON_GUIDE) { mostrar(0); dizer("pausou"); }
        }
        { const Uint8 *k = SDL_GetKeyboardState(NULL); uint32_t b = 0; for (int i = 0; i < nteclas; i++) if (teclas[i].s && k[teclas[i].s]) b |= 1u << teclas[i].id; padTeclado = visivel ? b : 0; }
        for (Cmd *c; (c = tirar());) { comando(c); free(c->texto); free(c->bin); free(c); }
        if (!jogoAberto || !visivel) { SDL_Delay(10); proximo = SDL_GetPerformanceCounter(); continue; }
        if (!ctxNucleo && temHw) glBindFramebuffer(GL_FRAMEBUFFER, fbo);
        noNucleo();
        nucleo.run();
        if (ctxNucleo) {   // a janela só lê o quadro depois que o GPU terminou o que o núcleo mandou
            GLsync s = glFenceSync(GL_SYNC_GPU_COMMANDS_COMPLETE, 0); glFlush(); naJanela();
            glWaitSync(s, 0, GL_TIMEOUT_IGNORED); glDeleteSync(s);
        } else glBindVertexArray(vao);   // sem contexto próprio o núcleo mexe no estado do OpenGL: devolve o nosso
        copiarQuadroHw();
        if (quadroNovo) { quadroNovo = 0; if (modoPagina) lerQuadroPagina(); else desenhar(); contados++; }
        if (SDL_GetTicks() - marco >= 1000) {
            dizer("quadros %u", contados); contados = 0; marco = SDL_GetTicks();
            if (modoPagina && getenv("KOF_DEBUG")) fprintf(stderr, "[kofnativo] quadros pulados no envio: %u\n", qPulados);
        }
        // ritmo: o fps do jogo, sem deixar o som acumular (mais de 120 ms na fila = espera)
        double fps = av.timing.fps > 1 ? av.timing.fps : 59.94;
        proximo += (uint64_t)(freq / fps);
        uint64_t agora = SDL_GetPerformanceCounter();
        if (agora < proximo) SDL_Delay((uint32_t)((proximo - agora) * 1000 / freq));
        else if (agora - proximo > freq / 4) proximo = agora;   // ficou muito pra trás: não tenta compensar
        while (som && SDL_GetQueuedAudioSize(som) > 48000 * 4 * 12 / 100) SDL_Delay(1);
    }
    noNucleo();
    if (jogoAberto) nucleo.unload_game();
    nucleo.deinit();
    return 0;
}
