// SavesNativos (os saves do PS1/N64 nativos no backup): roda com testes/android/teste-saves-nativos.sh
package dev.kofnes.android;
import java.io.File;
public class TesteSavesNativos {
  public static void main(String[] a) throws Exception {
    File b = new File(a[0]); int f = 0;
    if (!SavesNativos.gravar(b, "ps1-saves/Jogo.mcd", new byte[]{1,2,3}, 1000000000000L)) { System.out.println("FALHA gravar"); f++; }
    byte[] l = SavesNativos.ler(b, "ps1-saves/Jogo.mcd");
    if (l == null || l.length != 3 || l[2] != 3) { System.out.println("FALHA ler"); f++; }
    String j = SavesNativos.listar(b);
    if (!j.contains("\"nome\":\"ps1-saves/Jogo.mcd\"") || !j.contains("\"quando\":1000000000000")) { System.out.println("FALHA listar " + j); f++; }
    for (String ruim : new String[]{"../x", "ps1-saves/../../x", "outra/x.mcd", "ps1-saves/", "ps1-saves/.escondido", "ps1-saves/a/b"})
      if (SavesNativos.gravar(b, ruim, new byte[]{9}, 0) || SavesNativos.ler(b, ruim) != null) { System.out.println("FALHA aceitou " + ruim); f++; }
    System.out.println(f == 0 ? "ok    SavesNativos: grava, lê, lista e recusa caminho fora das pastas de save" : f + " falha(s)");
    System.exit(f);
  }
}
