package dev.kofnes.android;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

// A rede do KOFstation no celular: o mesmo "idioma" do kofservico do PC (rede/PROTOCOLO.md). A página manda os mesmos
// pedidos em JSON (cmd) e recebe os mesmos eventos; a conta (chaves, cifra) é o núcleo em C (RedeNucleo). O celular só
// liga pros PCs (não escuta). Sem Android aqui dentro: o teste roda no Linux contra o kofservico de verdade.
public class Rede {
    public interface Eventos { void evento(String json); }
    public interface Guarda { String ler(String chave); void gravar(String chave, String valor); }

    static final String APP = "kofstation";
    static final int VERSAO = 1, PORTA = 8650;
    final Guarda guarda; final Eventos eventos; final String tipo;
    final SecureRandom aleatorio = new SecureRandom();
    final byte[] sk, pk; final String meuId;
    String nome;
    final List<JSONObject> pares = new ArrayList<JSONObject>();   // {pk, id, nome, tipo, ip, porta, visto}
    final Map<String, Con> cons = new HashMap<String, Con>();
    final List<String> tentando = new ArrayList<String>();
    public List<String> alvosAchar = new ArrayList<String>();   // "ip" ou "ip:porta"; o celular põe o broadcast da Wi-Fi
    volatile boolean parado;

    class Con {
        final Socket s; final OutputStream out; final byte[] canalEnv, canalRec; final String id; volatile long ultimo = System.currentTimeMillis();
        Con(Socket s, byte[] canal, String id) throws IOException { this.s = s; out = s.getOutputStream(); canalEnv = canal; canalRec = canal; this.id = id; }
    }

    public Rede(Guarda g, Eventos ev, String tipo, String nomePadrao) {
        guarda = g; eventos = ev; this.tipo = tipo;
        String h = g.ler("sk");
        if (h == null || h.length() != 64) { byte[] b = new byte[32]; aleatorio.nextBytes(b); h = hex(b); g.gravar("sk", h); }
        sk = dehex(h); pk = RedeNucleo.publica(sk); meuId = RedeNucleo.id(pk);
        String n = g.ler("nome"); nome = n != null && n.length() > 0 ? n : nomePadrao;
        try { String p = g.ler("pareados"); if (p != null) { JSONArray a = new JSONArray(p); for (int i = 0; i < a.length(); i++) pares.add(a.getJSONObject(i)); } } catch (Exception e) { }
        alvosAchar.add("255.255.255.255");
        Thread t = new Thread(new Runnable() { public void run() { relogio(); } }, "rede-relogio"); t.setDaemon(true); t.start();
    }

    // ---------------------------------------------------------------- pedidos da página (mesmo JSON do kofservico)
    public void cmd(String json) {
        try {
            final JSONObject j = new JSONObject(json); String t = j.optString("t");
            if (t.equals("eu")) { avisarLista(); solto(new Runnable() { public void run() { religarTodos(); } }); }   // o app abriu: liga pros PCs
            else if (t.equals("lista")) avisarLista();
            else if (t.equals("nome")) { String n = j.optString("nome").trim(); if (n.length() > 0) { nome = n.length() > 60 ? n.substring(0, 60) : n; guarda.gravar("nome", nome); } avisarLista(); }
            else if (t.equals("achar")) solto(new Runnable() { public void run() { evento(achar()); } });
            else if (t.equals("parear-com")) solto(new Runnable() { public void run() { parearCom(j.optString("ip"), j.optInt("porta", PORTA), j.optString("senha"), j.optString("modo", "c")); } });
            else if (t.equals("conectar")) { String id = j.optString("id"); JSONObject p = par(id); if (p != null) religar(p); }
            else if (t.equals("remover")) {
                String id = j.optString("id"); Con c;
                synchronized (this) { JSONObject p = par(id); if (p != null) pares.remove(p); gravarPares(); c = cons.remove(id); }
                if (c != null) fechar(c);
                avisarLista();
            } else if (t.equals("enviar")) {
                Con c; synchronized (this) { c = cons.get(j.optString("para")); }
                boolean ok = c != null && mandar(c, j.optString("canal"), j.optString("dados").getBytes(StandardCharsets.UTF_8));
                if (!ok) evento(new JSONObject().put("t", "nao-enviou").put("para", j.optString("para")));
            }
        } catch (Exception e) { }
    }
    public void parar() {
        parado = true; List<Con> l;
        synchronized (this) { l = new ArrayList<Con>(cons.values()); cons.clear(); }
        for (Con c : l) fechar(c);
    }

