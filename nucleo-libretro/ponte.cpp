// Ponte entre um núcleo libretro (Snes9x, Gambatte, ...) e o JavaScript do KOFstation.
// Faz o papel do "frontend" do libretro: responde às perguntas do núcleo, guarda o quadro de vídeo,
// o áudio e os botões, e expõe poucas funções simples (lr_*) pro JS chamar.
// É a mesma ponte pra qualquer núcleo: tamanho da tela, fps e taxa de áudio vêm de retro_get_system_av_info.
// Cada núcleo tem a sua licença (veja LICENCAS.md).
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <stdarg.h>
#include <sys/stat.h>
#include <emscripten.h>
#include "libretro.h"
#ifdef KOF_GL
// Núcleo que desenha com OpenGL ES (Nintendo 64): no navegador vira WebGL2 num canvas escondido (#kof-gl, o nucleo.js cria). Depois de
// cada quadro a ponte lê a imagem pronta (glReadPixels) pro mesmo buffer RGBA dos outros núcleos: o app trata igual e os
// filtros e molduras continuam valendo
#include <emscripten/html5.h>
#include <GLES3/gl3.h>
static struct retro_hw_render_callback hw;
static bool temHw = false;
static EMSCRIPTEN_WEBGL_CONTEXT_HANDLE ctxGl = 0;
static uintptr_t fbAtual() { return 0; }
extern "C" void* eglGetProcAddress(const char*);
// mapear buffer: o WebGL2 não tem, e o emscripten só imita o mapeamento de escrita. O GLideN64 (cópia da imagem de volta
// pra memória do N64) mapeia pra LER: aqui uma cópia na memória do wasm, lida com getBufferSubData e escrita de volta
// com glBufferSubData. Definidas com o nome do OpenGL, valem tanto pra chamada direta quanto pelo procGl
static struct { GLenum alvo; GLintptr ini; GLsizeiptr n; GLbitfield modo; uint8_t* p; } mapas[4];
extern "C" void* glMapBufferRange(GLenum alvo, GLintptr ini, GLsizeiptr n, GLbitfield modo) {
    int i = 0;
    while (i < 4 && mapas[i].p && mapas[i].alvo != alvo) i++;
    if (i == 4) return nullptr;
    free(mapas[i].p);
    mapas[i] = { alvo, ini, n, modo, (uint8_t*)malloc(n > 0 ? n : 1) };
    if (modo & GL_MAP_READ_BIT) EM_ASM({ GLctx.getBufferSubData($0, $1, HEAPU8, $2, $3); }, alvo, ini, mapas[i].p, n);
    return mapas[i].p;
}
extern "C" void glFlushMappedBufferRange(GLenum alvo, GLintptr ini, GLsizeiptr n) {
    for (auto& m : mapas) if (m.p && m.alvo == alvo) glBufferSubData(alvo, m.ini + ini, n, m.p + ini);
}
extern "C" GLboolean glUnmapBuffer(GLenum alvo) {
    for (auto& m : mapas) if (m.p && m.alvo == alvo) {
        if ((m.modo & GL_MAP_WRITE_BIT) && !(m.modo & GL_MAP_FLUSH_EXPLICIT_BIT)) glBufferSubData(alvo, m.ini, m.n, m.p);
        free(m.p); m.p = nullptr;
        return GL_TRUE;
    }
    return GL_FALSE;
}
static retro_proc_address_t procGl(const char* s) {
    if (!strncmp(s, "glMapBufferRange", 16)) return (retro_proc_address_t)glMapBufferRange;   // também com EXT/OES no fim
    if (!strncmp(s, "glFlushMappedBufferRange", 24)) return (retro_proc_address_t)glFlushMappedBufferRange;
    if (!strncmp(s, "glUnmapBuffer", 13)) return (retro_proc_address_t)glUnmapBuffer;
    void* f = emscripten_webgl_get_proc_address(s);
    if (!f) f = eglGetProcAddress(s);
    if (!f) printf("OpenGL sem a função %s\n", s);
    return (retro_proc_address_t)f;
}
// o Mupen64Plus pede duas funções que o WebAssembly não tem (do renderizador em thread e do tratamento de sinais, ambos
// desligados aqui): versões vazias
#include <semaphore.h>
#include <signal.h>
#include <errno.h>
extern "C" int sem_timedwait(sem_t*, const struct timespec*) { errno = ETIMEDOUT; return -1; }
extern "C" int sigaltstack(const stack_t*, stack_t*) { return 0; }
#endif

