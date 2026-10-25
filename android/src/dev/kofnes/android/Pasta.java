package dev.kofnes.android;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.FileInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * A pasta de ROMs no Android, igual à do PC: a pessoa escolhe a pasta uma vez (seletor de pasta do Android, a permissão
 * fica guardada), o app lista as ROMs dela (e das subpastas, até 2 níveis) e a página lê cada arquivo por
 * https://appassets.androidplatform.net/pasta?u=<endereço do arquivo>, aos pedaços (Range): um zip ou CD grande não
 * precisa ser lido inteiro só pra ver o que tem dentro. Só os arquivos da última listagem podem ser lidos.
 */
final class Pasta {
    static final class Item {
        final String nome, pai;
        final Uri uri;
        final long tamanho;
        Item(String nome, Uri uri, long tamanho, String pai) { this.nome = nome; this.uri = uri; this.tamanho = tamanho; this.pai = pai; }
    }

    private final Activity a;
    private final SharedPreferences prefs;
    private volatile Map<String, Item> porUri = new HashMap<String, Item>();

    Pasta(Activity a) {
        this.a = a;
        prefs = a.getSharedPreferences("pasta", Context.MODE_PRIVATE);
    }

    private Uri arvore() {
        String s = prefs.getString("arvore", null);
        return s == null ? null : Uri.parse(s);
    }

    /** O nome da pasta escolhida ("" = nenhuma, ou a permissão se perdeu). */
    String nome() {
        Uri t = arvore();
        if (t == null || !temPermissao(t)) return "";
        String id = DocumentsContract.getTreeDocumentId(t);   // "primary:Jogos/ROMs"
        return id.substring(Math.max(id.lastIndexOf(':'), id.lastIndexOf('/')) + 1);
    }

    private boolean temPermissao(Uri t) {
        for (UriPermission p : a.getContentResolver().getPersistedUriPermissions())
            if (p.getUri().equals(t) && p.isReadPermission()) return true;
        return false;
    }

    /** Guarda a pasta que voltou do seletor (ACTION_OPEN_DOCUMENT_TREE): vale também nas próximas aberturas do app. */
    void guardar(Uri t) {
        a.getContentResolver().takePersistableUriPermission(t, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Uri antiga = arvore();
        if (antiga != null && !antiga.equals(t)) {
            try { a.getContentResolver().releasePersistableUriPermission(antiga, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception e) { /* já não tinha */ }
        }
        prefs.edit().putString("arvore", t.toString()).apply();
    }

    /** Lista as ROMs (nome casando com a expressão que a página manda): JSON [{n: nome, u: endereço, t: tamanho}]. */
    String listar(String ext) {
        Uri t = arvore();
        if (t == null || !temPermissao(t)) return "[]";
        Pattern p = Pattern.compile(ext, Pattern.CASE_INSENSITIVE);
        List<Item> l = new ArrayList<Item>();
        ContentResolver cr = a.getContentResolver();
        varrer(cr, t, DocumentsContract.getTreeDocumentId(t), 0, p, l);
        Map<String, Item> m = new HashMap<String, Item>();
        JSONArray j = new JSONArray();
        try {
            for (Item it : l) {
                m.put(it.uri.toString(), it);
                j.put(new JSONObject().put("n", it.nome).put("u", it.uri.toString()).put("t", it.tamanho));
            }
        } catch (Exception e) { /* JSONObject só reclama de número inválido */ }
        porUri = m;
        return j.toString();
    }

    private static void varrer(ContentResolver cr, Uri t, String doc, int prof, Pattern p, List<Item> l) {
        Uri filhos = DocumentsContract.buildChildDocumentsUriUsingTree(t, doc);
        Cursor c = null;
        try {
            c = cr.query(filhos, new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE}, null, null, null);
            while (c != null && c.moveToNext()) {
                String id = c.getString(0), nome = c.getString(1), mime = c.getString(2);
                if (nome == null) continue;
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                    if (prof < 2) varrer(cr, t, id, prof + 1, p, l);
                } else if (p.matcher(nome).find()) {
                    l.add(new Item(nome, DocumentsContract.buildDocumentUriUsingTree(t, id), c.isNull(3) ? -1 : c.getLong(3), doc));
                }
            }
        } catch (Exception e) {
            /* subpasta que não deixa ler: fica de fora */
        } finally {
            if (c != null) c.close();
        }
    }