    // ---------------------------------------------------------------- achar PCs na rede (UDP)
    JSONObject achar() {
        JSONObject r = new JSONObject(); JSONArray lista = new JSONArray();
        try {
            r.put("t", "achados"); r.put("lista", lista);
            DatagramSocket s = new DatagramSocket(); s.setBroadcast(true); s.setSoTimeout(300);
            byte[] pedido = ("KOFR?" + APP).getBytes(StandardCharsets.UTF_8);
            for (String a : new ArrayList<String>(alvosAchar)) {
                int i = a.indexOf(':'); String ip = i < 0 ? a : a.substring(0, i); int po = i < 0 ? PORTA : Integer.parseInt(a.substring(i + 1));
                try { s.send(new DatagramPacket(pedido, pedido.length, InetAddress.getByName(ip), po)); } catch (IOException e) { }
            }
            List<String> vistos = new ArrayList<String>();
            long fim = System.currentTimeMillis() + 1500;
            byte[] b = new byte[700];
            while (System.currentTimeMillis() < fim) {
                DatagramPacket d = new DatagramPacket(b, b.length);
                try { s.receive(d); } catch (SocketTimeoutException e) { continue; }
                String txt = new String(d.getData(), 0, d.getLength(), StandardCharsets.UTF_8);
                if (!txt.startsWith("KOFR!")) continue;
                JSONObject f = new JSONObject(txt.substring(5)); String id = f.optString("id");
                if (!APP.equals(f.optString("app")) || id.length() != 16 || vistos.contains(id)) continue;
                vistos.add(id);
                String ip = d.getAddress().getHostAddress(); int porta = f.optInt("porta", PORTA);
                JSONObject p;
                synchronized (this) { p = par(id); if (p != null) { p.put("ip", ip); p.put("porta", porta); gravarPares(); } }
                lista.put(new JSONObject().put("id", id).put("ip", ip).put("porta", porta).put("nome", f.optString("nome")).put("tipo", f.optString("tipo")).put("pareado", p != null));
            }
            s.close();
        } catch (Exception e) { }
        return r;
    }