extern "C" {

static uint32_t* quadro = nullptr;     // RGBA (formato do canvas), até maxL x maxA
static unsigned maxL = 0, maxA = 0, larg = 0, alt = 0;
static int copiar = 1;
static uint32_t botoes = 0;            // máscara RETRO_DEVICE_ID_JOYPAD_*; 16-19 = C cima/baixo/esquerda/direita (N64)
static const unsigned AUDIO_MAX = 32768;   // quadros estéreo por retro_run (sobra até pra núcleo que manda áudio em lotes)
static int16_t audio[AUDIO_MAX * 2];
static unsigned audioQuadros = 0;
static unsigned long totalAudio = 0;
static int formato = RETRO_PIXEL_FORMAT_0RGB1555;   // padrão do libretro até o núcleo pedir outro
static struct retro_system_av_info av;
#ifdef RETRO_ENVIRONMENT_GET_GAME_INFO_EXT
// a ROM vai pela memória: núcleos novos (ex.: FCEUmm) pedem o jogo por aqui em vez de abrir um arquivo
static struct retro_game_info_ext jogoExt;
#endif
// av_info pro JS: [largura base, altura base, largura máx, altura máx, proporção, fps, taxa de áudio]
static double infoJs[7];

// opções do núcleo (RETRO_ENVIRONMENT_GET_VARIABLE): o JS define com lr_var("chave", "valor"); quem não foi definido,
// o núcleo usa o padrão dele. Mudou alguma: o núcleo fica sabendo pelo GET_VARIABLE_UPDATE no próximo quadro
static const int MAX_VARS = 32;
static char varChave[MAX_VARS][64], varValor[MAX_VARS][64];
static int nVars = 0;
static bool varsMudaram = false;
// o padrão de cada opção, como o núcleo declara (SET_VARIABLES: "Descrição; padrão|outro|..."): o RetroArch entrega esse
// valor quando o usuário não escolheu nada, e tem núcleo (Mupen64Plus) cujo valor interno sem isso é outro
static const int MAX_PADROES = 256;
static char padraoChave[MAX_PADROES][64], padraoValor[MAX_PADROES][48];
static int nPadroes = 0;
static void guardarPadroes(const struct retro_variable* v) {
    for (; v && v->key; v++) {
        const char* p = v->value ? strstr(v->value, "; ") : nullptr;
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
static const char* lerVar(const char* k) {
    for (int i = 0; i < nVars; i++) if (!strcmp(varChave[i], k)) return varValor[i];
    for (int i = 0; i < nPadroes; i++) if (!strcmp(padraoChave[i], k)) return padraoValor[i];
    return nullptr;
}

static void guardarAv(const struct retro_system_av_info* i) {
    av = *i;
    unsigned l = av.geometry.max_width, a = av.geometry.max_height;
    if (l * a > maxL * maxA) { free(quadro); quadro = (uint32_t*)malloc((size_t)l * a * 4); maxL = l; maxA = a; }
}

static inline uint32_t de5(uint32_t v) { return (v << 3) | (v >> 2); }
static retro_audio_buffer_status_callback_t statusAudio = nullptr;
static void video(const void* dados, unsigned w, unsigned h, size_t pitch) {
#ifdef KOF_GL
    if (dados == RETRO_HW_FRAME_BUFFER_VALID) {   // a imagem está no canvas: lê de baixo pra cima (OpenGL) e desvira
        if ((size_t)w * h > (size_t)maxL * maxA) return;
        larg = w; alt = h;
        if (!copiar) return;
        static uint32_t* tmp = nullptr; static size_t tmpN = 0;
        if (tmpN < (size_t)w * h) { free(tmp); tmp = (uint32_t*)malloc((size_t)w * h * 4); tmpN = (size_t)w * h; }
        while (glGetError() != GL_NO_ERROR) {}
        // o GLideN64 pode deixar um buffer de leitura (PBO) e um framebuffer de leitura ligados: com eles o WebGL2 recusa a leitura
        GLint pbo = 0, rfb = 0; glGetIntegerv(GL_PIXEL_PACK_BUFFER_BINDING, &pbo); glGetIntegerv(GL_READ_FRAMEBUFFER_BINDING, &rfb);
        glBindBuffer(GL_PIXEL_PACK_BUFFER, 0); glBindFramebuffer(GL_READ_FRAMEBUFFER, 0); glPixelStorei(GL_PACK_ALIGNMENT, 4);
        glReadPixels(0, 0, w, h, GL_RGBA, GL_UNSIGNED_BYTE, tmp);
        glBindBuffer(GL_PIXEL_PACK_BUFFER, pbo); glBindFramebuffer(GL_READ_FRAMEBUFFER, rfb);
        for (unsigned y = 0; y < h; y++) memcpy(quadro + (size_t)y * w, tmp + (size_t)(h - 1 - y) * w, (size_t)w * 4);
        return;
    }
#endif
    if (!dados) return;                 // quadro repetido (CAN_DUPE): mantém o anterior
    if ((size_t)w * h > (size_t)maxL * maxA) return;
    larg = w; alt = h;
    if (!copiar) return;
    for (unsigned y = 0; y < h; y++) {
        uint32_t* d = quadro + y * w;
        if (formato == RETRO_PIXEL_FORMAT_RGB565) {
            const uint16_t* o = (const uint16_t*)((const uint8_t*)dados + y * pitch);
            for (unsigned x = 0; x < w; x++) {
                uint32_t c = o[x], r = (c >> 11) & 31, g = (c >> 5) & 63, b = c & 31;
                d[x] = 0xFF000000u | (de5(b) << 16) | (((g << 2) | (g >> 4)) << 8) | de5(r);
            }
        } else if (formato == RETRO_PIXEL_FORMAT_0RGB1555) {
            const uint16_t* o = (const uint16_t*)((const uint8_t*)dados + y * pitch);
            for (unsigned x = 0; x < w; x++) {
                uint32_t c = o[x], r = (c >> 10) & 31, g = (c >> 5) & 31, b = c & 31;
                d[x] = 0xFF000000u | (de5(b) << 16) | (de5(g) << 8) | de5(r);
            }
        } else {
            const uint32_t* o = (const uint32_t*)((const uint8_t*)dados + y * pitch);
            for (unsigned x = 0; x < w; x++) { uint32_t c = o[x]; d[x] = 0xFF000000u | ((c & 0xFF) << 16) | (c & 0xFF00) | ((c >> 16) & 0xFF); }
        }
    }
}
static size_t amostras(const int16_t* d, size_t n) {
    if (audioQuadros + n <= AUDIO_MAX) { memcpy(audio + audioQuadros * 2, d, n * 4); audioQuadros += n; }
    totalAudio += n;
    return n;
}
static void amostra(int16_t e, int16_t dir) { int16_t p[2] = { e, dir }; amostras(p, 1); }
static void sondar() {}
static int16_t eixo(int menos, int mais) { return (int16_t)((mais ? 0x7FFF : 0) - (menos ? 0x7FFF : 0)); }
static int16_t eixos[4];               // analógicos de verdade (controle físico ou de toque): esquerdo X/Y, direito X/Y
static int16_t entrada(unsigned porta, unsigned dispositivo, unsigned idx, unsigned id) {
    if (porta != 0) return 0;
    if ((dispositivo & RETRO_DEVICE_MASK) == RETRO_DEVICE_ANALOG) {
        if (idx > RETRO_DEVICE_INDEX_ANALOG_RIGHT) return 0;
        int k = idx == RETRO_DEVICE_INDEX_ANALOG_LEFT ? 0 : 2;
        if (eixos[k] || eixos[k + 1]) return eixos[k + (id == RETRO_DEVICE_ID_ANALOG_Y)];
#ifdef KOF_GL
        // N64 sem analógico mexido: o direcional vira o analógico (inclinação total) e os bits 16-19, os botões C
        uint32_t b = botoes;
        if (k == 0)
            return id == RETRO_DEVICE_ID_ANALOG_X ? eixo(b >> RETRO_DEVICE_ID_JOYPAD_LEFT & 1, b >> RETRO_DEVICE_ID_JOYPAD_RIGHT & 1)
                                                  : eixo(b >> RETRO_DEVICE_ID_JOYPAD_UP & 1, b >> RETRO_DEVICE_ID_JOYPAD_DOWN & 1);
        return id == RETRO_DEVICE_ID_ANALOG_X ? eixo(b >> 18 & 1, b >> 19 & 1) : eixo(b >> 16 & 1, b >> 17 & 1);
#else
        return 0;
#endif
    }
    uint32_t pad = botoes & 0xFFFF;   // no N64 o direcional vale também como o direcional do controle (menus usam ele)
    if ((dispositivo & RETRO_DEVICE_MASK) != RETRO_DEVICE_JOYPAD) return 0;
    if (id == RETRO_DEVICE_ID_JOYPAD_MASK) return (int16_t)pad;
    return (pad >> id) & 1;
}
static void registro(enum retro_log_level, const char* fmt, ...) { va_list a; va_start(a, fmt); vprintf(fmt, a); va_end(a); }
static bool ambiente(unsigned cmd, void* dado) {
    switch (cmd) {
#ifdef KOF_GL
    case RETRO_ENVIRONMENT_GET_PREFERRED_HW_RENDER: *(unsigned*)dado = RETRO_HW_CONTEXT_OPENGLES3; return true;
    case RETRO_ENVIRONMENT_SET_HW_RENDER: {
        struct retro_hw_render_callback* h = (struct retro_hw_render_callback*)dado;
        if (h->context_type != RETRO_HW_CONTEXT_OPENGLES3 && h->context_type != RETRO_HW_CONTEXT_OPENGLES2) return false;
        h->get_current_framebuffer = fbAtual; h->get_proc_address = procGl;
        hw = *h; temHw = true;
        return true;
    }
#endif
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT: {
        int f = *(enum retro_pixel_format*)dado;
        if (f != RETRO_PIXEL_FORMAT_RGB565 && f != RETRO_PIXEL_FORMAT_XRGB8888 && f != RETRO_PIXEL_FORMAT_0RGB1555) return false;
        formato = f; return true;
    }
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: ((struct retro_log_callback*)dado)->log = registro; return true;
    // BIOS e outros arquivos de sistema: o JS grava em /sistema (lr_arquivo) antes de carregar o jogo
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY: *(const char**)dado = "/sistema"; return true;
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY: *(const char**)dado = "/"; return true;
    case RETRO_ENVIRONMENT_GET_CAN_DUPE: *(bool*)dado = true; return true;
    // pular quadro quando atrasa (PCSX "auto"): o núcleo pergunta como está o áudio; o JS avisa pelo lr_audio_status
    case RETRO_ENVIRONMENT_SET_AUDIO_BUFFER_STATUS_CALLBACK:
        statusAudio = dado ? ((const struct retro_audio_buffer_status_callback*)dado)->callback : nullptr; return true;
#ifdef RETRO_ENVIRONMENT_GET_GAME_INFO_EXT
    case RETRO_ENVIRONMENT_GET_GAME_INFO_EXT: *(const struct retro_game_info_ext**)dado = &jogoExt; return jogoExt.data != nullptr;
    case RETRO_ENVIRONMENT_SET_CONTENT_INFO_OVERRIDE: return true;
#endif
    case RETRO_ENVIRONMENT_GET_VARIABLE: {
        struct retro_variable* v = (struct retro_variable*)dado;
        v->value = v->key ? lerVar(v->key) : nullptr;
        return v->value != nullptr;
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: *(bool*)dado = varsMudaram; varsMudaram = false; return true;
    case RETRO_ENVIRONMENT_GET_INPUT_BITMASKS: return true;
    case RETRO_ENVIRONMENT_SET_SYSTEM_AV_INFO: guardarAv((const struct retro_system_av_info*)dado); return true;
    case RETRO_ENVIRONMENT_SET_GEOMETRY: {
        struct retro_system_av_info n = av; n.geometry = *(const struct retro_game_geometry*)dado;
        if (n.geometry.max_width < maxL) n.geometry.max_width = maxL;
        if (n.geometry.max_height < maxA) n.geometry.max_height = maxA;
        guardarAv(&n); return true;
    }
#ifdef KOF_GL
    // só o N64 (como na ponte nativa): os outros núcleos sempre rodaram sem os padrões declarados
    case RETRO_ENVIRONMENT_SET_VARIABLES: guardarPadroes((const struct retro_variable*)dado); return true;
#else
    case RETRO_ENVIRONMENT_SET_VARIABLES: return true;
#endif
    case RETRO_ENVIRONMENT_SET_PERFORMANCE_LEVEL:
    case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS: case RETRO_ENVIRONMENT_SET_CONTROLLER_INFO:
    case RETRO_ENVIRONMENT_SET_SUPPORT_NO_GAME: case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_DISPLAY:
        return true;
    case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION: *(unsigned*)dado = 0; return true;
    default: return false;
    }
}

// sonda do osciloscópio/mudo por canal (jukebox): o núcleo remendado (ex.: gambatte-sonda.patch) define esses
// símbolos de verdade; nos outros valem estes vazios (kof_canais = 0: o núcleo não tem sonda)
__attribute__((weak)) int kof_sonda = 0;
__attribute__((weak)) unsigned kof_mudas = 0;
__attribute__((weak)) int16_t kof_onda[1] = { 0 };
__attribute__((weak)) unsigned kof_ondaPos = 0;
__attribute__((weak)) int kof_canais = 0;
__attribute__((weak)) unsigned kof_ondaPosC[16] = { 0 };   // núcleos com canais em ritmos diferentes (Mega Drive: FM e PSG)
__attribute__((weak)) int kof_temPosCanal = 0;
EMSCRIPTEN_KEEPALIVE int lr_canais() { return kof_canais; }          // quantos canais a sonda enxerga (Game Boy: 4)
EMSCRIPTEN_KEEPALIVE void lr_sonda(int liga) { kof_sonda = liga; }
EMSCRIPTEN_KEEPALIVE void lr_mudas(unsigned m) { kof_mudas = m; }    // bit por canal: 1 = mudo
EMSCRIPTEN_KEEPALIVE int16_t* lr_onda() { return kof_onda; }         // canal c, amostra i: kof_onda[c * 4096 + i] (32 kHz, anel)
EMSCRIPTEN_KEEPALIVE unsigned lr_onda_pos() { return kof_ondaPos; }
EMSCRIPTEN_KEEPALIVE unsigned lr_onda_pos_c(int c) { return kof_temPosCanal ? kof_ondaPosC[c & 15] : kof_ondaPos; }

EMSCRIPTEN_KEEPALIVE void* lr_alloc(size_t n) { return malloc(n); }

EMSCRIPTEN_KEEPALIVE void lr_var(const char* k, const char* v) {
    int i = 0;
    while (i < nVars && strcmp(varChave[i], k)) i++;
    if (i == nVars) { if (nVars == MAX_VARS) return; nVars++; }
    snprintf(varChave[i], 64, "%s", k); snprintf(varValor[i], 64, "%s", v);
    varsMudaram = true;
}

EMSCRIPTEN_KEEPALIVE void lr_init() {
    retro_set_environment(ambiente);
    retro_set_video_refresh(video);
    retro_set_audio_sample(amostra);
    retro_set_audio_sample_batch(amostras);
    retro_set_input_poll(sondar);
    retro_set_input_state(entrada);
    mkdir("/sistema", 0777);
    mkdir("/jogos", 0777);
    retro_init();
}

// disco virtual (na memória do wasm): BIOS em /sistema, e jogos que o núcleo só abre por caminho (Neo Geo) em /jogos
EMSCRIPTEN_KEEPALIVE int lr_arquivo(const char* caminho, const uint8_t* dados, size_t n) {
    FILE* f = fopen(caminho, "wb");
    if (!f) return 0;
    size_t ok = fwrite(dados, 1, n, f);
    fclose(f);
    return ok == n;
}
EMSCRIPTEN_KEEPALIVE void lr_apagar(const char* caminho) { remove(caminho); }

// `nome` é só pro núcleo ver a extensão (rom.sfc, rom.gb, rom.gbc...); a ROM vai inteira na memória
// rom = nullptr: o jogo já está no disco virtual em `nome` (núcleo com need_fullpath, ex.: FBNeo)
EMSCRIPTEN_KEEPALIVE int lr_load(const uint8_t* rom, size_t n, const char* nome) {
    struct retro_game_info info = { nome, rom, n, nullptr };
#ifdef RETRO_ENVIRONMENT_GET_GAME_INFO_EXT
    static char base[256], ext[16];
    const char* ponto = strrchr(nome, '.');
    snprintf(base, sizeof base, "%.*s", ponto ? (int)(ponto - nome) : (int)strlen(nome), nome);
    snprintf(ext, sizeof ext, "%s", ponto ? ponto + 1 : "");
    jogoExt = {};
    jogoExt.full_path = nome; jogoExt.dir = "/"; jogoExt.name = base; jogoExt.ext = ext;
    jogoExt.data = rom; jogoExt.size = n; jogoExt.file_in_archive = false; jogoExt.persistent_data = false;   // o JS libera a ROM depois de carregar: o núcleo copia
#endif
    if (!retro_load_game(&info)) return 0;
    struct retro_system_av_info i;
    retro_get_system_av_info(&i);
    guardarAv(&i);
    larg = av.geometry.base_width; alt = av.geometry.base_height;
#ifdef KOF_GL
    if (temHw) {   // contexto WebGL2 no canvas do módulo, do tamanho da imagem, e o núcleo prepara as coisas dele
        emscripten_set_canvas_element_size("#kof-gl", av.geometry.base_width, av.geometry.base_height);
        if (!ctxGl) {
            EmscriptenWebGLContextAttributes at; emscripten_webgl_init_context_attributes(&at);
            at.majorVersion = 2; at.minorVersion = 0; at.depth = hw.depth; at.stencil = hw.stencil; at.antialias = false;
            at.preserveDrawingBuffer = true; at.alpha = false;
            ctxGl = emscripten_webgl_create_context("#kof-gl", &at);
            if (ctxGl <= 0) { printf("WebGL2 não abriu (%d)\n", (int)ctxGl); return 0; }
        }
        emscripten_webgl_make_context_current(ctxGl);
        if (hw.context_reset) hw.context_reset();
    }
#endif
    if (quadro) memset(quadro, 0, (size_t)maxL * maxA * 4);
    return 1;
}
EMSCRIPTEN_KEEPALIVE double* lr_info() {
    infoJs[0] = av.geometry.base_width; infoJs[1] = av.geometry.base_height;
    infoJs[2] = av.geometry.max_width; infoJs[3] = av.geometry.max_height;
    infoJs[4] = av.geometry.aspect_ratio > 0 ? av.geometry.aspect_ratio : (double)av.geometry.base_width / av.geometry.base_height;
    infoJs[5] = av.timing.fps; infoJs[6] = av.timing.sample_rate;
    return infoJs;
}

// roda `n` quadros; copiar=1 converte a imagem pro formato do canvas, 0 só emula (avanço rápido, testes)
EMSCRIPTEN_KEEPALIVE void lr_run(int n, int copia) {
    copiar = copia;
    for (int i = 0; i < n; i++) { audioQuadros = 0; retro_run(); }
}
// o app diz antes de cada quadro se está atrasado (fila de som acabando): o núcleo que pediu pode pular o desenho do quadro
EMSCRIPTEN_KEEPALIVE int lr_audio_status(int ocupacao, int atrasado) {
    if (!statusAudio) return 0;
    statusAudio(true, (unsigned)ocupacao, atrasado != 0);
    return 1;
}
EMSCRIPTEN_KEEPALIVE void lr_unload() { retro_unload_game(); }
EMSCRIPTEN_KEEPALIVE void lr_reset() { retro_reset(); }

// savestate: o núcleo serializa tudo num bloco de bytes (tamanho fixo por jogo)
EMSCRIPTEN_KEEPALIVE size_t lr_state_size() { return retro_serialize_size(); }
// o resultado também fica em lr_ok(): no N64 o núcleo troca de corrotina (Asyncify) dentro dessas funções e aí o valor
// devolvido direto se perde no caminho até o JS
static int okUltimo;
EMSCRIPTEN_KEEPALIVE int lr_state_save(uint8_t* dest, size_t n) { okUltimo = retro_serialize(dest, n) ? 1 : 0; return okUltimo; }
EMSCRIPTEN_KEEPALIVE int lr_state_load(const uint8_t* src, size_t n) { okUltimo = retro_unserialize(src, n) ? 1 : 0; return okUltimo; }
EMSCRIPTEN_KEEPALIVE int lr_ok() { return okUltimo; }

// memórias do núcleo (RETRO_MEMORY_SAVE_RAM = 0 bateria, 1 relógio RTC, 2 RAM do sistema): o JS lê e grava direto
EMSCRIPTEN_KEEPALIVE uint8_t* lr_mem_ptr(unsigned id) { return (uint8_t*)retro_get_memory_data(id); }
EMSCRIPTEN_KEEPALIVE size_t lr_mem_size(unsigned id) { return retro_get_memory_size(id); }

EMSCRIPTEN_KEEPALIVE void lr_pad(int mascara) { botoes = (uint32_t)mascara; }
EMSCRIPTEN_KEEPALIVE void lr_eixos(int lx, int ly, int rx, int ry) { eixos[0] = lx; eixos[1] = ly; eixos[2] = rx; eixos[3] = ry; }
// tipo de controle na porta 1 (o PS1 usa o DualShock: digital até o jogo ligar o analógico)
EMSCRIPTEN_KEEPALIVE void lr_dispositivo(unsigned d) { retro_set_controller_port_device(0, d); }
EMSCRIPTEN_KEEPALIVE uint32_t* lr_fb() { return quadro; }
EMSCRIPTEN_KEEPALIVE int lr_w() { return larg; }
EMSCRIPTEN_KEEPALIVE int lr_h() { return alt; }
EMSCRIPTEN_KEEPALIVE int16_t* lr_audio() { return audio; }
EMSCRIPTEN_KEEPALIVE int lr_audio_n() { return audioQuadros; }
EMSCRIPTEN_KEEPALIVE double lr_audio_total() { return (double)totalAudio; }

}  // extern "C"
