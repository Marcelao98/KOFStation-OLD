// Painel de imagem do KOFstation: um shader só (WebGL 1) com todos os ajustes como parâmetros, mais as predefinições.
// Inspirado nos shaders do RetroArch (sharp-bilinear, ScaleFX/xBR, crt-geom/royale/lottes, blargg NTSC, vhs, lcd-grid,
// gameboy, gba-color, daltonize), mas escrito do zero aqui: nenhuma linha copiada de lá.
// Cada ajuste: [id, grupo, nome, mínimo, máximo, passo, padrão, opções (lista de nomes, quando é escolha)]
const KofVisual = (() => {
  'use strict';
  const AJUSTES = [
    ['pixel', 'Pixels', 'Desenho do pixel', 0, 5, 1, 1, ['Nítido', 'Nítido suave', 'Suave', 'Arredondado (HD)', 'Pintura', 'Desenho animado']],
    ['linhas', 'TV', 'Linhas de varredura', 0, 1, 0.05, 0],
    ['grossas', 'TV', 'Linhas mais grossas no claro', 0, 1, 0.05, 0],
    ['mascara', 'TV', 'Máscara de fósforo', 0, 1, 0.05, 0],
    ['mascaraTipo', 'TV', 'Tipo de máscara', 0, 2, 1, 0, ['Grade (tubo Trinitron)', 'Fenda (TV comum)', 'Pontinhos (monitor)']],
    ['mascaraTam', 'TV', 'Tamanho da máscara', 1, 3, 1, 1],
    ['curva', 'TV', 'Curvatura', 0, 1, 0.05, 0],
    ['cantos', 'TV', 'Cantos arredondados', 0, 1, 0.05, 0],
    ['vinheta', 'TV', 'Vinheta (bordas escuras)', 0, 1, 0.05, 0],
    ['glow', 'TV', 'Brilho que espalha', 0, 1, 0.05, 0],
    ['converg', 'TV', 'Cores desalinhadas', 0, 1, 0.05, 0],
    ['composto', 'Sinal', 'Cabo composto (cor borrada)', 0, 1, 0.05, 0],
    ['vhs', 'Sinal', 'Fita VHS', 0, 1, 0.05, 0],
    ['chiado', 'Sinal', 'Chiado', 0, 1, 0.05, 0],
    ['tremor', 'Sinal', 'Imagem tremendo', 0, 1, 0.05, 0],
    ['rastro', 'Portátil', 'Rastro (tela lenta)', 0, 1, 0.05, 0],
    ['lcd', 'Portátil', 'Grade do LCD', 0, 1, 0.05, 0],
    ['verde', 'Portátil', 'Tela verde (tijolão)', 0, 1, 0.05, 0],
    ['portatil', 'Portátil', 'Cor de tela de portátil', 0, 1, 0.05, 0],
    ['brilho', 'Cor', 'Brilho', -0.3, 0.3, 0.02, 0],
    ['contraste', 'Cor', 'Contraste', 0.5, 1.5, 0.05, 1],
    ['saturacao', 'Cor', 'Saturação', 0, 2, 0.05, 1],
    ['gama', 'Cor', 'Gama', 0.6, 1.6, 0.05, 1],
    ['temperatura', 'Cor', 'Temperatura (frio ↔ quente)', -1, 1, 0.05, 0],
    ['sepia', 'Cor', 'Sépia', 0, 1, 0.05, 0],
    ['pb', 'Cor', 'Preto e branco', 0, 1, 0.05, 0],
    ['dalton', 'Cor', 'Corrigir daltonismo', 0, 3, 1, 0, ['Desligado', 'Protanopia (vermelho)', 'Deuteranopia (verde)', 'Tritanopia (azul)']],
    ['polaroid', 'Foto', 'Polaroid (com a moldura de papel)', 0, 1, 0.05, 0],
    ['lomo', 'Foto', 'Lomo (cantos escuros, cor forte)', 0, 1, 0.05, 0],
    ['filme', 'Foto', 'Filme antigo (grão e arranhões)', 0, 1, 0.05, 0],
    ['vazamento', 'Foto', 'Vazamento de luz', 0, 1, 0.05, 0],
    ['duotone', 'Foto', 'Duas cores (duotone)', 0, 1, 0.05, 0],
    ['duotoneCor', 'Foto', 'Cores do duotone', 0, 3, 1, 0, ['Rosa e azul', 'Amarelo e roxo', 'Ciano e vinho', 'Laranja e verde-escuro']],
    ['cinema', 'Foto', 'Azul e laranja (filme de Hollywood)', 0, 1, 0.05, 0],
    ['desfoque', 'Foto', 'Fundo desfocado (retrato)', 0, 1, 0.05, 0],
    ['pontilhado', 'Retrô', 'Pontilhado de 1 bit', 0, 1, 0.05, 0],
    ['cga', 'Retrô', 'Paleta de 4 cores (CGA)', 0, 1, 0.05, 0],
    ['fosforo', 'Retrô', 'Monitor de fósforo', 0, 1, 0.05, 0],
    ['fosforoCor', 'Retrô', 'Cor do fósforo', 0, 2, 1, 0, ['Verde', 'Âmbar', 'Branco azulado']],
    ['pixelao', 'Retrô', 'Pixelão (estilo Atari)', 0, 1, 0.05, 0],
    ['gibi', 'Retrô', 'Revista em quadrinhos', 0, 1, 0.05, 0],
    ['neon', 'Retrô', 'Neon (synthwave)', 0, 1, 0.05, 0],
    ['foraDoAr', 'Efeitos', 'Fora do ar (chuvisco)', 0, 1, 0.05, 0],
    ['rolagem', 'Efeitos', 'Imagem rolando (vertical solto)', 0, 1, 0.05, 0],
    ['interferencia', 'Efeitos', 'Barra de interferência', 0, 1, 0.05, 0],
    ['glitch', 'Efeitos', 'Glitch', 0, 1, 0.05, 0],
    ['onda', 'Efeitos', 'Ondulação', 0, 1, 0.05, 0],
    ['ondaTipo', 'Efeitos', 'Tipo de ondulação', 0, 1, 1, 0, ['Onda de calor', 'Debaixo d\'água']],
    ['filmadora', 'Efeitos', 'Filmadora (PLAY e data na tela)', 0, 1, 1, 0, ['Desligada', 'Ligada']],
    ['ligarTv', 'Efeitos', 'TV ligando ao abrir o jogo', 0, 1, 1, 0, ['Não', 'Sim']],
    ['teste', 'Efeitos', 'Barras de teste quando pausa', 0, 1, 1, 0, ['Não', 'Sim']],
    // passadas extras (o app desenha em etapas): sinal NTSC de verdade, pixel art ampliado e o brilho que vaza
    ['ntsc', 'Sinal', 'NTSC de verdade (o sinal da TV)', 0, 1, 0.05, 0],
    ['ntscTipo', 'Sinal', 'Cabo do NTSC', 0, 2, 1, 1, ['S-Vídeo (limpo)', 'Composto (cabo amarelo)', 'Antena (RF)']],
    ['ampliar', 'Pixels', 'Ampliar pixel art (bordas lisas)', 0, 2, 1, 0, ['Desligado', 'Scale2x', 'Scale4x (mais liso)']],
    ['nitidez', 'Pixels', 'Nitidez (estilo FSR)', 0, 1, 0.05, 0],
    ['traco', 'Pixels', 'Traço reforçado (desenho)', 0, 1, 0.05, 0],
    ['bloom', 'TV', 'Brilho que vaza de verdade (bloom)', 0, 1, 0.05, 0],
    ['bloomRaio', 'TV', 'Tamanho do brilho', 0.5, 3, 0.25, 1],
    ['reflexo', 'TV', 'Reflexo na borda do vidro', 0, 1, 0.05, 0],
    ['sombra', 'Portátil', 'Sombra dos pixels no fundo do LCD', 0, 1, 0.05, 0],
    ['refletiva', 'Portátil', 'Tela sem luz (GBA antigo)', 0, 1, 0.05, 0],
  ];
  // os ajustes que só existem com as passadas extras ou que vieram depois do PS2 nativo (o kofnativo lê 13 vec4)
  const NOVOS = ['ntsc', 'ntscTipo', 'ampliar', 'nitidez', 'traco', 'bloom', 'bloomRaio', 'reflexo', 'sombra', 'refletiva'];
  const PADRAO = Object.fromEntries(AJUSTES.map((a) => [a[0], a[6]]));
  // predefinições: só o que muda do padrão
  const PREDEF = [
    ['original', 'Original', 'pixel nítido sem tremer, do jeitinho que o console desenha', {}],
    ['nitido', 'Nítido e vivo', 'pixel quadradão com cor forte', { pixel: 0, contraste: 1.15, saturacao: 1.3 }],
    ['suave', 'Suave', 'borrado, cara de emulador antigo', { pixel: 2 }],
    ['tv', 'TV de tubo da sala', 'linhas, fósforo, curva e o cabo composto', { linhas: 0.6, grossas: 0.6, mascara: 0.6, mascaraTipo: 1, mascaraTam: 2, curva: 0.55, cantos: 0.6, vinheta: 0.35, glow: 0.3, composto: 0.55, converg: 0.35, saturacao: 1.1 }],
    ['fliperama', 'Monitor de fliperama', 'linhas grossas, cor estourada e brilho', { linhas: 1, grossas: 1, mascara: 0.8, mascaraTam: 3, glow: 0.7, curva: 0.3, cantos: 0.4, vinheta: 0.25, saturacao: 1.3, contraste: 1.1 }],
    ['pvm', 'Monitor de estúdio', 'linhas finas e retas, imagem reta e afiada', { linhas: 0.9, grossas: 0.4, mascara: 0.5, contraste: 1.1, saturacao: 1.1 }],
    ['locadora', 'Locadora 1996', 'fita gasta, chiado e cor borrada', { pixel: 2, vhs: 1, chiado: 0.45, composto: 1, saturacao: 0.8, linhas: 0.3, vinheta: 0.25, tremor: 0.5, temperatura: 0.2, brilho: 0.04 }],
    ['vo', 'TV da vó', 'tubo bem curvo, amarelado, antena de bombril', { pixel: 2, curva: 1, cantos: 1, vinheta: 0.6, sepia: 0.5, tremor: 0.5, chiado: 0.25, linhas: 0.45, composto: 0.6, brilho: 0.04 }],
    ['gameboy', 'Game Boy tijolão', 'tela verde, grade e rastro', { pixel: 0, lcd: 0.8, rastro: 0.6, verde: 1, brilho: 0.04 }],
    ['gbc', 'Portátil colorido', 'grade e as cores lavadas da tela', { pixel: 0, lcd: 0.75, rastro: 0.35, portatil: 1 }],
    ['hd', 'HD de mentirinha', 'contorno arredondado, parece desenho vetorial', { pixel: 3, saturacao: 1.1 }],
    ['pintura', 'Pintura', 'pinceladas, tipo quadro a óleo', { pixel: 4, saturacao: 1.25, contraste: 1.05 }],
    ['cartoon', 'Desenho animado', 'contorno preto e cor chapada', { pixel: 5, saturacao: 1.2 }],
    ['sonho', 'Sonho', 'borrado brilhando, cor de sonho', { pixel: 2, glow: 1, saturacao: 1.5, brilho: 0.05, vinheta: 0.3 }],
    ['cafe', 'Café (sépia)', 'foto antiga', { pixel: 2, sepia: 1, vinheta: 0.7, contraste: 0.9, chiado: 0.15 }],
    ['polaroid95', 'Polaroid de 1995', 'foto desbotada com luz vazando', { polaroid: 1, vazamento: 0.6, filme: 0.3 }],
    ['filmadora', 'Fita da filmadora', 'PLAY, data e a fita gasta', { vhs: 0.7, chiado: 0.3, composto: 0.7, filmadora: 1, linhas: 0.2, saturacao: 0.85 }],
    ['terminal', 'Terminal anos 80', 'monitor de fósforo verde', { fosforo: 1, linhas: 0.7, curva: 0.4, cantos: 0.5, vinheta: 0.5, glow: 0.5 }],
    ['ambar', 'Monitor âmbar', 'o laranja dos computadores antigos', { fosforo: 1, fosforoCor: 1, linhas: 0.6, curva: 0.3, cantos: 0.4, glow: 0.4 }],
    ['synthwave', 'Synthwave', 'só os contornos em neon', { neon: 1, glow: 0.8, linhas: 0.3 }],
    ['gibi', 'Gibi', 'retícula, contorno e cor chapada', { gibi: 1, saturacao: 1.3 }],
    ['cinemamudo', 'Cinema mudo', 'preto e branco, grão e arranhões', { pb: 1, filme: 1, vinheta: 0.7, contraste: 1.2, tremor: 0.3 }],
    ['lomo', 'Lomo', 'cantos escuros e cor estourada', { lomo: 1, vazamento: 0.3 }],
    ['duotone', 'Capa de disco', 'duas cores, rosa e azul', { duotone: 1 }],
    ['hollywood', 'Hollywood', 'azul e laranja com fundo desfocado', { cinema: 1, desfoque: 0.6, vinheta: 0.3 }],
    ['mac', 'Macintosh 1984', 'pontilhado preto e branco', { pontilhado: 1, pixel: 0 }],
    ['cgapc', 'PC CGA', 'quatro cores: ciano, magenta, branco e preto', { cga: 1, pixel: 0 }],
    ['atari', 'Pixelão', 'pixel enorme, estilo Atari', { pixelao: 0.45, saturacao: 1.3, contraste: 1.1 }],
    ['glitch', 'Glitch', 'imagem quebrando de vez em quando', { glitch: 0.8, chiado: 0.15 }],
    ['foradoar', 'Fora do ar', 'chuvisco por cima do jogo', { foraDoAr: 0.45, rolagem: 0.15, interferencia: 0.6 }],
    ['trinitron', 'Trinitron', 'a TV boa da época: grade fina, brilho que vaza de leve e reflexo no vidro', { linhas: 0.55, grossas: 0.5, mascara: 0.55, mascaraTam: 1, curva: 0.25, cantos: 0.4, vinheta: 0.25, bloom: 0.45, reflexo: 0.5, saturacao: 1.1, ntsc: 0.6, ntscTipo: 0 }],
    ['pvmpro', 'Monitor PVM', 'linhas bem marcadas, imagem reta, cor de estúdio', { linhas: 1, grossas: 0.7, mascara: 0.35, bloom: 0.3, contraste: 1.08, saturacao: 1.1 }],
    ['tubobarato', 'TV de tubo barata', 'antena, cor vazando, tubo curvo e brilho espalhando', { ntsc: 0.8, ntscTipo: 2, linhas: 0.45, mascara: 0.4, mascaraTipo: 1, mascaraTam: 2, curva: 0.55, cantos: 0.7, vinheta: 0.45, bloom: 0.3, bloomRaio: 1.5, reflexo: 0.6, contraste: 1.05 }],
    ['ntsc', 'NTSC (cabo amarelo)', 'o sinal de vídeo de verdade: pontilhado vira transparência, como na TV', { ntsc: 1, ntscTipo: 1 }],
    ['svideo', 'S-Vídeo', 'o cabo bom: cor limpa, sem arco-íris', { ntsc: 1, ntscTipo: 0 }],
    ['pixelhd', 'Pixel art HD', 'bordas lisas sem borrar (Scale4x)', { ampliar: 2, nitidez: 0.25 }],
    ['tv4k', 'TV 4K', 'ampliado macio e afiado de volta (estilo FSR)', { pixel: 2, nitidez: 0.8 }],
    ['desenho', 'Traço de desenho', 'contorno reforçado, cara de animação', { ampliar: 2, traco: 0.7, saturacao: 1.15 }],
    ['dmg', 'Game Boy original', 'tela verde, grade, rastro e sombra dos pixels', { pixel: 0, lcd: 0.85, rastro: 0.6, verde: 1, sombra: 0.7, brilho: 0.03 }],
    ['pocket', 'Game Boy Pocket', 'tela prateada, preto e branco', { pixel: 0, lcd: 0.8, rastro: 0.4, pb: 1, sombra: 0.6, contraste: 0.9, brilho: 0.05, temperatura: -0.2 }],
    ['gbasemluz', 'GBA sem luz', 'a tela escura do primeiro GBA', { pixel: 0, lcd: 0.7, refletiva: 1, sombra: 0.4, rastro: 0.25 }],
    ['gamegear', 'Game Gear', 'tela com luz, um pouco borrada e azulada', { pixel: 2, lcd: 0.4, rastro: 0.5, portatil: 0.6, temperatura: -0.3, bloom: 0.25 }],
  ];
  // categorias do painel simples (cartões)
  const CATEGORIAS = [
    ['Clássicos', ['original', 'nitido', 'suave', 'pixelhd', 'tv4k', 'hd']],
    ['TV de tubo', ['tv', 'trinitron', 'pvmpro', 'fliperama', 'pvm', 'tubobarato', 'vo']],
    ['Sinal', ['ntsc', 'svideo', 'locadora', 'filmadora', 'foradoar', 'glitch']],
    ['Portátil', ['dmg', 'pocket', 'gameboy', 'gbc', 'gbasemluz', 'gamegear']],
    ['Arte', ['desenho', 'pintura', 'cartoon', 'gibi', 'synthwave', 'sonho']],
    ['Foto', ['cafe', 'polaroid95', 'cinemamudo', 'lomo', 'duotone', 'hollywood']],
    ['Retrô', ['terminal', 'ambar', 'mac', 'cgapc', 'atari']],
  ];
  const GRUPOS = { Pixels: ['🔲', 'como cada pixel é desenhado'], TV: ['📺', 'linhas, fósforo, curva, brilho'], Sinal: ['📡', 'cabo, NTSC, fita e chiado'],
    'Portátil': ['🎮', 'telas de LCD'], Cor: ['🎨', 'brilho, contraste, daltonismo'], Foto: ['📷', 'filtros de foto'], 'Retrô': ['💾', 'computadores e paletas antigas'],
    Efeitos: ['✨', 'animações por cima da imagem'] };
  // quanto pesa (pra mostrar leve / médio / pesado): o que lê muitos vizinhos ou liga passada extra pesa mais
  function custo(v) {
    let c = { 0: 0, 1: 0.1, 2: 0.3, 3: 1.5, 4: 2.5, 5: 3 }[v.pixel] || 0;
    c += (v.ntsc > 0 ? 1.5 : 0) + (+v.ampliar || 0) * 0.6 + (v.bloom > 0 ? 0.8 : 0) + (v.nitidez > 0 ? 0.4 : 0) + (v.desfoque > 0 ? 1.5 : 0)
      + (v.glow > 0 ? 0.6 : 0) + (v.composto > 0 ? 0.6 : 0) + (v.traco > 0 ? 0.3 : 0);
    for (const a of AJUSTES) if (!a[7] && +v[a[0]] !== a[6] && !['brilho', 'contraste', 'saturacao', 'gama', 'temperatura'].includes(a[0])) c += 0.1;
    return c < 1.5 ? 'leve' : c < 3.5 ? 'médio' : 'pesado';
  }
  const valores = (id) => { const p = PREDEF.find((x) => x[0] === id); return { ...PADRAO, ...(p ? p[3] : {}) }; };
  // filtros do menu antigo -> predefinição nova (quem já tinha escolhido continua com o parecido)
  const ANTIGO = { crt: 'tv', lcd: 'gbc' };

  const FRAG0 = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D t, tp, tb; uniform vec4 tela, u, p[/*{{NP}}*/];
varying vec2 uv;
#define tam tela.xy
#define saida tela.zw
#define tempo u.x
#define divisao u.y
#define liga u.z
#define pausa u.w
/*{{DEFINES}}*/
#define MTIPO MASCARATIPO
#define MTAM MASCARATAM
float luz(vec3 c) { return dot(c, vec3(.299, .587, .114)); }
float sorte(vec2 q) { return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 tx(vec2 c) { return texture2D(t, c).rgb; }
vec3 perto(vec2 c) { return tx((floor(c * tam) + .5) / tam); }
// nítido suave: o pixel fica quadrado, só a costura entre dois pixels é misturada (escala que não é inteira não treme)
vec3 nitidoSuave(vec2 c) {
  vec2 q = c * tam, esc = max(saida / tam, vec2(1.)), f = fract(q) - .5, faixa = .5 - .5 / esc;
  return tx((floor(q) + .5 + (f - clamp(f, -faixa, faixa)) * esc) / tam);
}
// distância entre duas cores do jeito que o olho sente (o brilho pesa mais que a cor), como no xBR
float dif(vec3 a, vec3 b) { vec3 d = abs(a - b); return dot(d, vec3(.299, .587, .114)) * 3. + (abs(d.r - d.g) + abs(d.g - d.b)) * .5; }
// HD de mentirinha: a ideia do xBR (nível 1), feita aqui pra qualquer escala num passo só. Cada pixel de saída só pode ser
// mudado pelo canto do pixel de origem mais perto dele: compara as duas diagonais desse canto (somas ponderadas de
// diferenças dos vizinhos) e, se a borda corre na diagonal, pinta o "triângulo" do canto com a cor do vizinho, com a
// borda suavizada na largura de um pixel da tela
vec3 hd(vec2 c) {
  vec2 q = c * tam, fp = fract(q), s = sign(fp - .5), base = (floor(q) + .5) / tam;
  vec2 dx = vec2(s.x / tam.x, 0.), dy = vec2(0., s.y / tam.y);
  vec2 f = mix(1. - fp, fp, step(0., s));                         // posição dentro do pixel com o canto em (1, 1)
  vec3 E = tx(base), F = tx(base + dx), H = tx(base + dy), I = tx(base + dx + dy);
  vec3 B = tx(base - dy), D = tx(base - dx), C = tx(base + dx - dy), G = tx(base - dx + dy);
  vec3 F4 = tx(base + 2. * dx), H5 = tx(base + 2. * dy), I4 = tx(base + 2. * dx + dy), I5 = tx(base + dx + 2. * dy);
  float ao = dif(E, C) + dif(E, G) + dif(I, F4) + dif(I, H5) + 4. * dif(H, F);   // a borda cruza F-H?
  float ad = dif(H, D) + dif(H, I5) + dif(F, I4) + dif(F, B) + 4. * dif(E, I);   // ou E-I?
  if (ad >= ao || dif(E, F) < .02 && dif(E, H) < .02) return E;
  vec3 novo = dif(E, F) <= dif(E, H) ? F : H;
  float larg = max(tam.x / saida.x, .02) * 1.2;                   // um pixel da tela, em unidades do pixel de origem
  return mix(E, novo, smoothstep(1.5 - larg, 1.5 + larg, f.x + f.y));
}
vec3 suave(vec2 c) { vec2 d = .8 / tam; return tx(c) * .36 + (tx(c + vec2(d.x, 0.)) + tx(c - vec2(d.x, 0.)) + tx(c + vec2(0., d.y)) + tx(c - vec2(0., d.y))) * .16; }
// Kuwahara: as 4 regiões 3x3 em volta (cada uma num canto); fica a média da região mais uniforme (menor variação de brilho).
// Alisa o que é parecido e mantém as bordas: vira pincelada
vec3 kuwahara(vec2 c) {
  vec2 d = 1. / tam; vec3 m0 = vec3(0.), m1 = vec3(0.), m2 = vec3(0.), m3 = vec3(0.); float v0 = 0., v1 = 0., v2 = 0., v3 = 0., l;
  for (int j = 0; j <= 2; j++) for (int i = 0; i <= 2; i++) {
    vec2 o = vec2(float(i), float(j)) * d;
    vec3 a = tx(c + vec2(-o.x, -o.y)); l = luz(a); m0 += a; v0 += l * l;
    a = tx(c + vec2(o.x, -o.y)); l = luz(a); m1 += a; v1 += l * l;
    a = tx(c + vec2(-o.x, o.y)); l = luz(a); m2 += a; v2 += l * l;
    a = tx(c + vec2(o.x, o.y)); l = luz(a); m3 += a; v3 += l * l;
  }
  m0 /= 9.; m1 /= 9.; m2 /= 9.; m3 /= 9.;
  v0 = v0 / 9. - luz(m0) * luz(m0); v1 = v1 / 9. - luz(m1) * luz(m1); v2 = v2 / 9. - luz(m2) * luz(m2); v3 = v3 / 9. - luz(m3) * luz(m3);
  vec3 r = m0; float v = v0;
  if (v1 < v) { v = v1; r = m1; } if (v2 < v) { v = v2; r = m2; } if (v3 < v) { r = m3; }
  return r;
}
vec3 amostra(vec2 c) {
  if (PRE > .5) return tx(c);   // já veio pronta das passadas extras (NTSC ou ampliada): só lê, suave
  if (PIXEL < .5) return perto(c);
  if (PIXEL < 1.5) return nitidoSuave(c);
  if (PIXEL < 2.5) return suave(c);
  if (PIXEL < 3.5) return hd(c);
  if (PIXEL < 4.5) return kuwahara(c);
  // desenho animado: a pincelada do Kuwahara (áreas lisas), o brilho em 4 degraus mantendo a cor, e contorno preto só onde
  // a borda é forte (detecção de Sobel sobre o brilho)
  vec3 k = kuwahara(c); float lk = max(luz(k), .001);
  vec3 deg = k * (floor(lk * 6. + .5) / 6. + .04) / lk;
  vec2 d = 1. / tam;
  float tl = luz(tx(c - d)), t = luz(tx(c - vec2(0., d.y))), tr = luz(tx(c + vec2(d.x, -d.y))), l0 = luz(tx(c - vec2(d.x, 0.)));
  float r0 = luz(tx(c + vec2(d.x, 0.))), bl = luz(tx(c + vec2(-d.x, d.y))), b0 = luz(tx(c + vec2(0., d.y))), br = luz(tx(c + d));
  float gx = tr + 2. * r0 + br - tl - 2. * l0 - bl, gy = bl + 2. * b0 + br - tl - 2. * t - tr;
  return clamp(deg, 0., 1.) * (1. - .9 * smoothstep(.9, 1.3, length(vec2(gx, gy))));
}
vec3 yiq(vec3 c) { return mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312) * c; }
vec3 rgb(vec3 y) { return mat3(1., 1., 1., .956, -.272, -1.106, .621, -.647, 1.703) * y; }
vec3 composto(vec2 c, vec3 base) {
  vec2 d = vec2(1. / tam.x, 0.); vec3 s = yiq(base) * .3;
  float pe = .3;
  for (int k = 1; k <= 3; k++) { float w = .35 / float(k + 1); s.yz += (yiq(tx(c + d * float(k))).yz + yiq(tx(c - d * float(k))).yz) * w; pe += 2. * w; }
  vec3 y = vec3(yiq(base).x, s.yz / pe);
  float faixa = sin((c.x * tam.x + c.y * tam.y) * 3.14159 + tempo * 30.) * length(y.yz) * .3;   // a "listrinha" do composto
  return rgb(y + vec3(faixa, 0., 0.));
}
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(.5, a.y * .75))); }
float bayer4(vec2 a) { return bayer2(.5 * a) * .25 + bayer2(a); }
float borda(vec2 c) {   // quanto a luz muda em volta (contorno)
  vec2 d = 1. / tam;
  return abs(luz(tx(c + vec2(d.x, 0.))) - luz(tx(c - vec2(d.x, 0.)))) + abs(luz(tx(c + vec2(0., d.y))) - luz(tx(c - vec2(0., d.y))));
}
vec3 barrasTeste(vec2 c) {   // barras coloridas de teste (com a faixa de baixo)
  if (c.y < .67) { float b = floor(c.x * 7.); return b < 1. ? vec3(.75) : b < 2. ? vec3(.75, .75, 0.) : b < 3. ? vec3(0., .75, .75) : b < 4. ? vec3(0., .75, 0.) : b < 5. ? vec3(.75, 0., .75) : b < 6. ? vec3(.75, 0., 0.) : vec3(0., 0., .75); }
  if (c.y < .75) { float b = floor(c.x * 7.); return b < 1. ? vec3(0., 0., .75) : b < 2. ? vec3(.07) : b < 3. ? vec3(.75, 0., .75) : b < 4. ? vec3(.07) : b < 5. ? vec3(0., .75, .75) : b < 6. ? vec3(.07) : vec3(.75); }
  float b = floor(c.x * 6.); return b < 1. ? vec3(0., .13, .3) : b < 2. ? vec3(1.) : b < 3. ? vec3(.2, 0., .42) : b < 5. ? vec3(.07) : vec3(0.);
}
void main() {
  vec2 c = uv;
  if (TESTE > .5 && pausa > .5) { gl_FragColor = vec4(barrasTeste(c), 1.); return; }
  if (divisao > 0. && gl_FragCoord.x < divisao * saida.x) {   // antes | depois: do lado esquerdo, a imagem crua
    vec3 o = nitidoSuave(c);
    if (abs(gl_FragCoord.x - divisao * saida.x) < 1.5) o = vec3(1.);
    gl_FragColor = vec4(o, 1.); return;
  }
  // coordenadas: tremor, fita e curvatura
  if (TREMOR > 0.) { float q = floor(tempo * 30.); c += (vec2(sorte(vec2(q, 1.)), sorte(vec2(q, 2.))) - .5) * TREMOR * vec2(.004, .003); }
  float fx = 0.;
  if (VHS > 0.) {
    float lin = floor(c.y * tam.y), faixaY = fract(tempo * .09);
    float dentro = smoothstep(.06, 0., abs(c.y - faixaY));
    fx = ((sorte(vec2(lin, floor(tempo * 20.))) - .5) * .0025 + dentro * (sorte(vec2(lin, tempo)) - .5) * .03) * VHS;
    c.x += fx;
  }
  if (ONDA > 0.) {
    if (ONDATIPO < .5) c.x += sin(c.y * 70. + tempo * 7.) * .004 * ONDA + sin(c.y * 23. - tempo * 3.) * .003 * ONDA;
    else c += vec2(sin(c.y * 22. + tempo * 2.1), cos(c.x * 18. + tempo * 1.7)) * .008 * ONDA;
  }
  float gl0 = 0.;
  if (GLITCH > 0.) {   // de vez em quando: faixas deslocadas e cor separando
    float vez = floor(tempo * 9.), faixa = floor(c.y * 18. + sorte(vec2(vez, 3.)) * 6.);
    if (sorte(vec2(vez, 7.)) < GLITCH * .7 && sorte(vec2(faixa, vez)) < .35) { gl0 = (sorte(vec2(faixa, vez + 1.)) - .5) * .12 * GLITCH; c.x += gl0; }
  }
  float barraV = 1.;
  if (ROLAGEM > 0.) { c.y = fract(c.y + tempo * .18 * ROLAGEM); barraV = smoothstep(0., .035, c.y) * smoothstep(1., .985, c.y); }
  float banda = 0.;
  if (INTERFERENCIA > 0.) { banda = smoothstep(.1, 0., abs(c.y - fract(tempo * .23))) * INTERFERENCIA; c.x += banda * sin(c.y * 400. + tempo * 60.) * .006; }
  if (PIXELAO > 0.) { float n = 1. + floor(PIXELAO * 7.); c = (floor(c * tam / n) + .5) * n / tam; }
  if (POLAROID > 0.) {   // a moldura de papel: o jogo encolhe pra dentro dela
    vec2 m0 = vec2(.05, .05), m1 = vec2(.95, .8);
    if (c.x < m0.x || c.x > m1.x || c.y < m0.y || c.y > m1.y) { gl_FragColor = vec4(vec3(.96, .95, .9) - sorte(floor(gl_FragCoord.xy / 2.)) * .04, 1.); return; }
    c = (c - m0) / (m1 - m0);
  }
  if (CURVA > 0.) {
    vec2 q = c * 2. - 1.; vec2 o = abs(q.yx) * CURVA * vec2(.34, .45); q += q * o * o; c = q * .5 + .5;
    if (c.x < 0. || c.x > 1. || c.y < 0. || c.y > 1.) {
      if (REFLEXO > 0.) {   // fora do tubo: o vidro da borda reflete a imagem, sumindo rápido
        vec2 dentro = clamp(c, 0., 1.), fora = abs(c - dentro);
        gl_FragColor = vec4(tx(clamp(dentro * 2. - c, 0., 1.)) * REFLEXO * .4 * exp(-(fora.x + fora.y) * 45.), 1.); return;
      }
      gl_FragColor = vec4(0., 0., 0., 1.); return;
    }
  }
  // a cor do pixel
  vec3 col;
  if (CONVERG > 0. || VHS > 0. || gl0 != 0.) {
    vec2 o = vec2((CONVERG * 1.8 + VHS * 2. + abs(gl0) * 60.) / tam.x, 0.);
    col = vec3(amostra(c + o).r, amostra(c).g, amostra(c - o).b);
  } else col = amostra(c);
  if (NITIDEZ > 0.) {   // estilo FSR/CAS: tira a média dos vizinhos e realça a diferença (afia o que ficou macio)
    vec2 d = .7 / tam; vec3 m = (tx(c + vec2(d.x, 0.)) + tx(c - vec2(d.x, 0.)) + tx(c + vec2(0., d.y)) + tx(c - vec2(0., d.y))) * .25;
    col = clamp(col + (col - m) * NITIDEZ * 2.2, 0., 1.);
  }
  if (TRACO > 0.) col *= 1. - TRACO * .75 * smoothstep(.08, .45, borda(c));
  if (COMPOSTO > 0.) col = mix(col, composto(c, col), COMPOSTO);
  if (VHS > 0.) { col = mix(col, vec3(luz(col)), .25 * VHS); col += (sorte(c * tam + tempo) - .5) * .12 * VHS * smoothstep(.06, 0., abs(c.y - fract(tempo * .09))) * 4.; }
  if (RASTRO > 0.) col = mix(col, texture2D(tp, c).rgb, RASTRO * .55);
  // cor
  if (PORTATIL > 0.) {
    vec3 l = pow(col, vec3(2.4));
    l = mat3(.82, .24, -.06, .12, .66, .22, .06, .10, .84) * l;
    col = mix(col, pow(clamp(l, 0., 1.), vec3(1. / 2.)) * .94 + .03, PORTATIL);
  }
  if (VERDE > 0.) col = mix(col, mix(vec3(.06, .22, .06), vec3(.61, .74, .06), smoothstep(0., 1., luz(col))), VERDE);
  if (REFLETIVA > 0.) { vec3 r = pow(col, vec3(1.6)) * .82 + vec3(.035, .04, .03); col = mix(col, mix(vec3(luz(r)), r, .85), REFLETIVA); }
  col = (col - .5) * CONTRASTE + .5 + BRILHO;
  col = mix(vec3(luz(col)), col, SATURACAO);
  col = pow(clamp(col, 0., 1.), vec3(1. / GAMA));
  col *= vec3(1. + .12 * TEMPERATURA, 1. + .02 * TEMPERATURA, 1. - .12 * TEMPERATURA);
  if (SEPIA > 0.) col = mix(col, vec3(luz(col)) * vec3(1.1, .88, .64), SEPIA);
  if (PB > 0.) col = mix(col, vec3(luz(col)), PB);
  if (DALTON > .5) {   // corrige: o que o olho perde vira diferença nos canais que ele vê
    mat3 m = DALTON < 1.5 ? mat3(.567, .558, 0., .433, .442, .242, 0., 0., .758)
           : DALTON < 2.5 ? mat3(.625, .7, 0., .375, .3, .3, 0., 0., .7)
                          : mat3(.95, 0., 0., .05, .433, .475, 0., .567, .525);
    vec3 e = col - m * col;
    col += vec3(0., .7 * e.r + e.g, .7 * e.r + e.b);
  }
  // foto
  float l = luz(col);
  if (DESFOQUE > 0.) {
    float r = smoothstep(.12, .55, distance(c, vec2(.5))) * DESFOQUE;
    if (r > 0.) { vec2 d = r * 3.5 / tam; vec3 b = vec3(0.);
      for (int i = 0; i < 8; i++) { float a = float(i) * .785; b += tx(c + vec2(cos(a), sin(a)) * d) + tx(c + vec2(cos(a), sin(a)) * d * .5); }
      col = mix(col, b / 16., min(1., r * 1.6)); }
  }
  if (CINEMA > 0.) { vec3 tom = mix(vec3(.72, 1., 1.12), vec3(1.18, .95, .72), smoothstep(.15, .8, l)); col = mix(col, clamp(col * tom * 1.05, 0., 1.), CINEMA); }
  if (LOMO > 0.) {
    vec3 s3 = col * col * (3. - 2. * col); s3 = mix(vec3(luz(s3)), s3, 1.4); s3.b *= .88;
    vec2 v = c * (1. - c.yx); col = mix(col, s3 * pow(clamp(v.x * v.y * 12., 0., 1.), .9), LOMO);
  }
  if (POLAROID > 0.) { vec3 f = mix(vec3(luz(col)), col, .7) * .82 + vec3(.1, .08, .05); col = mix(col, f * vec3(1.04, 1., .9), POLAROID); }
  if (DUOTONE > 0.) {
    vec3 a = DUOTONECOR < .5 ? vec3(.12, .1, .42) : DUOTONECOR < 1.5 ? vec3(.3, .05, .4) : DUOTONECOR < 2.5 ? vec3(.38, .04, .14) : vec3(.04, .22, .16);
    vec3 b = DUOTONECOR < .5 ? vec3(1., .35, .65) : DUOTONECOR < 1.5 ? vec3(1., .88, .22) : DUOTONECOR < 2.5 ? vec3(.3, 1., .95) : vec3(1., .55, .15);
    col = mix(col, mix(a, b, smoothstep(.05, .95, luz(col))), DUOTONE);
  }
  if (VAZAMENTO > 0.) {
    vec3 v1 = vec3(1., .45, .1) * smoothstep(.95, 0., distance(c, vec2(1.05 + sin(tempo * .3) * .08, -.08)));
    vec3 v2 = vec3(1., .2, .55) * smoothstep(.75, 0., distance(c, vec2(-.1, 1.05 + cos(tempo * .23) * .08)));
    col = 1. - (1. - col) * (1. - (v1 + v2) * VAZAMENTO * .9);
  }
  if (FILME > 0.) {
    col += (sorte(gl_FragCoord.xy * .5 + fract(tempo * 7.) * 91.) - .5) * .3 * FILME * (1. - l * .5);
    float xs = sorte(vec2(floor(tempo * 12.), 5.)), ys = sorte(vec2(floor(tempo * 12.), 9.));
    if (abs(c.x - xs) < .0018 && ys < .7) col = mix(col, vec3(.9, .88, .8), .6 * FILME);
    col *= 1. + (sorte(vec2(floor(tempo * 24.), 1.)) - .5) * .12 * FILME;
  }
  // retrô
  if (PONTILHADO > 0.) { float th = bayer4(c * tam); vec3 bw = luz(col) > th ? vec3(.93, .93, .86) : vec3(.08, .08, .1); col = mix(col, bw, PONTILHADO); }
  if (CGA > 0.) {
    vec3 q = col + (bayer4(c * tam) - .5) * .35, best = vec3(0.); float dm = 9.;
    vec3 pal0 = vec3(0.), pal1 = vec3(.33, 1., 1.), pal2 = vec3(1., .33, 1.), pal3 = vec3(1.);
    if (distance(q, pal0) < dm) { dm = distance(q, pal0); best = pal0; }
    if (distance(q, pal1) < dm) { dm = distance(q, pal1); best = pal1; }
    if (distance(q, pal2) < dm) { dm = distance(q, pal2); best = pal2; }
    if (distance(q, pal3) < dm) { best = pal3; }
    col = mix(col, best, CGA);
  }
  if (FOSFORO > 0.) {
    vec3 f = FOSFOROCOR < .5 ? vec3(.25, 1., .35) : FOSFOROCOR < 1.5 ? vec3(1., .68, .12) : vec3(.78, .9, 1.);
    col = mix(col, f * pow(luz(col), 1.2) * 1.15 + f * .03, FOSFORO);
  }
  if (GIBI > 0.) {
    vec3 base = floor(col * 4. + .5) / 4.;
    vec2 q = mat2(.707, -.707, .707, .707) * gl_FragCoord.xy / max(4., saida.y / 140.);
    float d = length(fract(q) - .5), tinta = smoothstep(.04, 0., d - sqrt(1. - luz(col)) * .5);
    base *= 1. - tinta * .55;
    base *= 1. - smoothstep(.2, .45, borda(c));
    col = mix(col, base, GIBI);
  }
  if (NEON > 0.) {
    float g = smoothstep(.06, .35, borda(c));
    vec3 n = mix(vec3(1., .2, .75), vec3(.15, .9, 1.), .5 + .5 * sin(c.x * 4. + c.y * 3. + tempo * .8));
    col = mix(col, col * .12 + n * g * 1.4, NEON);
  }
  // efeitos de TV
  if (banda > 0.) col += banda * (.25 + (sorte(gl_FragCoord.xy + tempo) - .5) * .5);
  if (FORADOAR > 0.) { float n = sorte(floor(gl_FragCoord.xy / 1.5) + fract(tempo * 13.) * 77.); n = n * .8 + sorte(vec2(floor(gl_FragCoord.y / 3.), tempo)) * .2; col = mix(col, vec3(n), FORADOAR); }
  col *= barraV;
  // a tela, em luz linear (como o fósforo soma luz de verdade): brilho que espalha, linhas, grade do LCD, máscara
  vec3 lin = pow(clamp(col, 0., 1.), vec3(2.2));
  if (GLOW > 0.) {
    vec2 d = 1.8 / tam; vec3 b = vec3(0.);
    b += tx(c + vec2(d.x, 0.)) + tx(c - vec2(d.x, 0.)) + tx(c + vec2(0., d.y)) + tx(c - vec2(0., d.y));
    b += tx(c + d) + tx(c - d) + tx(c + vec2(d.x, -d.y)) + tx(c - vec2(d.x, -d.y));
    lin += pow(b / 8., vec3(2.2)) * GLOW * .7;
  }
  if (LINHAS > 0.) {
    // linha de varredura como no crt-lottes: o feixe é uma gaussiana em volta do centro da linha; onde é claro o feixe
    // engorda (a linha escura some). O brilho perdido volta dividindo pela média do feixe
    float dd = fract(c.y * tam.y) - .5, duro = -3. - 11. * LINHAS;
    float largura = mix(1., .55, sqrt(clamp(luz(lin), 0., 1.)) * GROSSAS);
    float w = exp2(duro * dd * dd * largura * largura * 4.);
    float med = (exp2(duro * .0156 * largura * largura) + exp2(duro * .1406 * largura * largura) + exp2(duro * .3906 * largura * largura) + exp2(duro * .7656 * largura * largura)) * .25;
    lin *= mix(1., w / med, min(1., LINHAS * 1.4));
  }
  if (BLOOMTEX > .5) lin += texture2D(tb, c).rgb * BLOOM;   // o brilho que vaza (passada extra, já em luz linear)
  if (SOMBRA > 0.) { float sb = 1. - luz(tx(c - .4 / tam)); lin *= 1. - SOMBRA * .45 * sb * sb; }   // pixel escuro faz sombra no fundo do LCD
  if (LCD > 0.) { vec2 f = fract(c * tam); float g = smoothstep(0., .14, f.x) * smoothstep(0., .14, f.y) * smoothstep(1., .9, f.x) * smoothstep(1., .9, f.y); lin *= mix(1., .15 + .85 * g, LCD) * (1. + LCD * .35); }
  if (MASCARA > 0.) {
    // máscara de fósforo como no crt-lottes: um fósforo claro e dois escuros por grupo, com média 1 (não escurece)
    vec2 fc = floor(gl_FragCoord.xy / MTAM);
    float c3 = mod(fc.x, 3.);
    if (MTIPO > 1.5) c3 = mod(fc.x + mod(fc.y, 2.) * 1.5, 3.);
    float esc = 1. - .5 * MASCARA, cla = 1. + MASCARA;
    vec3 m = c3 < 1. ? vec3(cla, esc, esc) : c3 < 2. ? vec3(esc, cla, esc) : vec3(esc, esc, cla);
    if (MTIPO > .5 && MTIPO < 1.5 && mod(fc.y + floor(fc.x / 3.) * 2., 4.) < 1.) m *= esc;
    lin *= m;
  }
  col = pow(lin, vec3(1. / 2.2));
  if (VINHETA > 0.) { vec2 v = c * (1. - c.yx); col *= pow(clamp(v.x * v.y * 15., 0., 1.), VINHETA * .7); }
  if (CANTOS > 0.) { vec2 q = abs(c - .5) * 2.; vec2 k = max(q - (1. - CANTOS * .12), 0.) / (CANTOS * .12 + .0001); col *= smoothstep(1., .85, length(k)); }
  if (CHIADO > 0.) col += (sorte(gl_FragCoord.xy + fract(tempo) * 100.) - .5) * CHIADO * .4;
  if (liga < 1.) {   // ponto que vira linha e depois abre (como a TV de tubo ligando)
    vec2 q = abs(uv - .5) * 2.;
    float w = smoothstep(0., .35, liga), h = smoothstep(.3, 1., liga) * .98 + .02;
    float dentro = step(q.x, w) * step(q.y, h * (.02 + w * .98));
    col = mix(vec3(1.), col, smoothstep(.3, .8, liga)) * dentro * (1. + (1. - liga) * 1.5);
  }
  gl_FragColor = vec4(clamp(col, 0., 1.), 1.);
}`;
  // os valores na ordem dos ajustes (vec4 p[13]); cada ajuste vira um #define com o nome em maiúsculas
  const ORDEM = AJUSTES.map((a) => a[0]);
  const NP = Math.ceil(ORDEM.length / 4);   // vec4 p[NP]
  // shader sob medida: ajuste desligado (no valor padrão) e escolhas (tipo de pixel, de máscara...) viram constantes, e o
  // compilador do driver apaga o código deles; só o que está ligado lê o valor do controle (mexer no controle não recompila)
  const ESCOLHA = new Set(AJUSTES.filter((a) => a[7]).map((a) => a[0]));
  const num = (x) => (Number.isInteger(+x) ? (+x).toFixed(1) : String(+x));
  const chave = (v) => ORDEM.map((k) => (ESCOLHA.has(k) ? 'e' + (+v[k]) : +v[k] === PADRAO[k] ? '-' : '+')).join('');
  // passos: o app desenha em etapas (sem isso, ex. o PS2 nativo, os ajustes novos ficam no padrão e o vetor tem 13 vec4)
  const semNovos = (v) => ({ ...v, ...Object.fromEntries(NOVOS.map((k) => [k, PADRAO[k]])) });
  const montar = (v0, opc) => {
    const passos = !!(opc && opc.passos), v = passos ? v0 : semNovos(v0);
    const pre = passos && (+v.ntsc > 0 || +v.ampliar > 0) ? 1 : 0, bt = passos && +v.bloom > 0 ? 1 : 0;
    return FRAG0.replace('/*{{NP}}*/', passos ? NP : 13).replace('/*{{DEFINES}}*/', `#define PRE ${num(pre)}\n#define BLOOMTEX ${num(bt)}\n` + ORDEM.map((k, i) => `#define ${k.toUpperCase()} `
      + (ESCOLHA.has(k) ? num(v[k]) : +v[k] === PADRAO[k] ? num(PADRAO[k]) : `p[${i >> 2}].${'xyzw'[i & 3]}`)).join('\n'));
  };
  // Poda: o compilador do PC apaga sozinho o código desligado, mas placa de vídeo de celular às vezes não aceita (ou desenha
  // preto) o shader inteiro. Então o código que não vai rodar sai antes: if com condição constante falsa some, o verdadeiro
  // fica só com o corpo (e um "return" verdadeiro corta o resto do bloco), e função que ninguém chama sai também.
  function podar(src) {
    src = src.replace(/\/\/[^\n]*/g, '');
    const val = {};
    for (const m of src.matchAll(/^#define (\w+) (-?[\d.]+)$/gm)) val[m[1]] = parseFloat(m[2]);
    const lado = (t) => (/^-?(\d+\.?\d*|\.\d+)$/.test(t) ? parseFloat(t) : t in val ? val[t] : NaN);
    const comparar = (t) => {
      const m = t.trim().match(/^([\w.]+)\s*(<=|>=|==|!=|<|>)\s*([\w.-]+)$/); if (!m) return null;
      const x = lado(m[1]), y = lado(m[3]); if (isNaN(x) || isNaN(y)) return null;
      return { '<': x < y, '>': x > y, '<=': x <= y, '>=': x >= y, '==': x === y, '!=': x !== y }[m[2]];
    };
    const avaliar = (c) => {   // só "A > 0." ligados por || ou && (sem misturar); outra coisa = não sabe (null)
      const ou = c.split('||'), e = c.split('&&');
      if (ou.length > 1 && e.length > 1) return null;
      const r = (ou.length > 1 ? ou : e).map(comparar);
      if (r.includes(null)) return null;
      return ou.length > 1 ? r.includes(true) : !r.includes(false);
    };
    const fecha = (i, abre, fechaC) => { for (let d = 0; i < src.length; i++) { if (src[i] === abre) d++; else if (src[i] === fechaC && --d === 0) return i; } return -1; };
    const comando = (i) => {   // [início, fim) de um comando: bloco {…} ou até o ';'
      while (/\s/.test(src[i])) i++;
      if (src[i] === '{') return [i, fecha(i, '{', '}') + 1];
      for (let j = i, d = 0; j < src.length; j++) { if (src[j] === '(') d++; else if (src[j] === ')') d--; else if (src[j] === ';' && !d) return [i, j + 1]; }
      return [i, src.length];
    };
    const re = /\bif\s*\(/g;
    for (let m; (m = re.exec(src)); ) {
      const ini = m.index, pa = src.indexOf('(', ini), pf = fecha(pa, '(', ')');
      const v = avaliar(src.slice(pa + 1, pf));
      if (v === null) continue;
      const [ci, cf] = comando(pf + 1);
      let fim = cf, senao = '';
      const depois = src.slice(cf).match(/^\s*else\b/);
      if (depois) { const [ei, ef] = comando(cf + depois[0].length); senao = src.slice(ei, ef); fim = ef; }
      let novo = v ? src.slice(ci, cf) : senao;
      if (v && /^return\b/.test(novo)) {   // return que sempre acontece: o resto do bloco nunca roda
        let d = 0, j = fim;
        for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { if (d === 0) break; d--; } }
        fim = j; novo += '\n';
      }
      src = src.slice(0, ini) + novo + src.slice(fim);
      re.lastIndex = ini;
    }
    // funções que sobraram sem ninguém chamando
    for (let mudou = true; mudou; ) {
      mudou = false;
      for (const m of [...src.matchAll(/^(?:vec[234]|float|bool|int|mat[234])\s+(\w+)\s*\(/gm)]) {
        const usos = src.match(new RegExp('\\b' + m[1] + '\\s*\\(', 'g')).length;
        if (usos > 1) continue;
        const ab = src.indexOf('{', m.index), fim = fecha(ab, '{', '}');
        src = src.slice(0, m.index) + src.slice(fim + 1); mudou = true; break;
      }
    }
    return src.replace(/\n\s*\n+/g, '\n');
  }
  const fonte = (v, opc) => podar(montar(v, opc));
  const FRAG = montar(PADRAO);
  const vetor = (v, n) => { const a = new Float32Array((n || 13) * 4); ORDEM.forEach((k, i) => { if (i < a.length) a[i] = v[k] !== undefined ? +v[k] : PADRAO[k]; }); return a; };

  // ---------------- passadas extras (desenhadas em texturas antes do shader final) ----------------
  // Todas leem a textura t (tela.xy = tamanho dela) e escrevem tela.zw; q = valores do passo. A imagem fica com a linha de
  // cima na coordenada 0, igual à textura do jogo.
  const CAB = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D t; uniform vec4 tela, u, q; varying vec2 uv;
`;
  const PASSOS = {
    // Scale2x (a regra do EPX): cada pixel vira 4; um canto pega a cor do vizinho quando os dois vizinhos daquele canto são
    // iguais e o outro par não. Duas vezes = Scale4x. Cores quase iguais contam como iguais (sombreado suave do jogo)
    scale2x: CAB + `vec3 at(vec2 p) { return texture2D(t, (p + .5) / tela.xy).rgb; }
bool ig(vec3 a, vec3 b) { vec3 d = abs(a - b); return d.r + d.g + d.b < .06; }
void main() {
  vec2 q2 = uv * tela.xy, p = floor(q2), f = fract(q2);
  vec3 E = at(p), B = at(p + vec2(0., -1.)), D = at(p + vec2(-1., 0.)), F = at(p + vec2(1., 0.)), H = at(p + vec2(0., 1.)), r = E;
  if (!ig(B, H) && !ig(D, F)) {
    if (f.x < .5 && f.y < .5) { if (ig(D, B)) r = D; }
    else if (f.y < .5) { if (ig(B, F)) r = F; }
    else if (f.x < .5) { if (ig(D, H)) r = D; }
    else if (ig(H, F)) r = F;
  }
  gl_FragColor = vec4(r, 1.);
}`,
    // NTSC: monta o sinal de vídeo de verdade (brilho + cor modulada numa onda que dá uma volta a cada 2 pixels do console)
    // e decodifica como a TV: o filtro do brilho tira a onda e mistura 2 pixels vizinhos (o pontilhado vira transparência);
    // a cor sai mais borrada. No composto, o brilho que muda rápido vaza na cor (arco-íris) e a fase anda a cada quadro.
    // q = força, cabo (0 S-Vídeo, 1 composto, 2 antena), fase andando, subamostras por pixel
    ntsc: CAB + `#define PI 3.14159265
vec3 yiq(vec3 c) { return mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312) * c; }
vec3 rgb(vec3 y) { return mat3(1., 1., 1., .956, -.272, -1.106, .621, -.647, 1.703) * y; }
float sorte(vec2 a) { return fract(sin(dot(a, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float S = q.w, C = 2. * S, k0 = floor(uv.x * tela.z), lin = floor(uv.y * tela.y), v = (lin + .5) / tela.y;
  float fase = lin * PI + q.z * PI * mod(floor(u.x * 60.), 2.), w = 2. * PI / C;
  vec3 orig = texture2D(t, vec2((floor(k0 / S) + .5) / tela.x, v)).rgb;
  float Y = 0., I = 0., Q = 0., sy = 0., sc = 0.;
  for (int j = -8; j <= 8; j++) {
    float fj = float(j), k = k0 + fj, ph = k * w + fase;
    vec3 a = yiq(texture2D(t, vec2((floor(k / S) + .5) / tela.x, v)).rgb);
    float cor = a.y * cos(ph) + a.z * sin(ph), sinal = a.x + cor;
    if (q.y > 1.5) sinal += yiq(texture2D(t, vec2((floor((k - 3. * S) / S) + .5) / tela.x, v)).rgb).x * .12;   // antena: fantasma
    float wy = abs(fj) < C * .5 ? 1. : abs(fj) == C * .5 ? .5 : 0.;   // um ciclo inteiro: a onda da cor some do brilho
    float wc = .5 + .5 * cos(PI * fj / 9.);
    Y += wy * (q.y < .5 ? a.x : sinal); sy += wy;
    float sc0 = q.y < .5 ? cor : sinal;   // S-Vídeo: a cor vem num fio separado (não pega o brilho)
    I += wc * sc0 * cos(ph); Q += wc * sc0 * sin(ph); sc += wc;
  }
  Y /= sy; I = I * 2. / sc; Q = Q * 2. / sc;
  if (q.y < .5) Y = mix(Y, yiq(orig).x, .6);   // S-Vídeo: brilho quase sem borrar
  if (q.y > 1.5) { Y += (sorte(vec2(k0, lin) + fract(u.x * 7.) * 91.) - .5) * .07; I *= .85; Q *= .85; }
  gl_FragColor = vec4(mix(orig, clamp(rgb(vec3(Y, I, Q)), 0., 1.), q.x), 1.);
}`,
    // brilho que vaza: reduz pra metade em luz linear (o claro pesa mais) e desfoca em dois passes (deitado e em pé)
    bloomReduz: CAB + `void main() {
  vec2 d = .5 / tela.zw; vec3 a = vec3(0.);
  a += pow(texture2D(t, uv + vec2(-d.x, -d.y)).rgb, vec3(2.2)) + pow(texture2D(t, uv + vec2(d.x, -d.y)).rgb, vec3(2.2));
  a += pow(texture2D(t, uv + vec2(-d.x, d.y)).rgb, vec3(2.2)) + pow(texture2D(t, uv + vec2(d.x, d.y)).rgb, vec3(2.2));
  a *= .25;
  gl_FragColor = vec4(a * (.35 + .65 * smoothstep(.05, .6, dot(a, vec3(.299, .587, .114)))), 1.);
}`,
    bloomBorra: CAB + `void main() {
  vec2 d = q.yz * q.x / tela.xy; vec3 a = texture2D(t, uv).rgb * .227;
  a += (texture2D(t, uv + d * 1.385).rgb + texture2D(t, uv - d * 1.385).rgb) * .316;
  a += (texture2D(t, uv + d * 3.231).rgb + texture2D(t, uv - d * 3.231).rgb) * .07;
  gl_FragColor = vec4(a, 1.);
}`,
  };
  // a lista de passadas pra esses ajustes e esse tamanho de imagem (L x A). ntsc e ampliar não vão juntos (o NTSC borra)
  function passos(v, L, A) {
    const l = [];
    if (+v.ntsc > 0) {
      const S = L * 4 <= 2048 ? 4 : 2;
      l.push({ id: 'ntsc', w: L * S, h: A, q: [+v.ntsc, +v.ntscTipo, +v.ntscTipo > 0.5 ? 1 : 0, S] });
    } else for (let i = 0, w = L, h = A; i < +v.ampliar && w * 2 <= 4096; i++) { w *= 2; h *= 2; l.push({ id: 'scale2x', w, h, q: [0, 0, 0, 0] }); }
    if (+v.bloom > 0) l.push({ id: 'bloom', w: Math.ceil(L / 2), h: Math.ceil(A / 2), q: [+v.bloomRaio || 1, 0, 0, 0] });
    return l;
  }
  const animado = (v) => (+v.ntsc > 0 && +v.ntscTipo > 0.5) || ['vhs', 'chiado', 'tremor', 'composto', 'filme', 'vazamento', 'neon', 'foraDoAr', 'rolagem', 'interferencia', 'glitch', 'onda'].some((k) => v[k] > 0);
  return { AJUSTES, PADRAO, PREDEF, ANTIGO, FRAG, NP, CATEGORIAS, GRUPOS, PASSOS, fonte, chave, valores, vetor, animado, passos, custo };
})();
if (typeof module !== 'undefined') module.exports = KofVisual;