    // ---------------------------------------------------------------- pareamento
    void parearCom(String ip, int porta, String senha, String modo) {
        String erro = "não consegui falar com o PC (mesma Wi-Fi?)";
        Socket s = null;
        try {
            s = abrir(ip, porta);
            byte[] st = new byte[RedeNucleo.tamanho(0)], canal = new byte[RedeNucleo.tamanho(2)], sid = new byte[16], r = new byte[32];
            aleatorio.nextBytes(sid); aleatorio.nextBytes(r);
            byte[] m1 = RedeNucleo.parCliente(st, APP, senha, sid, r);
            mandarQuadro(s.getOutputStream(), ola('P', junta(new byte[] { (byte) (modo.equals("q") ? 'q' : 'c') }, m1)));
            DataInputStream in = new DataInputStream(s.getInputStream());
            byte[] q = lerQuadro(in);
            if (q.length > 0 && q[0] == 'X') { erro = new String(q, 1, q.length - 1, StandardCharsets.UTF_8); throw new IOException(); }
            byte[] m3 = q.length == 49 && q[0] == 'R' ? RedeNucleo.parCliente2(st, APP, java.util.Arrays.copyOfRange(q, 1, 49), canal) : null;
            if (m3 == null) { erro = "código errado"; throw new IOException(); }
            mandarQuadro(s.getOutputStream(), junta(new byte[] { 'F' }, m3));
            byte[] ficha = junta(new byte[] { 3, 'p', 'a', 'r' }, minhaFicha());
            mandarQuadro(s.getOutputStream(), RedeNucleo.cifrar(canal, ficha));
            byte[] f = RedeNucleo.decifrar(canal, lerQuadro(in));
            if (f == null || f.length < 39 || f[0] != 3) { erro = "código errado"; throw new IOException(); }
            JSONObject p = guardarFicha(java.util.Arrays.copyOfRange(f, 4, f.length), ip);
            s.close();
            evento(new JSONObject().put("t", "pareado").put("aparelho", new JSONObject().put("id", p.getString("id")).put("nome", p.getString("nome")).put("tipo", p.getString("tipo"))));
            avisarLista();
            religar(p);
        } catch (Exception e) {
            try { if (s != null) s.close(); } catch (IOException x) { }
            try { evento(new JSONObject().put("t", "par-erro").put("texto", erro)); } catch (Exception x) { }
        }
    }
    byte[] minhaFicha() {   // pk(32) | porta(2) | tipo_len | tipo | nome
        byte[] t = tipo.getBytes(StandardCharsets.UTF_8), n = nome.getBytes(StandardCharsets.UTF_8);
        ByteArrayOutputStream o = new ByteArrayOutputStream();
        o.write(pk, 0, 32); o.write(0); o.write(0); o.write(t.length); o.write(t, 0, t.length); o.write(n, 0, Math.min(n.length, 63));
        return o.toByteArray();
    }
    synchronized JSONObject guardarFicha(byte[] f, String ip) throws Exception {
        byte[] k = java.util.Arrays.copyOfRange(f, 0, 32); String id = RedeNucleo.id(k);
        JSONObject p = par(id); if (p == null) { p = new JSONObject(); pares.add(p); }
        int nt = f[34] & 255;
        p.put("pk", hex(k)).put("id", id).put("porta", (f[32] & 255) << 8 | (f[33] & 255)).put("ip", ip)
         .put("tipo", new String(f, 35, nt, StandardCharsets.UTF_8)).put("nome", new String(f, 35 + nt, f.length - 35 - nt, StandardCharsets.UTF_8))
         .put("visto", System.currentTimeMillis() / 1000);
        gravarPares();
        return p;
    }

