package dev.kofnes.android;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Os saves dos consoles nativos (cartão de memória do PS1, save do N64) moram em arquivos do app, fora da página: isto
 * deixa a página listar, ler e gravar esses arquivos pra eles entrarem no backup (.kofsave) junto com os outros. Só as
 * pastas de save, e só arquivo direto delas (nada de "../"). Sem nada de Android dentro: dá pra testar no Linux.
 */
final class SavesNativos {
    static final String[] PASTAS = { "ps1-saves", "n64-saves" };

    private static File arquivo(File base, String nome) {
        int b = nome.indexOf('/');
        if (b <= 0) return null;
        String pasta = nome.substring(0, b), arq = nome.substring(b + 1);
        boolean ok = false;
        for (String p : PASTAS) if (p.equals(pasta)) ok = true;
        if (!ok || arq.isEmpty() || arq.contains("/") || arq.contains("\\") || arq.startsWith(".")) return null;
        return new File(new File(base, pasta), arq);
    }

    /** JSON: [{"nome":"ps1-saves/Crash.mcd","tam":131072,"quando":1700000000000}, ...] */
    static String listar(File base) {
        StringBuilder s = new StringBuilder("[");
        for (String p : PASTAS) {
            File[] fs = new File(base, p).listFiles();
            if (fs == null) continue;
            for (File f : fs) {
                if (!f.isFile()) continue;
                if (s.length() > 1) s.append(',');
                s.append("{\"nome\":\"").append((p + "/" + f.getName()).replace("\\", "\\\\").replace("\"", "\\\""))
                 .append("\",\"tam\":").append(f.length()).append(",\"quando\":").append(f.lastModified()).append('}');
            }
        }
        return s.append(']').toString();
    }

    static byte[] ler(File base, String nome) throws Exception {
        File f = arquivo(base, nome);
        if (f == null || !f.isFile()) return null;
        byte[] b = new byte[(int) f.length()];
        InputStream in = new FileInputStream(f);
        try { int p = 0; for (int k; p < b.length && (k = in.read(b, p, b.length - p)) > 0; ) p += k; } finally { in.close(); }
        return b;
    }

    /** Grava num arquivo temporário e troca: se faltar espaço no meio, o save antigo continua inteiro. */
    static boolean gravar(File base, String nome, byte[] dados, long quando) throws Exception {
        File f = arquivo(base, nome);
        if (f == null) return false;
        f.getParentFile().mkdirs();
        File tmp = new File(f.getParentFile(), "." + f.getName() + ".novo");
        OutputStream o = new FileOutputStream(tmp);
        try { o.write(dados); } finally { o.close(); }
        if (!tmp.renameTo(f)) { f.delete(); if (!tmp.renameTo(f)) return false; }
        if (quando > 0) f.setLastModified(quando);
        return true;
    }
}
