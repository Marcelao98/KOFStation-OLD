package dev.kofnes.android;

import android.app.Activity;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.net.Uri;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.os.SystemClock;
import android.util.Base64;
import android.widget.FrameLayout;

import java.io.File;
import java.util.concurrent.CountDownLatch;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/**
 * O Nintendo 64 nativo na tela. Mesma ideia do Ps1Jogo, com uma diferença: o Mupen64Plus-Next desenha com OpenGL ES 3,
 * então tudo que fala com o núcleo roda na thread do OpenGL de uma GLSurfaceView (abrir, cada quadro, savestate). A
 * superfície tem o tamanho exato da imagem do jogo (setFixedSize) e o Android escala pra área do jogo na página. O som sai
 * por um AudioTrack que bloqueia: é ele que segura os 60 quadros por segundo, mesmo em tela de 90/120 Hz.
 * A GLSurfaceView nunca some (perderia o contexto do OpenGL com o jogo dentro): sem sinal da página, ela encolhe pra 1 px.
 */
final class N64Jogo implements GLSurfaceView.Renderer {
    private final Activity a;
    private final GLSurfaceView tela;
    private final File pasta, saves, sistema;
    private volatile int pad, eixos;
    private volatile long ultimoSinal;
    private volatile boolean aberto, mostrando, continuo = true;
    private volatile float volume = 1f;
    private volatile int ax, ay, aw, ah;
    private int fw, fh;
    private AudioTrack som;
    private final short[] amostras = new short[48000];
    Uri[] ultimaEscolha;

    N64Jogo(Activity a, FrameLayout raiz) {
        this.a = a;
        pasta = new File(a.getFilesDir(), "n64-rom");
        saves = new File(a.getFilesDir(), "n64-saves");
        sistema = new File(a.getFilesDir(), "n64-sistema");
        saves.mkdirs(); sistema.mkdirs();
        tela = new GLSurfaceView(a);
        tela.setEGLContextClientVersion(3);
        tela.setPreserveEGLContextOnPause(true);
        tela.setZOrderMediaOverlay(true);
        tela.setRenderer(this);
        tela.getHolder().setFixedSize(640, 480);
        raiz.addView(tela, new FrameLayout.LayoutParams(1, 1));
    }

