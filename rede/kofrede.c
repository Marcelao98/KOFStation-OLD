// kofrede: ver kofrede.h e PROTOCOLO.md
#include "kofrede.h"
#include "terceiros/monocypher.h"
// sem libc (o celular compila sem os cabeçalhos do Android): o compilador põe memcpy/memset/strlen do aparelho
#define memcpy __builtin_memcpy
#define memset __builtin_memset
#define strlen __builtin_strlen

void kr_publica(uint8_t pk[32], const uint8_t sk[32]) { crypto_x25519_public_key(pk, sk); }

void kr_id(char out[17], const uint8_t pk[32]) {
    uint8_t h[8]; crypto_blake2b(h, 8, pk, 32);
    for (int i = 0; i < 8; i++) { out[2 * i] = "0123456789abcdef"[h[i] >> 4]; out[2 * i + 1] = "0123456789abcdef"[h[i] & 15]; }
    out[16] = 0;
}

static void absorver(crypto_blake2b_ctx *h, const void *d, size_t n) { crypto_blake2b_update(h, d, n); }
static void absorverTexto(crypto_blake2b_ctx *h, const char *s) { uint8_t z = 0; absorver(h, s, strlen(s)); absorver(h, &z, 1); }
static void derivar(uint8_t *out, size_t n, const uint8_t ck[64], const char *rotulo) { crypto_blake2b_keyed(out, n, ck, 64, (const uint8_t *)rotulo, strlen(rotulo)); }
static int zero32(const uint8_t k[32]) { uint8_t z[32] = {0}; return crypto_verify32(k, z) == 0; }
// chaves de cada sentido: o cliente envia com c->s e recebe com s->c
static void canal(kr_canal *c, const uint8_t ck[64], int cliente) {
    derivar(cliente ? c->k_env : c->k_rec, 32, ck, "c->s");
    derivar(cliente ? c->k_rec : c->k_env, 32, ck, "s->c");
    c->n_env = c->n_rec = 0;
}

// ---------------------------------------------------------------- pareamento (CPace)
static void gerador(uint8_t G[32], const char *app, const char *senha, const uint8_t sid[16]) {
    crypto_blake2b_ctx h; uint8_t x[32];
    crypto_blake2b_init(&h, 32); absorverTexto(&h, "KOFREDE-CPACE-1"); absorverTexto(&h, app); absorverTexto(&h, senha); absorver(&h, sid, 16);
    crypto_blake2b_final(&h, x);
    crypto_elligator_map(G, x);
}
static void parIsk(kr_par *p, const char *app, const uint8_t K[32]) {
    crypto_blake2b_ctx h;
    crypto_blake2b_init(&h, 64); absorverTexto(&h, "KOFREDE-PAR-1"); absorverTexto(&h, app);
    absorver(&h, p->sid, 16); absorver(&h, p->Ya, 32); absorver(&h, p->Yb, 32); absorver(&h, K, 32);
    crypto_blake2b_final(&h, p->isk);
}
void kr_par_cliente(kr_par *p, const char *app, const char *senha, const uint8_t sid[16], const uint8_t rnd[32], uint8_t msg1[48]) {
    uint8_t G[32];
    memcpy(p->sid, sid, 16); memcpy(p->y, rnd, 32);
    gerador(G, app, senha, sid);
    crypto_x25519(p->Ya, p->y, G);
    memcpy(msg1, sid, 16); memcpy(msg1 + 16, p->Ya, 32);
    crypto_wipe(G, 32);
}
int kr_par_servidor(kr_par *p, const char *app, const char *senha, const uint8_t msg1[48], const uint8_t rnd[32], uint8_t msg2[48]) {
    uint8_t G[32], K[32];
    memcpy(p->sid, msg1, 16); memcpy(p->Ya, msg1 + 16, 32); memcpy(p->y, rnd, 32);
    gerador(G, app, senha, p->sid);
    crypto_x25519(p->Yb, p->y, G);
    crypto_x25519(K, p->y, p->Ya);
    if (zero32(K) || zero32(p->Yb)) return -1;
    parIsk(p, app, K); crypto_wipe(K, 32);
    memcpy(msg2, p->Yb, 32); derivar(msg2 + 32, 16, p->isk, "conf-s");
    return 0;
}
int kr_par_cliente2(kr_par *p, const char *app, const uint8_t msg2[48], uint8_t msg3[16], kr_canal *c) {
    uint8_t K[32], conf[16];
    memcpy(p->Yb, msg2, 32);
    crypto_x25519(K, p->y, p->Yb);
    if (zero32(K)) return -1;
    parIsk(p, app, K); crypto_wipe(K, 32);
    derivar(conf, 16, p->isk, "conf-s");
    if (crypto_verify16(conf, msg2 + 32)) return -1;
    derivar(msg3, 16, p->isk, "conf-c");
    canal(c, p->isk, 1);
    return 0;
}
int kr_par_servidor2(kr_par *p, const char *app, const uint8_t msg3[16], kr_canal *c) {
    (void)app; uint8_t conf[16];
    derivar(conf, 16, p->isk, "conf-c");
    if (crypto_verify16(conf, msg3)) return -1;
    canal(c, p->isk, 0);
    return 0;
}

