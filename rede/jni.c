// Ponte JNI do núcleo de rede pro celular (dev.kofnes.android.RedeNucleo). O Java guarda o estado de cada etapa num
// byte[] (o struct copiado inteiro) e cuida do socket; aqui só a conta. Compila sem libc (ver construir.sh).
#include <jni.h>
#include "kofrede.h"
#define F(nome) Java_dev_kofnes_android_RedeNucleo_##nome

static void pegar(JNIEnv *e, jbyteArray a, void *o, jsize n) { (*e)->GetByteArrayRegion(e, a, 0, n, (jbyte *)o); }
static void por(JNIEnv *e, jbyteArray a, const void *o, jsize n) { (*e)->SetByteArrayRegion(e, a, 0, n, (const jbyte *)o); }
static jbyteArray novo(JNIEnv *e, const void *o, jsize n) { jbyteArray a = (*e)->NewByteArray(e, n); por(e, a, o, n); return a; }

JNIEXPORT jint JNICALL F(tamanho)(JNIEnv *e, jclass c, jint q) {
    (void)e; (void)c;
    return q == 0 ? (jint)sizeof(kr_par) : q == 1 ? (jint)sizeof(kr_con) : (jint)sizeof(kr_canal);
}
JNIEXPORT jbyteArray JNICALL F(publica)(JNIEnv *e, jclass c, jbyteArray sk) {
    (void)c; uint8_t s[32], p[32]; pegar(e, sk, s, 32); kr_publica(p, s); return novo(e, p, 32);
}
JNIEXPORT jstring JNICALL F(id)(JNIEnv *e, jclass c, jbyteArray pk) {
    (void)c; uint8_t p[32]; char id[17]; pegar(e, pk, p, 32); kr_id(id, p); return (*e)->NewStringUTF(e, id);
}
JNIEXPORT jbyteArray JNICALL F(parCliente)(JNIEnv *e, jclass c, jbyteArray st, jstring app, jstring senha, jbyteArray sid, jbyteArray rnd) {
    (void)c; kr_par p; uint8_t s[16], r[32], m[48];
    pegar(e, sid, s, 16); pegar(e, rnd, r, 32);
    const char *a = (*e)->GetStringUTFChars(e, app, 0), *se = (*e)->GetStringUTFChars(e, senha, 0);
    kr_par_cliente(&p, a, se, s, r, m);
    (*e)->ReleaseStringUTFChars(e, app, a); (*e)->ReleaseStringUTFChars(e, senha, se);
    por(e, st, &p, sizeof p); return novo(e, m, 48);
}
JNIEXPORT jbyteArray JNICALL F(parCliente2)(JNIEnv *e, jclass c, jbyteArray st, jstring app, jbyteArray msg2, jbyteArray canal) {
    (void)c; kr_par p; kr_canal k; uint8_t m2[48], m3[16];
    pegar(e, st, &p, sizeof p); pegar(e, msg2, m2, 48);
    const char *a = (*e)->GetStringUTFChars(e, app, 0);
    int r = kr_par_cliente2(&p, a, m2, m3, &k);
    (*e)->ReleaseStringUTFChars(e, app, a);
    if (r) return NULL;
    por(e, canal, &k, sizeof k); return novo(e, m3, 16);
}
JNIEXPORT jbyteArray JNICALL F(conCliente)(JNIEnv *e, jclass c, jbyteArray st, jbyteArray sk, jbyteArray rnd) {
    (void)c; kr_con k; uint8_t s[32], r[32], m[64];
    pegar(e, sk, s, 32); pegar(e, rnd, r, 32);
    kr_con_cliente(&k, s, r, m);
    por(e, st, &k, sizeof k); return novo(e, m, 64);
}
JNIEXPORT jbyteArray JNICALL F(conCliente2)(JNIEnv *e, jclass c, jbyteArray st, jstring app, jbyteArray sk, jbyteArray pks, jbyteArray msg2, jbyteArray canal) {
    (void)c; kr_con k; kr_canal ca; uint8_t s[32], ps[32], m2[48], m3[16];
    pegar(e, st, &k, sizeof k); pegar(e, sk, s, 32); pegar(e, pks, ps, 32); pegar(e, msg2, m2, 48);
    const char *a = (*e)->GetStringUTFChars(e, app, 0);
    int r = kr_con_cliente2(&k, a, s, ps, m2, m3, &ca);
    (*e)->ReleaseStringUTFChars(e, app, a);
    if (r) return NULL;
    por(e, canal, &ca, sizeof ca); return novo(e, m3, 16);
}
// as mensagens podem ter até 1 MB: usa a memória do próprio array (sem malloc)
JNIEXPORT jbyteArray JNICALL F(cifrar)(JNIEnv *e, jclass c, jbyteArray canal, jbyteArray in) {
    (void)c; kr_canal k; pegar(e, canal, &k, sizeof k);
    jsize n = (*e)->GetArrayLength(e, in);
    jbyteArray out = (*e)->NewByteArray(e, n + KR_MAC);
    jbyte *pi = (*e)->GetByteArrayElements(e, in, 0), *po = (*e)->GetByteArrayElements(e, out, 0);
    kr_cifrar(&k, (uint8_t *)po, (const uint8_t *)pi, (size_t)n);
    (*e)->ReleaseByteArrayElements(e, in, pi, JNI_ABORT); (*e)->ReleaseByteArrayElements(e, out, po, 0);
    por(e, canal, &k, sizeof k); return out;
}
JNIEXPORT jbyteArray JNICALL F(decifrar)(JNIEnv *e, jclass c, jbyteArray canal, jbyteArray in) {
    (void)c; kr_canal k; pegar(e, canal, &k, sizeof k);
    jsize n = (*e)->GetArrayLength(e, in);
    if (n < KR_MAC) return NULL;
    jbyteArray out = (*e)->NewByteArray(e, n - KR_MAC);
    jbyte *pi = (*e)->GetByteArrayElements(e, in, 0), *po = (*e)->GetByteArrayElements(e, out, 0);
    int r = kr_decifrar(&k, (uint8_t *)po, (const uint8_t *)pi, (size_t)n);
    (*e)->ReleaseByteArrayElements(e, in, pi, JNI_ABORT); (*e)->ReleaseByteArrayElements(e, out, po, 0);
    if (r) return NULL;
    por(e, canal, &k, sizeof k); return out;
}