    // ---------------------------------------------------------------- conexão com um PC pareado
    void religar(final JSONObject p) {
        final String id = p.optString("id");
        synchronized (this) { if (cons.containsKey(id) || tentando.contains(id) || p.optInt("porta") == 0) return; tentando.add(id); }
        solto(new Runnable() { public void run() {
            try { conectar(p); } finally { synchronized (Rede.this) { tentando.remove(id); } }
        } });
    }
    void conectar(JSONObject p) {
        Socket s = null; Con c = null;
        try {
            s = abrir(p.getString("ip"), p.getInt("porta"));
            byte[] st = new byte[RedeNucleo.tamanho(1)], canal = new byte[RedeNucleo.tamanho(2)], r = new byte[32];
            aleatorio.nextBytes(r);
            mandarQuadro(s.getOutputStream(), ola('C', RedeNucleo.conCliente(st, sk, r)));
            DataInputStream in = new DataInputStream(s.getInputStream());
            byte[] q = lerQuadro(in);
            byte[] m3 = q.length == 49 && q[0] == 'R' ? RedeNucleo.conCliente2(st, APP, sk, dehex(p.getString("pk")), java.util.Arrays.copyOfRange(q, 1, 49), canal) : null;
            if (m3 == null) throw new IOException(q.length > 0 && q[0] == 'X' ? new String(q, 1, q.length - 1, StandardCharsets.UTF_8) : "recusado");
            mandarQuadro(s.getOutputStream(), junta(new byte[] { 'F' }, m3));
            s.setSoTimeout(0);
            String id = p.getString("id");
            c = new Con(s, canal, id);
            Con velha;
            synchronized (this) { velha = cons.put(id, c); p.put("visto", System.currentTimeMillis() / 1000); gravarPares(); }
            if (velha != null) fechar(velha);
            avisarLista();
            for (;;) {   // lê até cair
                byte[] m = RedeNucleo.decifrar(c.canalRec, lerQuadro(in));
                if (m == null || m.length < 1) break;
                c.ultimo = System.currentTimeMillis();
                int nc = m[0] & 255; if (1 + nc > m.length) break;
                String canalNome = new String(m, 1, nc, StandardCharsets.UTF_8);
                if (nc == 0) { if (m.length == 2 && m[1] == 'p') mandar(c, "", new byte[] { 'P' }); continue; }
                evento(new JSONObject().put("t", "msg").put("de", id).put("canal", canalNome).put("dados", new String(m, 1 + nc, m.length - 1 - nc, StandardCharsets.UTF_8)));
            }
        } catch (Exception e) {
        } finally {
            try { if (s != null) s.close(); } catch (IOException x) { }
            if (c != null) {
                boolean era; synchronized (this) { era = cons.get(c.id) == c; if (era) cons.remove(c.id); }
                if (era) avisarLista();
            }
        }
    }
    boolean mandar(Con c, String canal, byte[] d) {
        byte[] cn = canal.getBytes(StandardCharsets.UTF_8);
        if (cn.length > 255) return false;
        byte[] m = new byte[1 + cn.length + d.length];
        m[0] = (byte) cn.length; System.arraycopy(cn, 0, m, 1, cn.length); System.arraycopy(d, 0, m, 1 + cn.length, d.length);
        try { synchronized (c) { mandarQuadro(c.out, RedeNucleo.cifrar(c.canalEnv, m)); } return true; }
        catch (IOException e) { fechar(c); return false; }
    }
    void fechar(Con c) { try { c.s.close(); } catch (IOException e) { } }

    // ping a cada 15 s (45 s sem nada = caiu) e religa os PCs pareados fora do ar a cada 30 s
    void relogio() {
        for (int tique = 1; !parado; tique++) {
            try { Thread.sleep(5000); } catch (InterruptedException e) { return; }
            List<Con> l; synchronized (this) { l = new ArrayList<Con>(cons.values()); }
            for (Con c : l) {
                if (System.currentTimeMillis() - c.ultimo > 45000) fechar(c);
                else if (tique % 3 == 0) mandar(c, "", new byte[] { 'p' });
            }
            if (tique % 6 == 0) religarTodos();
        }
    }
    public void religarTodos() {
        boolean falta = false;
        synchronized (this) { for (JSONObject p : pares) if (!cons.containsKey(p.optString("id"))) falta = true; }
        if (!falta) return;
        achar();
        List<JSONObject> l; synchronized (this) { l = new ArrayList<JSONObject>(pares); }
        for (JSONObject p : l) religar(p);
    }

