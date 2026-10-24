// Ponte nativa dos consoles pesados no Android (PlayStation e Nintendo 64): liga um núcleo libretro já compilado pra ARM64
// (os builds do libretro que o Lemuroid distribui: PCSX-ReARMed com o recompilador ari64, Mupen64Plus-Next com GLideN64)
// ao Java do app. Compila uma vez por console: -DCLASSE=Ps1 ou -DCLASSE=N64 -DKOF_GL (o N64 desenha com OpenGL ES 3). Faz o papel da ponte.cpp do WebAssembly: chama as
// funções retro_* e entrega a imagem (RGBA) e o som (16 bits estéreo) em buffers diretos que o Java lê sem cópia.
// Compila SEM o NDK (android/nativo/construir.sh): só o clang do Ubuntu, o jni.h do JDK e declarações próprias da libc.
// Também compila pro Linux daqui, pros testes (testes/android/ps1-nativo.sh).
#include <stdarg.h>
#include <stddef.h>
#include <stdint.h>
#include "jni.h"
#include "libretro.h"

// o pouco da libc que a ponte usa (no Android vem da libc.so do aparelho)
typedef struct ARQ ARQ;
ARQ *fopen(const char *, const char *);
size_t fread(void *, size_t, size_t, ARQ *);
size_t fwrite(const void *, size_t, size_t, ARQ *);
int fclose(ARQ *);
int snprintf(char *, size_t, const char *, ...);
int vsnprintf(char *, size_t, const char *, va_list);
void *memcpy(void *, const void *, size_t);
void *memset(void *, int, size_t);
int memcmp(const void *, const void *, size_t);
int strcmp(const char *, const char *);
size_t strlen(const char *);
char *strncpy(char *, const char *, size_t);
char *strstr(const char *, const char *);
size_t strcspn(const char *, const char *);
char *strcpy(char *, const char *);
#ifdef __ANDROID__
int __android_log_print(int, const char *, const char *, ...);
#define ANOTAR(...) __android_log_print(4, "KOFps1", __VA_ARGS__)
#else
int printf(const char *, ...);
#define ANOTAR(...) (printf(__VA_ARGS__), printf("\n"))
#endif

// ---- estado da ponte ----
static char dirSistema[512], dirSaves[512], arqCartao[600], opcoes[4096];
static enum retro_pixel_format formato = RETRO_PIXEL_FORMAT_0RGB1555;
static uint8_t *video;               // buffer direto do Java: RGBA, até 1024x512
static int16_t *som;                  // buffer direto do Java: estéreo intercalado
static int videoMax, somMax, larg, alt, somN, novoQuadro;
static uint32_t botoes;               // RETRO_DEVICE_ID_JOYPAD_* em bits; 16-19 = C cima/baixo/esquerda/direita (N64)
#ifdef KOF_GL
// N64: o núcleo desenha com OpenGL ES 3 no contexto da GLSurfaceView do Java (framebuffer 0); a superfície tem o tamanho
// exato da imagem do jogo e o Android escala pra tela
void *eglGetProcAddress(const char *);
static struct retro_hw_render_callback hw;
static int temHw, hwPronto;
static uintptr_t fbAtual(void) { return 0; }
static retro_proc_address_t procGl(const char *s) { return (retro_proc_address_t)eglGetProcAddress(s); }
#endif
static uint8_t cartaoVisto[128 * 1024];
static int carregado;

// o padrão de cada opção, como o núcleo declara (SET_VARIABLES: "Descrição; padrão|outro|..."): é o que o RetroArch
// entrega quando ninguém escolheu, e o Mupen64Plus sem isso fica com a emulação do framebuffer desligada
#define MAX_PADROES 256
static char padraoChave[MAX_PADROES][64], padraoValor[MAX_PADROES][48];
static int nPadroes;
static void guardarPadroes(const struct retro_variable *v) {
    for (; v && v->key; v++) {
        const char *p = v->value ? strstr(v->value, "; ") : NULL;
        if (!p || nPadroes >= MAX_PADROES || strlen(v->key) >= sizeof padraoChave[0]) continue;
        p += 2;
        size_t n = strcspn(p, "|");
        if (n >= sizeof padraoValor[0]) continue;
        int i = 0;
        while (i < nPadroes && strcmp(padraoChave[i], v->key)) i++;
        if (i == nPadroes) nPadroes++;
        strcpy(padraoChave[i], v->key); memcpy(padraoValor[i], p, n); padraoValor[i][n] = 0;
    }
}

