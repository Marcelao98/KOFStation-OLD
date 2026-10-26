// Teste do núcleo: pareamento com senha certa e errada, conexão entre pareados, chave falsa, mensagem adulterada.
//   cc -O2 -I rede rede/teste/nucleo.c rede/kofrede.c rede/terceiros/monocypher.c -o /tmp/t && /tmp/t
#include "kofrede.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
static int falhas;
#define OK(c, m) do { if (!(c)) { printf("FALHOU: %s\n", m); falhas++; } else printf("ok: %s\n", m); } while (0)
static void rnd(uint8_t *b, int n) { for (int i = 0; i < n; i++) b[i] = (uint8_t)rand(); }

static int parear(const char *sc, const char *ss, kr_canal *cc, kr_canal *cs) {
    kr_par pc, ps; uint8_t sid[16], r1[32], r2[32], m1[48], m2[48], m3[16];
    rnd(sid, 16); rnd(r1, 32); rnd(r2, 32);
    kr_par_cliente(&pc, "teste", sc, sid, r1, m1);
    if (kr_par_servidor(&ps, "teste", ss, m1, r2, m2)) return -1;
    if (kr_par_cliente2(&pc, "teste", m2, m3, cc)) return -2;
    if (kr_par_servidor2(&ps, "teste", m3, cs)) return -3;
    return 0;
}
static int conectar(const uint8_t skc[32], const uint8_t sks[32], const uint8_t pksAchada[32], kr_canal *cc, kr_canal *cs) {
    kr_con kc, ks; uint8_t r1[32], r2[32], m1[64], m2[48], m3[16];
    rnd(r1, 32); rnd(r2, 32);
    kr_con_cliente(&kc, skc, r1, m1);
    if (kr_con_servidor(&ks, "teste", sks, m1, r2, m2, cs)) return -1;
    if (kr_con_cliente2(&kc, "teste", skc, pksAchada, m2, m3, cc)) return -2;
    if (kr_con_servidor2(&ks, m3)) return -3;
    return 0;
}
static int troca(kr_canal *a, kr_canal *b) {
    const char *t = "ola do celular"; uint8_t c[64], p[64]; size_t n = strlen(t);
    kr_cifrar(a, c, (const uint8_t *)t, n);
    if (kr_decifrar(b, p, c, n + KR_MAC) || memcmp(p, t, n)) return -1;
    kr_cifrar(b, c, (const uint8_t *)t, n);
    if (kr_decifrar(a, p, c, n + KR_MAC)) return -1;
    kr_cifrar(a, c, (const uint8_t *)t, n); c[20] ^= 1;
    return kr_decifrar(b, p, c, n + KR_MAC) == 0 ? -2 : 0;   // adulterada tem que falhar
}
int main(void) {
    srand(42);
    kr_canal cc, cs;
    OK(parear("123456", "123456", &cc, &cs) == 0, "pareia com a senha certa");
    OK(troca(&cc, &cs) == 0, "mensagens no canal do pareamento (e a adulterada falha)");
    OK(parear("123457", "123456", &cc, &cs) == -2, "senha errada: o cliente percebe");
    uint8_t skc[32], sks[32], pkc[32], pks[32], skx[32], pkx[32];
    rnd(skc, 32); rnd(sks, 32); rnd(skx, 32); kr_publica(pkc, skc); kr_publica(pks, sks); kr_publica(pkx, skx);
    OK(conectar(skc, sks, pks, &cc, &cs) == 0, "conecta entre pareados");
    OK(troca(&cc, &cs) == 0, "mensagens no canal da conexão");
    OK(conectar(skc, skx, pks, &cc, &cs) == -2, "servidor falso (sem a chave do PC) é recusado pelo cliente");
    { // cliente falso: diz que é pkc mas não tem skc
        kr_con kc, ks; uint8_t r1[32], r2[32], m1[64], m2[48], m3[16];
        rnd(r1, 32); rnd(r2, 32);
        kr_con_cliente(&kc, skx, r1, m1); memcpy(m1, pkc, 32); memcpy(kc.pkc, pkc, 32);
        kr_con_servidor(&ks, "teste", sks, m1, r2, m2, &cs);
        kr_con_cliente2(&kc, "teste", skx, pks, m2, m3, &cc);
        OK(kr_con_servidor2(&ks, m3) != 0, "cliente falso (sem a chave do celular) é recusado pelo servidor");
    }
    char id[17]; kr_id(id, pkc); OK(strlen(id) == 16, "id de 16 letras");
    printf(falhas ? "%d FALHAS\n" : "tudo certo\n", falhas);
    return falhas != 0;
}