    // ---------------------------------------------------------------- miúdos
    JSONObject par(String id) { for (JSONObject p : pares) if (p.optString("id").equals(id)) return p; return null; }
    void gravarPares() { JSONArray a = new JSONArray(); for (JSONObject p : pares) a.put(p); guarda.gravar("pareados", a.toString()); }
    void avisarLista() {
        try {
            JSONObject r = new JSONObject().put("t", "lista").put("eu", new JSONObject().put("id", meuId).put("nome", nome).put("visivel", false));
            JSONArray a = new JSONArray();
            synchronized (this) {
                for (JSONObject p : pares) a.put(new JSONObject().put("id", p.optString("id")).put("nome", p.optString("nome")).put("tipo", p.optString("tipo"))
                    .put("online", cons.containsKey(p.optString("id"))).put("visto", p.optLong("visto")).put("ip", p.optString("ip")));
            }
            evento(r.put("aparelhos", a));
        } catch (Exception e) { }
    }
    void evento(JSONObject j) { eventos.evento(j.toString()); }
    void solto(Runnable r) { Thread t = new Thread(r, "rede"); t.setDaemon(true); t.start(); }
    Socket abrir(String ip, int porta) throws IOException {
        Socket s = new Socket(); s.connect(new InetSocketAddress(ip, porta), 4000); s.setTcpNoDelay(true); s.setSoTimeout(10000); return s;
    }
    static byte[] ola(char modo, byte[] corpo) {
        byte[] a = APP.getBytes(StandardCharsets.UTF_8);
        byte[] h = new byte[8 + a.length];
        h[0] = 'K'; h[1] = 'O'; h[2] = 'F'; h[3] = 'R'; h[4] = VERSAO; h[5] = (byte) modo; h[6] = 0; h[7] = (byte) a.length;
        System.arraycopy(a, 0, h, 8, a.length);
        return junta(h, corpo);
    }
    static void mandarQuadro(OutputStream o, byte[] d) throws IOException {
        byte[] q = new byte[4 + d.length];
        q[0] = (byte) (d.length >>> 24); q[1] = (byte) (d.length >>> 16); q[2] = (byte) (d.length >>> 8); q[3] = (byte) d.length;
        System.arraycopy(d, 0, q, 4, d.length); o.write(q); o.flush();
    }
    static byte[] lerQuadro(DataInputStream in) throws IOException {
        int n = in.readInt(); if (n < 0 || n > (1 << 20) + 512) throw new IOException("quadro grande");
        byte[] d = new byte[n]; in.readFully(d); return d;
    }
    static byte[] junta(byte[] a, byte[] b) { byte[] r = new byte[a.length + b.length]; System.arraycopy(a, 0, r, 0, a.length); System.arraycopy(b, 0, r, a.length, b.length); return r; }
    static String hex(byte[] b) { StringBuilder s = new StringBuilder(); for (byte x : b) s.append(String.format("%02x", x & 255)); return s.toString(); }
    static byte[] dehex(String h) { byte[] b = new byte[h.length() / 2]; for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(h.substring(2 * i, 2 * i + 2), 16); return b; }

    // teste no Linux: java -Djava.library.path=rede/saida -cp <classes>:<org.json> dev.kofnes.android.Rede <pasta> [achar=ip:porta]
    // lê pedidos JSON da entrada (um por linha) e escreve os eventos na saída
    public static void main(String[] a) throws Exception {
        final java.io.File pasta = new java.io.File(a[0]); pasta.mkdirs();
        Guarda g = new Guarda() {
            public String ler(String k) { try { return new String(java.nio.file.Files.readAllBytes(new java.io.File(pasta, k).toPath()), StandardCharsets.UTF_8); } catch (IOException e) { return null; } }
            public void gravar(String k, String v) { try { java.nio.file.Files.write(new java.io.File(pasta, k).toPath(), v.getBytes(StandardCharsets.UTF_8)); } catch (IOException e) { } }
        };
        final Object trava = new Object();
        final java.io.PrintStream saida = new java.io.PrintStream(new java.io.FileOutputStream(java.io.FileDescriptor.out), true, "UTF-8");
        Rede r = new Rede(g, new Eventos() { public void evento(String j) { synchronized (trava) { saida.println(j); } } }, "celular", "Celular de teste");
        if (a.length > 1) { r.alvosAchar.clear(); r.alvosAchar.add(a[1]); }
        java.io.BufferedReader in = new java.io.BufferedReader(new java.io.InputStreamReader(System.in, StandardCharsets.UTF_8));
        for (String l; (l = in.readLine()) != null; ) r.cmd(l);
        r.parar();
    }
}
