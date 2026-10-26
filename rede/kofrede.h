// kofrede: o núcleo do protocolo de rede entre aparelhos (PC, celular, TV box...). Não sabe nada de jogo nem de
// KOFstation: o nome do app entra na criptografia, então outro app usa o mesmo código com outro nome.
// "Sem entrada e saída": aqui só tem conta (chaves, cifra). Quem lê e escreve no socket é o kofservico (PC, C) e o
// Rede.java (celular, pela ponte JNI em jni.c). Os números aleatórios também vêm de fora. Assim o mesmo arquivo compila
// pro Linux, Windows e Android sem libc (só memcpy/memset/strlen), e dá pra trocar por Rust depois seguindo PROTOCOLO.md.
#ifndef KOFREDE_H
#define KOFREDE_H
#include <stdint.h>
#include <stddef.h>

#define KR_MAC 16
#define KR_MAX (1u << 20)   // maior mensagem (sem o MAC)

typedef struct { uint8_t k_env[32], k_rec[32]; uint64_t n_env, n_rec; } kr_canal;

void kr_publica(uint8_t pk[32], const uint8_t sk[32]);   // sk = 32 bytes aleatórios
void kr_id(char out[17], const uint8_t pk[32]);          // id do aparelho: 16 letras hex do hash da chave pública

// ---- pareamento (CPace com X25519: a senha é o código de 6 números ou o segredo do QR; quem não sabe a senha tem 1
// chute por tentativa, sem poder testar senhas depois com o que viu na rede)
typedef struct { uint8_t y[32], Ya[32], Yb[32], sid[16], isk[64]; } kr_par;
// cliente: msg1 = sid(16) | Ya(32)
void kr_par_cliente(kr_par *p, const char *app, const char *senha, const uint8_t sid[16], const uint8_t rnd[32], uint8_t msg1[48]);
// servidor: lê msg1, msg2 = Yb(32) | conf(16). 0 = ok
int kr_par_servidor(kr_par *p, const char *app, const char *senha, const uint8_t msg1[48], const uint8_t rnd[32], uint8_t msg2[48]);
// cliente: confere msg2 (senha errada = -1), msg3 = conf(16) e o canal cifrado
int kr_par_cliente2(kr_par *p, const char *app, const uint8_t msg2[48], uint8_t msg3[16], kr_canal *c);
// servidor: confere msg3 e dá o canal
int kr_par_servidor2(kr_par *p, const char *app, const uint8_t msg3[16], kr_canal *c);

// ---- conexão entre aparelhos já pareados (3DH: as chaves fixas dos dois + uma nova por conexão)
typedef struct { uint8_t e[32], Ec[32], pkc[32], ck[64]; } kr_con;
// cliente: msg1 = PKc(32) | Ec(32)
void kr_con_cliente(kr_con *k, const uint8_t skc[32], const uint8_t rnd[32], uint8_t msg1[64]);
// servidor: depois de conferir que PKc (msg1[0..32]) é de um pareado. msg2 = Es(32) | conf(16)
int kr_con_servidor(kr_con *k, const char *app, const uint8_t sks[32], const uint8_t msg1[64], const uint8_t rnd[32], uint8_t msg2[48], kr_canal *c);
// cliente: confere msg2 (o servidor tem a chave secreta de pks?), msg3 = conf(16)
int kr_con_cliente2(kr_con *k, const char *app, const uint8_t skc[32], const uint8_t pks[32], const uint8_t msg2[48], uint8_t msg3[16], kr_canal *c);
int kr_con_servidor2(kr_con *k, const uint8_t msg3[16]);

// ---- mensagens cifradas: out = mac(16) | texto cifrado (n bytes)
void kr_cifrar(kr_canal *c, uint8_t *out, const uint8_t *in, size_t n);
int kr_decifrar(kr_canal *c, uint8_t *out, const uint8_t *in, size_t total);   // total = 16 + n; -1 = adulterada

#endif
