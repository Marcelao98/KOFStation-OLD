package dev.kofnes.android;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.security.MessageDigest;
import java.util.Enumeration;
import java.util.Random;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * O celular como controle do PC: um servidor WebSocket mínimo na rede de casa (nada passa pela internet). A página do
 * KOFstation no PC conecta em ws://<ip do celular>:<porta>, manda "KOF <senha>" e, aceita, recebe 6 bytes a cada mudança:
 * botões (2 bytes, no formato do registrador do SNES que o app usa) e os 4 eixos (1 byte com sinal cada). O PC manda de
 * volta "JOGO <console>\t<nome>" quando abre um jogo: a página do celular troca o controle pro daquele console. Sem nada de
 * Android dentro: dá pra testar no Linux (testes/android/teste-controle.sh).
 */
final class ControleServidor {
    static final int PORTA = 8642;
    private final CopyOnWriteArrayList<Socket> clientes = new CopyOnWriteArrayList<Socket>();
    private ServerSocket servidor;
    private volatile byte[] ultimo = new byte[6];
    final String senha;
    final int porta;
    volatile String nomePc = "";
    volatile String jogo = "";   // "<console>\t<nome do jogo>" do último "JOGO" que o PC mandou ("" = nenhum jogo aberto)

    ControleServidor(String senha, int porta) throws Exception {
        this.senha = senha;
        ServerSocket s;
        try { s = new ServerSocket(porta); } catch (Exception e) { s = new ServerSocket(0); }   // porta ocupada: qualquer uma
        servidor = s; this.porta = s.getLocalPort();
        Thread t = new Thread(new Runnable() { public void run() { aceitar(); } }, "KOFcontrole");
        t.setDaemon(true); t.start();
    }

    static String novaSenha() { return String.format("%04d", new Random().nextInt(10000)); }

    /** O IPv4 da rede de casa (Wi-Fi): o primeiro endereço local que não seja o 127.0.0.1. */
    static String ipLocal() {
        try {
            String local = null, reserva = null;
            for (Enumeration<NetworkInterface> e = NetworkInterface.getNetworkInterfaces(); e != null && e.hasMoreElements(); ) {
                NetworkInterface ni = e.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (Enumeration<InetAddress> a = ni.getInetAddresses(); a.hasMoreElements(); ) {
                    InetAddress x = a.nextElement();
                    if (!(x instanceof Inet4Address)) continue;
                    if (x.isSiteLocalAddress() && ni.getName().startsWith("wlan")) return x.getHostAddress();
                    if (x.isSiteLocalAddress() && local == null) local = x.getHostAddress();   // 192.168/10/172.16: rede de casa
                    if (reserva == null) reserva = x.getHostAddress();                        // 4G etc.: o PC não alcança
                }
            }
            return local != null ? local : reserva == null ? "" : reserva;
        } catch (Exception e) { return ""; }
    }

    /** O endereço é de rede de casa (Wi-Fi/roteador)? Se não, o celular provavelmente está no 4G ou numa VPN. */
    static boolean redeDeCasa(String ip) {
        try { return !ip.isEmpty() && InetAddress.getByName(ip).isSiteLocalAddress(); } catch (Exception e) { return false; }
    }

    int conectados() { return clientes.size(); }

    /** Chamado quando o PC muda o jogo (os testes usam pra repassar; o app lê o jogo pelo controleEstado). */
    volatile Runnable ouvinte;

    void parar() {
        try { servidor.close(); } catch (Exception e) { /* já fechado */ }
        for (Socket c : clientes) try { c.close(); } catch (Exception e) { /* idem */ }
        clientes.clear();
    }

    /** Botões e eixos (eixos = 4 bytes com sinal num int, como a página manda pro núcleo nativo). */
    void enviar(int botoes, int eixos) {
        byte[] m = { (byte) botoes, (byte) (botoes >> 8), (byte) eixos, (byte) (eixos >> 8), (byte) (eixos >> 16), (byte) (eixos >> 24) };
        ultimo = m;
        for (Socket c : clientes) mandar(c, 0x82, m);
    }