    /** O arquivo e os que vão junto com ele (as faixas .bin de um .cue: mesmo nome, mesma pasta), pro PS1/N64 nativo copiar. */
    Uri[] doJogo(String u) {
        Item it = porUri.get(u);
        if (it == null) return null;
        String base = base(it.nome);
        List<Uri> r = new ArrayList<Uri>();
        r.add(it.uri);
        for (Item x : porUri.values())
            if (x != it && x.pai.equals(it.pai) && base(x.nome).equalsIgnoreCase(base)) r.add(x.uri);
        return r.toArray(new Uri[0]);
    }

    private static String base(String n) {
        return n.replaceAll("\\.[^.]+$", "").replaceAll("(?i)\\s*\\(Track \\d+\\)$", "");
    }

    /** Responde o pedido da página por um arquivo da pasta, inteiro ou o pedaço do cabeçalho Range ("bytes=ini-fim"). */
    WebResourceResponse servir(Uri pedido, Map<String, String> cabecalhos) {
        Item it = porUri.get(pedido.getQueryParameter("u"));
        if (it == null) return vazio(404, "Not Found");
        try {
            final ParcelFileDescriptor pfd = a.getContentResolver().openFileDescriptor(it.uri, "r");
            long tam = it.tamanho >= 0 ? it.tamanho : pfd.getStatSize();
            long ini = 0, fim = tam - 1;
            String rg = null;
            for (Map.Entry<String, String> e : cabecalhos.entrySet()) if ("range".equalsIgnoreCase(e.getKey())) rg = e.getValue();
            boolean parte = rg != null && rg.startsWith("bytes=");
            if (parte) {
                String[] ab = rg.substring(6).split("-", -1);
                if (!ab[0].isEmpty()) ini = Long.parseLong(ab[0].trim());
                if (ab.length > 1 && !ab[1].isEmpty()) fim = Math.min(fim, Long.parseLong(ab[1].trim()));
                if (ab[0].isEmpty() && ab.length > 1) { ini = Math.max(0, tam - Long.parseLong(ab[1].trim())); fim = tam - 1; }   // "bytes=-500": os últimos 500
            }
            FileInputStream in = new FileInputStream(pfd.getFileDescriptor());
            try { in.getChannel().position(ini); } catch (Exception e) { long s = ini; while (s > 0) { long k = in.skip(s); if (k <= 0) break; s -= k; } }   // arquivo que não deixa pular direto
            final long total = Math.max(0, fim - ini + 1);
            InputStream corpo = new FilterInputStream(in) {
                long falta = total;
                @Override public int read() throws IOException { if (falta <= 0) return -1; int b = super.read(); if (b >= 0) falta--; return b; }
                @Override public int read(byte[] b, int o, int n) throws IOException {
                    if (falta <= 0) return -1;
                    int k = super.read(b, o, (int) Math.min(n, falta));
                    if (k > 0) falta -= k;
                    return k;
                }
                @Override public void close() throws IOException { super.close(); pfd.close(); }
            };
            Map<String, String> h = new HashMap<String, String>();
            h.put("Accept-Ranges", "bytes");
            h.put("Content-Length", String.valueOf(total));
            h.put("Cache-Control", "no-store");
            if (parte) h.put("Content-Range", "bytes " + ini + "-" + fim + "/" + tam);
            return new WebResourceResponse("application/octet-stream", null, parte ? 206 : 200, parte ? "Partial Content" : "OK", h, corpo);
        } catch (Exception e) {
            return vazio(500, "Erro");
        }
    }

    private static WebResourceResponse vazio(int codigo, String motivo) {
        return new WebResourceResponse("text/plain", "utf-8", codigo, motivo, new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
    }
}
