package dev.kofnes.android;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * Nintendo 64 nativo: as funções da ponte em C (android/nativo/kofnativo.c com -DCLASSE=N64), que liga o Mupen64Plus-Next (ARM64, GLideN64)
 * ao app. A imagem é desenhada pelo próprio núcleo com OpenGL ES 3 (rodar() tem de ser chamado na thread do OpenGL);
 * o som chega num buffer direto, sem cópia.
 * Mesma interface do Ps1.
 */
public final class N64 {
    public static final ByteBuffer VIDEO = ByteBuffer.allocateDirect(1024 * 512 * 4).order(ByteOrder.nativeOrder());
    public static final ByteBuffer SOM = ByteBuffer.allocateDirect(48000 * 2 * 2).order(ByteOrder.nativeOrder());
    private static boolean pronto;

    /** Carrega a ponte (no Android pelo nome; no teste, pelo caminho do arquivo). Falhou = o app usa o WebAssembly. */
    public static synchronized boolean carregar(String caminho) {
        if (pronto) return true;
        try {
            if (caminho == null) System.loadLibrary("kofn64"); else System.load(caminho);
            buffers(VIDEO, SOM);
            pronto = true;
        } catch (Throwable t) {
            pronto = false;
        }
        return pronto;
    }

    static native void buffers(ByteBuffer video, ByteBuffer som);
    /** "" = abriu; senão o motivo. info = largura, altura, fps×1000, taxa do som. */
    static native String abrir(String jogo, String sistema, String saves, String cartao, String opcoes, int[] info);
    /** Um quadro com os botões (bits do libretro; 16-19 = C cima, baixo, esquerda, direita); devolve quantas amostras de som (int16) vieram. */
    static native int rodar(int pad, int eixos);   // eixos: 4 bytes com sinal (esquerdo X/Y, direito X/Y)
    /** Largura do quadro novo (0 = este quadro repetiu o anterior). */
    static native int largura();
    static native int altura();
    static native void reiniciar();
    static native boolean gravarCartao();
    static native void fechar();
    static native byte[] salvarEstado();
    static native boolean carregarEstado(byte[] estado);
}