    private void aceitar() {
        while (!servidor.isClosed()) {
            try {
                final Socket c = servidor.accept();
                c.setTcpNoDelay(true);   // pacotes pequenos saem na hora: é isso que deixa o controle sem atraso
                new Thread(new Runnable() { public void run() { atender(c); } }, "KOFcontrole-pc").start();
            } catch (Exception e) { /* servidor fechado */ }
        }
    }

    private void atender(Socket c) {
        try {
            InputStream in = c.getInputStream();
            String chave = null, primeira = linha(in);
            for (String l; !(l = linha(in)).isEmpty(); ) if (l.toLowerCase().startsWith("sec-websocket-key:")) chave = l.substring(18).trim();
            if (chave == null) { paginaAchado(c, primeira); return; }
            String aceite = base64(MessageDigest.getInstance("SHA-1").digest((chave + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").getBytes("UTF-8")));
            OutputStream o = c.getOutputStream();
            o.write(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + aceite + "\r\n\r\n").getBytes("UTF-8"));
            o.flush();
            boolean aceito = false;
            while (true) {
                int b0 = in.read(), b1 = in.read();
                if (b0 < 0 || b1 < 0) break;
                int op = b0 & 15; long n = b1 & 127;
                if (n == 126) n = (in.read() << 8) | in.read();
                else if (n == 127) { n = 0; for (int i = 0; i < 8; i++) n = (n << 8) | in.read(); }
                if (n > 4096) break;
                byte[] mask = new byte[4];
                if ((b1 & 128) != 0) for (int i = 0; i < 4; i++) mask[i] = (byte) in.read();
                byte[] d = new byte[(int) n];
                for (int i = 0; i < n; i++) { int v = in.read(); if (v < 0) throw new Exception("fim"); d[i] = (byte) (v ^ mask[i & 3]); }
                if (op == 8) break;                                     // fechou
                if (op == 9) { mandar(c, 0x8A, d); continue; }          // ping -> pong
                if (op == 1 && !aceito) {
                    String t = new String(d, "UTF-8");
                    if (!t.startsWith("KOF ") || !t.substring(4).trim().startsWith(senha)) { mandar(c, 0x81, "senha errada".getBytes("UTF-8")); break; }
                    String resto = t.substring(4).trim().substring(senha.length()).trim();
                    nomePc = resto.isEmpty() ? "PC" : resto;
                    aceito = true; clientes.add(c);
                    mandar(c, 0x81, "ok".getBytes("UTF-8"));
                    mandar(c, 0x82, ultimo);
                    continue;
                }
                if (op == 1) {   // depois de aceito: o PC conta qual jogo abriu
                    String t = new String(d, "UTF-8");
                    if (t.startsWith("JOGO")) { jogo = t.substring(4).trim(); if (ouvinte != null) ouvinte.run(); }
                }
            }
        } catch (Exception e) { /* caiu */ }
        clientes.remove(c);
        try { c.close(); } catch (Exception e) { /* já fechado */ }
    }

    /**
     * Pedido HTTP comum (alguém abriu http://<ip>:<porta> no navegador do PC): responde uma página dizendo que achou o
     * celular. Serve pra separar "a rede não deixa o PC ver o celular" de "o navegador bloqueia o app de falar com a rede
     * local". O OPTIONS responde a pré-verificação de rede privada do Chrome.
     */
    private static void paginaAchado(Socket c, String primeira) {
        try {
            String html = "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>KOFstation</title>"
                + "<body style='font:18px sans-serif;max-width:34em;margin:2em auto;padding:0 1em'><h1>✅ Celular achado</h1>"
                + "<p>O PC enxerga o KOFstation do celular nesta rede. Volte pro KOFstation do PC e digite o endereço e a senha que "
                + "aparecem no celular.</p><p>Se esta página abre mas o KOFstation do PC não conecta, é o navegador bloqueando o "
                + "acesso à rede local: abra o KOFstation pelo KOFstation.exe ou pelo kofnes.sh atualizados (eles liberam isso só "
                + "pra janela do KOFstation) ou permita \"Acesso à rede local\" quando o navegador perguntar.</p>";
            byte[] b = primeira.startsWith("OPTIONS ") ? new byte[0] : html.getBytes("UTF-8");
            String cab = (primeira.startsWith("OPTIONS ") ? "HTTP/1.1 204 No Content" : "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8")
                + "\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Private-Network: true\r\nAccess-Control-Allow-Local-Network: true"
                + "\r\nContent-Length: " + b.length + "\r\nConnection: close\r\n\r\n";
            OutputStream o = c.getOutputStream(); o.write(cab.getBytes("UTF-8")); o.write(b); o.flush();
        } catch (Exception e) { /* caiu */ }
        try { c.close(); } catch (Exception e) { /* já fechado */ }
    }

    private static void mandar(Socket c, int cab, byte[] d) {
        try {
            byte[] q = new byte[2 + d.length];
            q[0] = (byte) cab; q[1] = (byte) d.length;   // mensagens sempre menores que 126 bytes
            System.arraycopy(d, 0, q, 2, d.length);
            synchronized (c) { OutputStream o = c.getOutputStream(); o.write(q); o.flush(); }
        } catch (Exception e) { try { c.close(); } catch (Exception x) { /* idem */ } }
    }

    private static String linha(InputStream in) throws Exception {
        StringBuilder s = new StringBuilder();
        for (int b; (b = in.read()) >= 0; ) { if (b == '\n') break; if (b != '\r') s.append((char) b); if (s.length() > 4096) break; }
        return s.toString();
    }

    private static String base64(byte[] b) {
        String t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        StringBuilder s = new StringBuilder();
        for (int i = 0; i < b.length; i += 3) {
            int v = (b[i] & 255) << 16 | (i + 1 < b.length ? (b[i + 1] & 255) << 8 : 0) | (i + 2 < b.length ? b[i + 2] & 255 : 0);
            s.append(t.charAt(v >> 18 & 63)).append(t.charAt(v >> 12 & 63)).append(i + 1 < b.length ? t.charAt(v >> 6 & 63) : '=').append(i + 2 < b.length ? t.charAt(v & 63) : '=');
        }
        return s.toString();
    }

    /** Pros testes: servidor com senha fixa que fica mandando um padrão de botões. */
    public static void main(String[] a) throws Exception {
        ControleServidor s = new ControleServidor(a.length > 0 ? a[0] : "1234", a.length > 1 ? Integer.parseInt(a[1]) : PORTA);
        System.out.println("porta " + s.porta + " ip " + ipLocal());
        if (a.length > 2 && a[2].equals("entrada")) {   // o teste repassa o que a página do celular mandou: "botoes eixos" por linha
            final ControleServidor srv = s;   // e lê aqui o estado que a página do celular mostraria (o controleEstado do app)
            s.ouvinte = new Runnable() { public void run() { System.out.println("ESTADO " + srv.conectados() + "\t" + srv.nomePc + "\t" + srv.jogo); System.out.flush(); } };
            new Thread(new Runnable() { public void run() {
                int antes = -1;
                while (true) { int n = srv.conectados(); if (n != antes) { antes = n; srv.ouvinte.run(); } try { Thread.sleep(50); } catch (Exception e) { return; } }
            } }).start();
            java.io.BufferedReader r = new java.io.BufferedReader(new java.io.InputStreamReader(System.in));
            for (String l; (l = r.readLine()) != null; ) { String[] p = l.trim().split(" "); s.enviar(Integer.parseInt(p[0]), Integer.parseInt(p[1])); }
            return;
        }
        int[] seq = { 0x0080, 0x0100 | 0x8000, 0 };   // A; direita + B; nada
        for (int i = 0; ; i++) {
            Thread.sleep(100);
            int k = (i / 10) % 3;
            s.enviar(seq[k], k == 1 ? (127 & 255) | ((-64 & 255) << 8) : 0);   // eixo X todo pra direita, Y meio pra cima
        }
    }
}