static const char *valorOpcao(const char *chave) {   // opcoes = "chave=valor\n..."
    static char v[256];
    size_t n = strlen(chave);
    for (const char *p = opcoes; *p; ) {
        const char *fim = p; while (*fim && *fim != '\n') fim++;
        if ((size_t)(fim - p) > n && p[n] == '=' && !memcmp(p, chave, n)) {
            size_t k = fim - p - n - 1; if (k > 255) k = 255;
            memcpy(v, p + n + 1, k); v[k] = 0; return v;
        }
        p = *fim ? fim + 1 : fim;
    }
    for (int i = 0; i < nPadroes; i++) if (!strcmp(padraoChave[i], chave)) return padraoValor[i];
    return NULL;
}

static void anotar(enum retro_log_level nivel, const char *fmt, ...) {
    char b[512]; va_list ap; va_start(ap, fmt); vsnprintf(b, sizeof b, fmt, ap); va_end(ap);
    if (nivel >= RETRO_LOG_WARN) ANOTAR("%s", b);
    (void)nivel;
}

static bool ambiente(unsigned cmd, void *dado) {
    switch (cmd) {
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY: *(const char **)dado = dirSistema; return true;
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: *(const char **)dado = dirSaves; return true;
    case RETRO_ENVIRONMENT_GET_CAN_DUPE: *(bool *)dado = true; return true;
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: formato = *(const enum retro_pixel_format *)dado; return true;
    case RETRO_ENVIRONMENT_GET_INPUT_BITMASKS: return true;
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: ((struct retro_log_callback *)dado)->log = anotar; return true;
    case RETRO_ENVIRONMENT_GET_VARIABLE: {
        struct retro_variable *v = dado;
        v->value = v->key ? valorOpcao(v->key) : NULL;
        return v->value != NULL;
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: *(bool *)dado = false; return true;
    case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION: *(unsigned *)dado = 0; return true;
    case RETRO_ENVIRONMENT_SET_VARIABLES: guardarPadroes(dado); return true;
#ifdef KOF_GL
    case RETRO_ENVIRONMENT_GET_PREFERRED_HW_RENDER: *(unsigned *)dado = RETRO_HW_CONTEXT_OPENGLES3; return true;
    case RETRO_ENVIRONMENT_SET_HW_RENDER: {
        struct retro_hw_render_callback *h = dado;
        if (h->context_type != RETRO_HW_CONTEXT_OPENGLES3 && h->context_type != RETRO_HW_CONTEXT_OPENGLES2) return false;
        h->get_current_framebuffer = fbAtual; h->get_proc_address = procGl;
        hw = *h; temHw = 1; hwPronto = 0;
        return true;
    }
#endif
    default: return false;
    }
}

static void quadro(const void *d, unsigned w, unsigned h, size_t pitch) {
#ifdef KOF_GL
    if (d == RETRO_HW_FRAME_BUFFER_VALID) { larg = w; alt = h; novoQuadro = 1; return; }   // já está na tela (OpenGL)
#endif
    if (!d || !video || (int)(w * h) > videoMax) return;   // repetido (CAN_DUPE): fica o anterior
    larg = w; alt = h; novoQuadro = 1;
    uint8_t *o = video;
    for (unsigned y = 0; y < h; y++) {
        const uint8_t *l = (const uint8_t *)d + y * pitch;
        if (formato == RETRO_PIXEL_FORMAT_XRGB8888) {
            const uint32_t *p = (const uint32_t *)l;
            for (unsigned x = 0; x < w; x++, o += 4) { uint32_t c = p[x]; o[0] = c >> 16; o[1] = c >> 8; o[2] = c; o[3] = 255; }
        } else if (formato == RETRO_PIXEL_FORMAT_RGB565) {
            const uint16_t *p = (const uint16_t *)l;
            for (unsigned x = 0; x < w; x++, o += 4) { uint16_t c = p[x]; o[0] = ((c >> 11) & 31) * 255 / 31; o[1] = ((c >> 5) & 63) * 255 / 63; o[2] = (c & 31) * 255 / 31; o[3] = 255; }
        } else {
            const uint16_t *p = (const uint16_t *)l;
            for (unsigned x = 0; x < w; x++, o += 4) { uint16_t c = p[x]; o[0] = ((c >> 10) & 31) * 255 / 31; o[1] = ((c >> 5) & 31) * 255 / 31; o[2] = (c & 31) * 255 / 31; o[3] = 255; }
        }
    }
}
static size_t somLote(const int16_t *d, size_t quadros) {
    size_t k = quadros * 2;
    if (som && somN + (int)k <= somMax) { memcpy(som + somN, d, k * 2); somN += k; }
    return quadros;
}
static void somUm(int16_t e, int16_t dir) { int16_t a[2] = { e, dir }; somLote(a, 1); }
static void nadaInput(void) {}
static int16_t eixo(int menos, int mais) { return (int16_t)((mais ? 0x7FFF : 0) - (menos ? 0x7FFF : 0)); }
static int16_t estadoInput(unsigned porta, unsigned disp, unsigned idx, unsigned id) {
    if (porta) return 0;
#ifdef KOF_GL
    // N64: o direcional da tela vira o analógico (inclinação total) e os bits 16-19, os botões C (analógico direito)
    if (disp == RETRO_DEVICE_ANALOG) {
        uint32_t b = botoes;
        if (idx == RETRO_DEVICE_INDEX_ANALOG_LEFT)
            return id == RETRO_DEVICE_ID_ANALOG_X ? eixo(b >> RETRO_DEVICE_ID_JOYPAD_LEFT & 1, b >> RETRO_DEVICE_ID_JOYPAD_RIGHT & 1)
                                                  : eixo(b >> RETRO_DEVICE_ID_JOYPAD_UP & 1, b >> RETRO_DEVICE_ID_JOYPAD_DOWN & 1);
        return id == RETRO_DEVICE_ID_ANALOG_X ? eixo(b >> 18 & 1, b >> 19 & 1) : eixo(b >> 16 & 1, b >> 17 & 1);
    }
    uint32_t pad = botoes & 0xFFFF;   // o direcional vale também como o direcional do N64 (menus usam ele)
#else
    uint32_t pad = botoes & 0xFFFF;
#endif
    if (disp != RETRO_DEVICE_JOYPAD) return 0;
    if (id == RETRO_DEVICE_ID_JOYPAD_MASK) return (int16_t)pad;
    return (pad >> id) & 1;
    (void)idx;
}

// cartão de memória 1 = SAVE_RAM do PCSX: lido do arquivo ao abrir, gravado quando muda
static void cartaoLer(void) {
    uint8_t *m = retro_get_memory_data(RETRO_MEMORY_SAVE_RAM); size_t n = retro_get_memory_size(RETRO_MEMORY_SAVE_RAM);
    if (!m || !n || n > sizeof cartaoVisto) return;
    ARQ *f = fopen(arqCartao, "rb");
    if (f) { fread(m, 1, n, f); fclose(f); }
    memcpy(cartaoVisto, m, n);
}
static int cartaoGravar(void) {
    uint8_t *m = retro_get_memory_data(RETRO_MEMORY_SAVE_RAM); size_t n = retro_get_memory_size(RETRO_MEMORY_SAVE_RAM);
    if (!m || !n || n > sizeof cartaoVisto || !memcmp(m, cartaoVisto, n)) return 0;
    ARQ *f = fopen(arqCartao, "wb");
    if (!f) return 0;
    fwrite(m, 1, n, f); fclose(f);
    memcpy(cartaoVisto, m, n);
    return 1;
}

#ifndef CLASSE
#define CLASSE Ps1
#endif
#define JX(c, n) Java_dev_kofnes_android_##c##_##n
#define JY(c, n) JX(c, n)
#define J(nome) JY(CLASSE, nome)
static void texto(JNIEnv *env, jstring s, char *dest, size_t max) {
    const char *c = (*env)->GetStringUTFChars(env, s, NULL);
    strncpy(dest, c, max - 1); dest[max - 1] = 0;
    (*env)->ReleaseStringUTFChars(env, s, c);
}

// buffers diretos (ByteBuffer.allocateDirect) do Java: imagem RGBA e som
JNIEXPORT void JNICALL J(buffers)(JNIEnv *env, jclass c, jobject v, jobject s) {
    video = (*env)->GetDirectBufferAddress(env, v); videoMax = (int)((*env)->GetDirectBufferCapacity(env, v) / 4);
    som = (*env)->GetDirectBufferAddress(env, s); somMax = (int)((*env)->GetDirectBufferCapacity(env, s) / 2);
    (void)c;
}

// abre o jogo; devolve "" ou o motivo do erro. info[] = largura, altura, fps*1000, taxa de áudio
JNIEXPORT jstring JNICALL J(abrir)(JNIEnv *env, jclass c, jstring jogo, jstring sistema, jstring saves, jstring cartao, jstring ops, jintArray info) {
    static int iniciado;
    char caminho[1024];
    texto(env, jogo, caminho, sizeof caminho); texto(env, sistema, dirSistema, sizeof dirSistema);
    texto(env, saves, dirSaves, sizeof dirSaves); texto(env, cartao, arqCartao, sizeof arqCartao); texto(env, ops, opcoes, sizeof opcoes);
    if (carregado) { cartaoGravar(); retro_unload_game(); carregado = 0; }
    if (!iniciado) {
        retro_set_environment(ambiente); retro_set_video_refresh(quadro); retro_set_audio_sample(somUm);
        retro_set_audio_sample_batch(somLote); retro_set_input_poll(nadaInput); retro_set_input_state(estadoInput);
        retro_init(); iniciado = 1;
    }
    struct retro_game_info g = { caminho, NULL, 0, NULL };
#ifdef KOF_GL
    hwPronto = 0;
#endif
    if (!retro_load_game(&g)) return (*env)->NewStringUTF(env, "o núcleo nativo não abriu esse jogo");
    retro_set_controller_port_device(0, RETRO_DEVICE_JOYPAD);
    carregado = 1; cartaoLer();
    struct retro_system_av_info av; retro_get_system_av_info(&av);
    jint i[4] = { (jint)av.geometry.base_width, (jint)av.geometry.base_height, (jint)(av.timing.fps * 1000), (jint)av.timing.sample_rate };
    (*env)->SetIntArrayRegion(env, info, 0, 4, i);
    (void)c;
    return (*env)->NewStringUTF(env, "");
}

// roda um quadro; devolve quantas amostras de som (int16) vieram. Imagem nova: largura()/altura() > 0
JNIEXPORT jint JNICALL J(rodar)(JNIEnv *env, jclass c, jint pad) {
    if (!carregado) return 0;
    static int vez;
    botoes = (uint32_t)pad; somN = 0; novoQuadro = 0;
#ifdef KOF_GL
    if (temHw && !hwPronto && hw.context_reset) { hw.context_reset(); hwPronto = 1; }   // já na thread do OpenGL
#endif
    retro_run();
    if (++vez % 300 == 0) cartaoGravar();   // ~5 s
    (void)env; (void)c;
    return somN;
}
JNIEXPORT jint JNICALL J(largura)(JNIEnv *env, jclass c) { (void)env; (void)c; return novoQuadro ? larg : 0; }
JNIEXPORT jint JNICALL J(altura)(JNIEnv *env, jclass c) { (void)env; (void)c; return alt; }
JNIEXPORT void JNICALL J(reiniciar)(JNIEnv *env, jclass c) { (void)env; (void)c; if (carregado) retro_reset(); }
JNIEXPORT jboolean JNICALL J(gravarCartao)(JNIEnv *env, jclass c) { (void)env; (void)c; return carregado && cartaoGravar(); }
JNIEXPORT void JNICALL J(fechar)(JNIEnv *env, jclass c) {
    (void)env; (void)c;
    if (carregado) { cartaoGravar(); retro_unload_game(); carregado = 0; }
}

// savestate: o app guarda os bytes como nos outros consoles
JNIEXPORT jbyteArray JNICALL J(salvarEstado)(JNIEnv *env, jclass c) {
    (void)c;
    if (!carregado) return NULL;
    size_t n = retro_serialize_size();
    jbyteArray a = (*env)->NewByteArray(env, (jsize)n);
    jbyte *p = (*env)->GetByteArrayElements(env, a, NULL);
    bool ok = retro_serialize(p, n);
    (*env)->ReleaseByteArrayElements(env, a, p, 0);
    return ok ? a : NULL;
}
JNIEXPORT jboolean JNICALL J(carregarEstado)(JNIEnv *env, jclass c, jbyteArray a) {
    (void)c;
    if (!carregado) return 0;
    jsize n = (*env)->GetArrayLength(env, a);
    jbyte *p = (*env)->GetByteArrayElements(env, a, NULL);
    bool ok = retro_unserialize(p, (size_t)n);
    (*env)->ReleaseByteArrayElements(env, a, p, JNI_ABORT);
    return ok;
}