    /** Roda na thread do OpenGL e espera a resposta. */
    private <T> T noGl(final java.util.concurrent.Callable<T> f) throws Exception {
        final Object[] r = new Object[1];
        final Exception[] erro = new Exception[1];
        final CountDownLatch pronto = new CountDownLatch(1);
        tela.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY); continuo = true;
        tela.queueEvent(new Runnable() { public void run() {
            try { r[0] = f.call(); } catch (Exception e) { erro[0] = e; } finally { pronto.countDown(); }
        } });
        pronto.await();
        if (erro[0] != null) throw erro[0];
        @SuppressWarnings("unchecked") T t = (T) r[0];
        return t;
    }

    String abrir(String nome) {
        try {
            File principal = null;
            Uri[] es = ultimaEscolha;
            boolean escolhido = false;
            if (es != null) for (Uri u : es) if (nome.equalsIgnoreCase(Ps1Jogo.nomeDe(a, u))) escolhido = true;
            if (escolhido) {
                Ps1Jogo.trazer(a, es, pasta);
                principal = Ps1Jogo.escolherPrincipal(pasta, nome, new String[]{".z64", ".n64", ".v64"});
            } else if (new File(pasta, nome).isFile()) principal = new File(pasta, nome);   // da biblioteca: a última ROM aberta
            if (principal == null) return "{\"erro\":\"abra o arquivo do jogo de novo (.z64, .n64, .v64 ou o .zip)\"}";
            final String caminho = principal.getAbsolutePath(), base = principal.getName().replaceAll("\\.[^.]+$", "");
            final int[] info = new int[4];
            String erro = noGl(new java.util.concurrent.Callable<String>() { public String call() {
                return N64.abrir(caminho, sistema.getAbsolutePath(), saves.getAbsolutePath(), new File(saves, base + ".sav").getAbsolutePath(),
                        // as mesmas do Lemuroid (que usa este mesmo núcleo): o resto fica no padrão do núcleo (recompilador ARM64,
                        // GLideN64, RSP em HLE), que a ponte agora entrega como o RetroArch
                        "mupen64plus-43screensize=320x240\nmupen64plus-FrameDuping=True\nmupen64plus-pak1=memory\n", info);
            } });
            if (!erro.isEmpty()) return "{\"erro\":\"" + erro + "\"}";
            iniciarSom(info[3] > 0 ? info[3] : 44100);
            aberto = true;
            return "{\"principal\":\"" + principal.getName().replace("\"", "") + "\",\"largura\":" + info[0] + ",\"altura\":" + info[1]
                    + ",\"fps\":" + info[2] / 1000.0 + ",\"taxa\":" + info[3] + "}";
        } catch (Exception e) {
            return "{\"erro\":\"não consegui preparar a ROM: " + String.valueOf(e.getMessage()).replace("\"", "'") + "\"}";
        }
    }

    void sinal(int botoes, int e) {
        pad = botoes; eixos = e; ultimoSinal = SystemClock.uptimeMillis();
        if (!continuo) { continuo = true; tela.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY); }
    }

    void area(float x, float y, float w, float h) {
        float d = a.getResources().getDisplayMetrics().density;
        ax = Math.round(x * d); ay = Math.round(y * d); aw = Math.max(1, Math.round(w * d)); ah = Math.max(1, Math.round(h * d));
        if (mostrando) posicionar(true);
    }

    private void posicionar(final boolean ver) {
        a.runOnUiThread(new Runnable() { public void run() {
            FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(ver ? aw : 1, ver ? ah : 1);
            p.leftMargin = ver ? ax : 0; p.topMargin = ver ? ay : 0;
            tela.setLayoutParams(p);
        } });
    }

    void fechar() {
        aberto = false;
        try { noGl(new java.util.concurrent.Callable<Object>() { public Object call() { N64.fechar(); return null; } }); } catch (Exception e) { /* já fechado */ }
    }

    void reiniciar() {
        tela.queueEvent(new Runnable() { public void run() { N64.reiniciar(); } });
    }

    void volume(float v) { volume = v; if (som != null) som.setStereoVolume(v, v); }

    String estado() {
        try {
            byte[] e = noGl(new java.util.concurrent.Callable<byte[]>() { public byte[] call() { return N64.salvarEstado(); } });
            return e == null ? "" : Base64.encodeToString(e, Base64.NO_WRAP);
        } catch (Exception e) { return ""; }
    }

    boolean carregarEstado(String b64) {
        final byte[] e = Base64.decode(b64, Base64.DEFAULT);
        try { return noGl(new java.util.concurrent.Callable<Boolean>() { public Boolean call() { return N64.carregarEstado(e); } }); }
        catch (Exception x) { return false; }
    }

    void pausar() {
        if (aberto) tela.queueEvent(new Runnable() { public void run() { N64.gravarCartao(); } });
    }

    private void iniciarSom(int taxa) {
        if (som != null) { som.release(); som = null; }
        int min = AudioTrack.getMinBufferSize(taxa, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT);
        som = new AudioTrack(AudioManager.STREAM_MUSIC, taxa, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT,
                Math.max(min, taxa * 4 / 12), AudioTrack.MODE_STREAM);   // ~80 ms
        som.setStereoVolume(volume, volume);
        som.play();
    }

    // ---------- thread do OpenGL ----------
    public void onSurfaceCreated(GL10 gl, EGLConfig c) { }
    public void onSurfaceChanged(GL10 gl, int w, int h) { }

    public void onDrawFrame(GL10 gl) {
        boolean jogando = aberto && SystemClock.uptimeMillis() - ultimoSinal < 250;
        if (jogando != mostrando) { mostrando = jogando; posicionar(jogando); }
        if (!jogando) {
            GLES20.glClearColor(0, 0, 0, 1); GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
            if (continuo) { continuo = false; tela.setRenderMode(GLSurfaceView.RENDERMODE_WHEN_DIRTY); }
            return;
        }
        int n = N64.rodar(pad, eixos);
        int w = N64.largura(), h = N64.altura();
        if (w > 0 && (w != fw || h != fh)) {   // a superfície acompanha o tamanho da imagem do jogo
            fw = w; fh = h;
            final int W = w, H = h;
            a.runOnUiThread(new Runnable() { public void run() { tela.getHolder().setFixedSize(W, H); } });
        }
        if (n > 0 && som != null) {
            N64.SOM.rewind();
            N64.SOM.asShortBuffer().get(amostras, 0, Math.min(n, amostras.length));
            som.write(amostras, 0, Math.min(n, amostras.length));   // bloqueia até caber: marca o ritmo
        }
    }
}
