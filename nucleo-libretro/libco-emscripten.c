/* libco no WebAssembly: as corrotinas do libretro (o Mupen64Plus-Next alterna entre o emulador e o libretro com elas) feitas
 * com as "fibers" do emscripten, que salvam e trocam a pilha com o Asyncify (ligar com -s ASYNCIFY). O construir.sh copia
 * este arquivo pra libretro-common/libco/ do núcleo e faz o libco.c usar ele quando compila com o emscripten. */
#include <stdlib.h>
#include <emscripten/fiber.h>
#include "libco.h"

typedef struct { emscripten_fiber_t f; void (*entrada)(void); void *pilha, *pilhaAsync; } coro;
static coro principal;
static coro *ativo;
static char pilhaAsyncPrincipal[256 * 1024];

static void comecar(void *c) { ((coro *)c)->entrada(); }

cothread_t co_active(void) {
   if (!ativo) {
      emscripten_fiber_init_from_current_context(&principal.f, pilhaAsyncPrincipal, sizeof pilhaAsyncPrincipal);
      ativo = &principal;
   }
   return ativo;
}

cothread_t co_create(unsigned int tamanho, void (*entrada)(void)) {
   co_active();
   coro *c = (coro *)calloc(1, sizeof *c);
   size_t async = 1 << 20;
   c->entrada = entrada; c->pilha = malloc(tamanho); c->pilhaAsync = malloc(async);
   emscripten_fiber_init(&c->f, comecar, c, c->pilha, tamanho, c->pilhaAsync, async);
   return c;
}

void co_delete(cothread_t t) { coro *c = (coro *)t; free(c->pilha); free(c->pilhaAsync); free(c); }

void co_switch(cothread_t t) {
   coro *de = (coro *)co_active();
   ativo = (coro *)t;
   emscripten_fiber_swap(&de->f, &ativo->f);
}

int co_serializable(void) { return 0; }
