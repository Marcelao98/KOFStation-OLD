# Base de jogos da busca

`jogos.json.gz` é gerado por `montar.py` a partir dos arquivos `rdb/*.rdb` do
[libretro-database](https://github.com/libretro/libretro-database) (a base do RetroArch).

**Licença:** os dados do libretro-database são distribuídos sob a
[Creative Commons Atribuição-CompartilhaIgual 4.0 (CC BY-SA 4.0)](https://creativecommons.org/licenses/by-sa/4.0/).
O `jogos.json.gz` é uma adaptação desses dados e segue a mesma licença: as versões de cada jogo (regiões, revisões)
foram juntadas num registro só, os gêneros foram traduzidos e agrupados (`GENERO` no `montar.py`), nomes de empresa
foram limpos e jogos sem informação foram tirados. O crédito aparece no app (Ajuda > Guia).

Refazer: `python3 web/jogos/montar.py` (baixa os .rdb pra `web/jogos/.rdb/`, que não vai pro git).
