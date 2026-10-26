package dev.kofnes.android;

// O núcleo de rede em C (rede/kofrede.c + rede/jni.c, libkofrede.so). Sem Android: o teste roda no Linux.
public final class RedeNucleo {
    static { System.loadLibrary("kofrede"); }
    private RedeNucleo() {}
    public static native int tamanho(int qual);   // 0 = pareamento, 1 = conexão, 2 = canal
    public static native byte[] publica(byte[] sk);
    public static native String id(byte[] pk);
    public static native byte[] parCliente(byte[] st, String app, String senha, byte[] sid, byte[] rnd);
    public static native byte[] parCliente2(byte[] st, String app, byte[] msg2, byte[] canal);
    public static native byte[] conCliente(byte[] st, byte[] sk, byte[] rnd);
    public static native byte[] conCliente2(byte[] st, String app, byte[] sk, byte[] pks, byte[] msg2, byte[] canal);
    public static native byte[] cifrar(byte[] canal, byte[] in);
    public static native byte[] decifrar(byte[] canal, byte[] in);
}