// ---------------------------------------------------------------- conexão (3DH)
static void conCk(kr_con *k, const char *app, const uint8_t pkc[32], const uint8_t pks[32], const uint8_t Es[32],
                  const uint8_t ee[32], const uint8_t es[32], const uint8_t se[32]) {
    crypto_blake2b_ctx h;
    crypto_blake2b_init(&h, 64); absorverTexto(&h, "KOFREDE-CON-1"); absorverTexto(&h, app);
    absorver(&h, pkc, 32); absorver(&h, pks, 32); absorver(&h, k->Ec, 32); absorver(&h, Es, 32);
    absorver(&h, ee, 32); absorver(&h, es, 32); absorver(&h, se, 32);
    crypto_blake2b_final(&h, k->ck);
}
void kr_con_cliente(kr_con *k, const uint8_t skc[32], const uint8_t rnd[32], uint8_t msg1[64]) {
    memcpy(k->e, rnd, 32);
    kr_publica(k->pkc, skc); kr_publica(k->Ec, k->e);
    memcpy(msg1, k->pkc, 32); memcpy(msg1 + 32, k->Ec, 32);
}
int kr_con_servidor(kr_con *k, const char *app, const uint8_t sks[32], const uint8_t msg1[64], const uint8_t rnd[32], uint8_t msg2[48], kr_canal *c) {
    uint8_t pks[32], Es[32], ee[32], es[32], se[32];
    memcpy(k->pkc, msg1, 32); memcpy(k->Ec, msg1 + 32, 32); memcpy(k->e, rnd, 32);
    kr_publica(pks, sks); kr_publica(Es, k->e);
    crypto_x25519(ee, k->e, k->Ec);     // efêmera × efêmera
    crypto_x25519(es, sks, k->Ec);      // efêmera do cliente × fixa do servidor
    crypto_x25519(se, k->e, k->pkc);    // fixa do cliente × efêmera do servidor
    if (zero32(ee) || zero32(es) || zero32(se)) return -1;
    conCk(k, app, k->pkc, pks, Es, ee, es, se);
    crypto_wipe(ee, 32); crypto_wipe(es, 32); crypto_wipe(se, 32);
    memcpy(msg2, Es, 32); derivar(msg2 + 32, 16, k->ck, "conf-s");
    canal(c, k->ck, 0);
    return 0;
}
int kr_con_cliente2(kr_con *k, const char *app, const uint8_t skc[32], const uint8_t pks[32], const uint8_t msg2[48], uint8_t msg3[16], kr_canal *c) {
    uint8_t ee[32], es[32], se[32], conf[16];
    crypto_x25519(ee, k->e, msg2);
    crypto_x25519(es, k->e, pks);
    crypto_x25519(se, skc, msg2);
    if (zero32(ee) || zero32(es) || zero32(se)) return -1;
    conCk(k, app, k->pkc, pks, msg2, ee, es, se);
    crypto_wipe(ee, 32); crypto_wipe(es, 32); crypto_wipe(se, 32);
    derivar(conf, 16, k->ck, "conf-s");
    if (crypto_verify16(conf, msg2 + 32)) return -1;
    derivar(msg3, 16, k->ck, "conf-c");
    canal(c, k->ck, 1);
    return 0;
}
int kr_con_servidor2(kr_con *k, const uint8_t msg3[16]) {
    uint8_t conf[16]; derivar(conf, 16, k->ck, "conf-c");
    return crypto_verify16(conf, msg3) ? -1 : 0;
}

// ---------------------------------------------------------------- mensagens
static void nonce(uint8_t n[24], uint64_t c) { memset(n, 0, 24); for (int i = 0; i < 8; i++) n[i] = (uint8_t)(c >> (8 * i)); }
void kr_cifrar(kr_canal *c, uint8_t *out, const uint8_t *in, size_t n) {
    uint8_t no[24]; nonce(no, c->n_env++);
    crypto_aead_lock(out + KR_MAC, out, c->k_env, no, NULL, 0, in, n);
}
int kr_decifrar(kr_canal *c, uint8_t *out, const uint8_t *in, size_t total) {
    if (total < KR_MAC) return -1;
    uint8_t no[24]; nonce(no, c->n_rec);
    if (crypto_aead_unlock(out, in, c->k_rec, no, NULL, 0, in + KR_MAC, total - KR_MAC)) return -1;
    c->n_rec++;
    return 0;
}
