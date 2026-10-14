# Identidade visual Melt aplicada ao app de demandas

Frente: identidade visual. Data: 2026-10-14.
Fontes consultadas: skill `melt-brand` (carregou sem erro), skills irmãs `melt-doc` e `melt-relatorio`
(mesma identidade, e mais regras de UI e os assets prontos), e medições feitas por script nos PNG/JPG da marca
(cores amostradas, luminância e contraste WCAG calculados, não estimados).

---

## 0. Situação dos arquivos (ler antes de usar)

| Item citado pela marca | Situação |
|---|---|
| `melt-brand/reference/template.html` (o molde aprovado) | **Não existe** no pacote da skill: só o `SKILL.md` está lá. |
| `MELTLOGOWHITE.png` / `MELTLOGOORANGE.png` (originais com fundo, que precisam de tratamento) | **Não encontrados no disco.** A busca no perfil do usuário e nos dados do Claude não achou nada. |
| Logos **já tratados** (PNG transparente, prontos) | **Existem** em `melt-relatorio/assets/chrome/` (caminho completo na seção 3). |
| Fundos institucionais (6 imagens) | Existem em `melt-relatorio/assets/backgrounds/`. Servem como capa de quadro (seção 3.4). |
| Syne (TTF/WOFF2 local) | Não há cópia local. A fonte está no Google Fonts. |

Base das skills: `C:\Users\Melt\AppData\Roaming\Claude\local-agent-mode-sessions\skills-plugin\ef62caca-2141-485b-936f-fb24b37585aa\9326c792-bb72-47c0-89df-4b82bbdd5ab5\skills\`

---

## 1. Princípios da marca, traduzidos para o app

O que a marca pede: uma estética técnica, limpa, premium e consultiva, com base escura e áreas claras de respiro.
No app, isso vira o seguinte:

- **O laranja é acento e ocupa no máximo uns 10% da tela.** Ele marca o CTA principal (um por tela, como "Nova demanda"),
  o anel de foco, o card selecionado, um número focal e indicadores pequenos. Nunca vira fundo de coluna,
  barra lateral inteira ou vários botões laranja lado a lado.
- **Alternância entre claro e escuro.** A marca proíbe "parede preta". No tema claro, a barra superior pode ficar
  escura (escuro que ancora) e o quadro claro. No tema escuro, cards e modais ganham superfícies em camadas
  (#111 → #181818 → #1F1F1F), e não preto chapado.
- **A hierarquia vem do tamanho e do respiro, não do negrito.** Títulos usam 500/600, o peso 700 fica só para micro-rótulos
  em CAIXA ALTA e o **800 é proibido**.
- **Respiro é requisito.** Layout denso está errado: se um card ficou apertado, o que se corta é conteúdo, nunca o espaçamento.
- **Bordas sutis, raios consistentes**, sombras discretas e nada de caixas saturadas empilhadas.
- **Anti-padrão declarado pela marca:** visual de "agência de tráfego", ou seja, contraste estridente, excesso de bold e poluição visual.

---

## 2. Paleta oficial

| Token da marca | Hex | Pantone | Papel no app |
|---|---|---|---|
| `--orange` | `#FE5000` | Orange 021C | Acento primário: CTA, foco, seleção, progresso |
| `--yellow` | `#FFCC33` | 123C | Aviso ("vence hoje") e etiqueta |
| `--pink` | `#FF3366` | 1785C | Perigo/atraso (a marca usa rosa para negativos) e etiqueta |
| `--purple` | `#660099` | 2597C | Etiqueta |
| `--green` | `#33CC66` | 7479C | Sucesso/concluído e etiqueta |
| `--blue` | `#3399FF` | 279C | Informação. Na marca, é a cor padrão de série única em gráficos |
| `--deep-purple` | `#3C2254` | 669C | Etiqueta e tom de fundo de quadro |
| `--black` | `#111111` | Black 6C | Texto no claro, superfície escura |
| `--dark` | `#0A0A0A` | — | Fundo base do tema escuro |
| `--white` | `#FFFFFF` | — | Superfície clara |

**Utilitários de UI já aprovados pela marca** (vêm do `melt-relatorio`): muted `#8A8A8A`, hairline `#E6E6E6`,
painel claro `#F3F3F3`. Em gráfico, o "cinza de contexto" é `#C9D2DA`.

**Cores medidas nos assets** (servem para casar a UI com o logo):

- logo branco = `#EDECEA` (um off-white quente, que uso como texto primário do tema escuro)
- logo escuro = `#262626`
- "e" mark escuro = `#111111`

**Barra assinatura (arco-íris)**, com paradas amostradas do `bar_rainbow.png`:
`#FE5000 → #FEA824 → #FFB73A → #FB3267 → #CA2177 → #981188 → #660098 → #3F2059 → #34B564 → #33B2B1 → #33A2E1 → #48A1FD → #BBD6F0 → #E1E0DE → #373736 → #121212`.
As cores intermediárias (âmbar, magenta, turquesa) vêm da própria marca e alimentam as etiquetas da seção 7.4.

**Regra da marca:** "nunca usar cores genéricas aproximadas". Os tokens *derivados* que proponho (hover, texto em laranja escurecido,
fundos de etiqueta) não são cores de marca novas. São estados funcionais, calculados por mistura OKLab/sRGB a partir
do hex oficial, e cada um aparece documentado com a sua origem.

---

## 3. Logo, "e" mark e fundos

### 3.1 Arquivos prontos (PNG transparente, não reprocessar)

Pasta: `...\skills\melt-relatorio\assets\chrome\`

| Arquivo | Tamanho | Cor | Uso no app |
|---|---|---|---|
| `logo_white.png` | 2500×864 | `#EDECEA` | Logo em fundo escuro: topbar escura, tela de login, tema escuro |
| `logo_dark.png` | 2500×864 | `#262626` | Logo em fundo claro: só quando a regra de laranja (abaixo) não couber |
| `emark_white.png` / `emark_dark.png` | 2004×2012 | `#EDECEA` / `#111111` | Ícone compacto: sidebar recolhida, favicon, ícone do PWA, avatar de "sistema" |
| `bar_rainbow.png` | 2500×20 | gradiente | Barra assinatura: só em login/splash/onboarding, **nunca no quadro** (no relatório, a marca a proíbe em páginas de conteúdo) |

### 3.2 Qual logo em qual fundo (regra da marca)

| Fundo | Logo |
|---|---|
| Escuro, gradiente escuro | Branco |
| Laranja | Branco (ou laranja) |
| Claro/branco | **Laranja** |
| Rodapé escuro | Laranja com opacidade ~0,4 |

A versão laranja (`MELTLOGOORANGE`) não está no disco. Proposta sem criar asset novo: **máscara CSS** sobre o
`logo_dark.png`, pintada com o hex oficial. A cor sai exata e acompanha o tema sozinha:

```css
.logo {
  height: 20px; aspect-ratio: 2500 / 864;
  background: var(--logo-color);              /* #FE5000 no claro, #EDECEA no escuro */
  -webkit-mask: url(logo_dark.png) center / contain no-repeat;
          mask: url(logo_dark.png) center / contain no-repeat;
}
```

**A confirmar com o time de design:** o `MELTLOGOORANGE` original é quadrado (1092×1092), então pode ser outro *lockup*.
Vale pedir os SVG oficiais (wordmark e "e" mark): eles dispensam PNG e máscara.

### 3.3 Tamanhos propostos para o app

- Topbar (56px de altura): wordmark com **20px** de altura e respiro mínimo igual à altura do "e" mark em volta.
- Sidebar recolhida e favicon: "e" mark com 20–24px. Favicon: "e" `#FE5000` sobre quadrado `#0A0A0A` com raio de 22%.
- Tela de login: wordmark com 32–40px, mais a barra arco-íris de 3px no topo do card de login.
- (A regra de 80–140px de altura da marca vale para capa de documento, não para chrome de app.)

### 3.4 Fundos de quadro (substituem as fotos genéricas que o Trello usa)

Pasta: `...\skills\melt-relatorio\assets\backgrounds\`. As luminâncias foram medidas por script.

| Arquivo | Visual | Luminância mediana / p95 | Uso |
|---|---|---|---|
| `cover_dark.jpg` | grafite liso | 0,006 / 0,018 | Padrão sóbrio |
| `section_geo.jpg` | relevo geométrico escuro | 0,014 / 0,033 | Padrão sóbrio |
| `section_color_a.jpg` | ondas azul-cobalto | 0,037 / 0,161 | Quadros de criação |
| `section_waves.jpg` | fita holográfica sobre preto | 0,000 / 0,263 | Destaque, uso pontual |
| `section_marble.jpg` | mármore líquido roxo | 0,062 / 0,387 (picos 1,0) | Destaque, uso pontual |
| `section_color_b.jpg` | mármore laranja/roxo | 0,184 / 0,257 | **Evitar como padrão**: muito laranja, quebra a regra dos 10% |

A marca indica que a maioria das seções use fundos sóbrios (`cover_dark`, `geo`, `marble`) e os coloridos só de vez em quando.
Exportar em WebP com 1920px de largura e uma versão pequena (32px) para o placeholder borrado.
Um quadro sem imagem usa `--bg`.

---

## 4. Tipografia

- **Família:** Syne, disponível no Google Fonts (licença OFL). É eixo variável de 400 a 800. Pesos usados: 400, 500, 600 e 700.
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700&display=swap" rel="stylesheet">
  ```
  Recomendo **auto-hospedar o WOFF2** (app interno, funciona offline, não manda dados ao Google). O `melt-doc`
  embute a Syne em base64 pelo mesmo motivo.
- Pilha: `'Syne', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`.
- **Pesos:** corpo 400. Títulos 500/600. Peso 700 só em eyebrow/micro-rótulo em CAIXA ALTA (10–11px, `letter-spacing: .12–.15em`). **Nunca 800.**
- **A Syne alarga conforme o peso aumenta.** Não troque o peso em hover, seleção ou "não lido": o layout salta.
  Sinalize esses estados com cor, fundo ou um ponto.
- **Glifos que a Syne não tem:** `≥ ≤ ≠ ±`. Eles caem na fonte do sistema e destoam. Em filtros e textos, use palavras
  ("até", "a partir de", "ou mais"). Os glifos `− ÷ × – —` existem e podem ser usados.
- **Números:** aplicar `font-variant-numeric: tabular-nums` em contadores, datas e valores (o `melt-doc` usa isso com a Syne).
  A confirmar no arquivo da fonte se o recurso `tnum` existe. Se não existir, a propriedade é ignorada sem erro e a saída
  é dar `min-width` em `ch` aos contadores.
- **Escala para UI densa** (a Syne é larga, então nada abaixo de 12px em texto que precise ser lido):

| Token | Tamanho/linha | Peso | Uso |
|---|---|---|---|
| `--fs-micro` | 11/14 | 700 caixa alta | Eyebrow, rótulo de seção do menu |
| `--fs-meta` | 12/16 | 500 | Metadados do card (data, contadores, responsável) |
| `--fs-body` | 14/21 | 400 | Texto padrão, descrição, comentários |
| `--fs-card` | 14/19 | 500 | Título do card |
| `--fs-col` | 15/20 | 600 | Título da coluna |
| `--fs-h3` | 18/24 | 600 | Título do modal do card |
| `--fs-h2` | 22/28 | 600 | Nome do quadro |
| `--fs-h1` | 30/36 | 500 | Telas vazias, login, dashboards |

Títulos com `letter-spacing: -0.01em`. Texto longo (descrição, comentários) com largura máxima de ~70ch e `line-height: 1.6`.
Colunas com 288–304px de largura, porque a Syne ocupa mais espaço na horizontal que Inter ou Roboto.

---

## 5. Tom de voz dos microtextos

A marca se descreve como técnica, limpa, premium e consultiva, e pede para nunca suavizar o risco. As regras do `melt-doc` incluem:
"placeholder explícito é melhor que estimativa", formato pt-BR, `−` (U+2212) em negativos e "R$ 60,61".

Regras propostas para a UI:

1. **Direto e curto.** Verbo de ação no botão ("Criar demanda", "Mover", "Arquivar"). Nada de "Clique aqui".
2. **Sem exclamação, sem gíria de tráfego**, sem "Uhuul" ou "Bora!". Emoji não entra em texto de sistema; nos comentários das pessoas, fica livre.
3. **O tom consultivo explica a consequência.** A confirmação diz o que vai acontecer e se dá para desfazer.
4. **O problema aparece com número e sem eufemismo** ("3 demandas atrasadas", e não "algumas coisas precisam de atenção").
5. **Tratamento por "você"**, frases no presente e sem jargão técnico do sistema (nada de "erro 500" para o usuário).
6. **Datas e números em pt-BR:** "14 out", "14/10/2026", "18h" (24h, America/Sao_Paulo), "1.255", "−12%", "R$ 4.500,00".

| Situação | Texto proposto |
|---|---|
| Coluna vazia | "Nenhuma demanda aqui. Arraste um card ou crie uma nova." |
| Quadro novo | "Comece pelas colunas do seu fluxo: Entrada, Produção, Aprovação, Entregue." |
| Arquivar | "Arquivar esta demanda? Ela sai do quadro e continua no histórico." |
| Excluir (irreversível) | "Excluir permanentemente? Não dá para desfazer." Botão: "Excluir" (danger) |
| Desfazer (toast) | "Demanda movida para Aprovação. **Desfazer**" |
| Erro de rede | "Não foi possível salvar. Suas alterações estão guardadas aqui e serão enviadas quando a conexão voltar." |
| Prazo | "Vence hoje, 18h" · "Atrasada há 2 dias" · "Entregue em 12 out" |
| Campo obrigatório | "Informe o cliente." (sem "Ops!") |
| Busca vazia | "Nada encontrado para "briefing Walmart". Tente outro termo ou limpe os filtros." |

---

## 6. O que não fazer (consolidado)

- Laranja em mais de ~10% da tela, como fundo de coluna, sidebar ou cabeçalho inteiro, ou em vários botões primários juntos.
- Usar cores fora da paleta ou "parecidas" (ex.: `#FF5A00`). Derivações só pelas fórmulas documentadas aqui.
- Syne 800, títulos em 700, negrito para criar hierarquia ou peso trocado em hover.
- Duas áreas escuras grandes coladas sem respiro ("parede preta"). Interface densa, sem respiro.
- Texto branco pequeno sobre laranja: o contraste é **3,30:1** e reprova no AA. Ele só vale em texto de 24px ou mais.
- Texto laranja `#FE5000` pequeno sobre fundo claro: 3,30:1 no branco, 2,97:1 no `#F3F3F3`. Use `--accent-ink`.
- Cada barra ou card de uma cor "arco-íris" em gráficos. A regra é uma cor calma (azul), o contexto em cinza `#C9D2DA` e o destaque em laranja.
- Barra arco-íris dentro do quadro ou de telas de conteúdo.
- Logo branco em fundo claro, logo escuro em fundo escuro, logo distorcido ou recolorido fora do hex oficial.
- Logos de parceiros (Google, Meta, Walmart) no chrome do app.
- Vidro fosco atrás de texto pequeno e cinza sobre imagem sem controle (ver seção 8).

---

## 7. Design tokens propostos (CSS custom properties)

**Estratégia:** um único bloco de tokens com `light-dark()` e `color-scheme` (Baseline desde maio de 2024: Chrome 123,
Safari 17.5, Firefox 120). Com isso:

- cada token é declarado uma vez, sem duplicar o bloco do tema escuro;
- o tema segue o sistema por padrão, e `data-theme="light|dark"` força a escolha do usuário;
- **qualquer sub-árvore pode trocar de tema** com `color-scheme: dark`. É assim que se faz o "sanduíche" da marca
  (topbar escura num app claro) sem tokens extras.

Para navegadores antigos, o fallback é gerar os dois blocos (`:root` e `[data-theme=dark]`) no build com os mesmos valores.

```css
:root {
  color-scheme: light dark;
  --font: 'Syne', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;

  /* ---------- marca (fixos) ---------- */
  --melt-orange: #FE5000;  --melt-yellow: #FFCC33; --melt-pink: #FF3366;
  --melt-purple: #660099;  --melt-green: #33CC66;  --melt-blue: #3399FF;
  --melt-deep-purple: #3C2254; --melt-black: #111111; --melt-dark: #0A0A0A; --melt-white: #FFFFFF;

  /* ---------- superfícies ---------- */
  --bg:              light-dark(#F3F3F3, #0A0A0A);  /* canvas do quadro sem imagem */
  --surface-sunken:  light-dark(#EBEBEB, #111111);  /* corpo da coluna, trilhos */
  --surface:         light-dark(#FFFFFF, #181818);  /* card, input, sidebar */
  --surface-raised:  light-dark(#FFFFFF, #1F1F1F);  /* popover, menu, modal */
  --surface-hover:   light-dark(#F7F7F7, #222222);  /* linha de menu, item de lista */
  --surface-inverse: light-dark(#111111, #EDECEA);  /* tooltip, toast */
  --overlay:         light-dark(rgb(10 10 10 / .40), rgb(0 0 0 / .60)); /* scrim de modal */

  /* ---------- texto ---------- */
  --text:          light-dark(#111111, #EDECEA);  /* #EDECEA = branco do logo */
  --text-2:        light-dark(#4A4A4A, #B8B7B5);  /* secundário, descrição */
  --text-3:        light-dark(#666666, #8A8A8A);  /* metadados, placeholder */
  --text-disabled: light-dark(#8A8A8A, #5C5C5C);  /* só desabilitado (isento de AA) */
  --text-inverse:  light-dark(#EDECEA, #111111);

  /* ---------- bordas ---------- */
  --border:         light-dark(#E6E6E6, #262626);  /* hairline decorativa */
  --border-strong:  light-dark(#D4D4D4, #333333);  /* divisória, card arrastando */
  --border-control: light-dark(#8A8A8A, #707070);  /* contorno de input/checkbox: 3:1 ou mais */

  /* ---------- acento ---------- */
  --accent:       #FE5000;
  --accent-hover: light-dark(#E34700, #FF6B3B);  /* OKLab: 8% preto / 12% branco */
  --on-accent:    #0A0A0A;                       /* texto sobre laranja: 6,00:1 (branco seria 3,30:1) */
  --accent-ink:   light-dark(#BD3900, #FE5000);  /* texto/ícone laranja pequeno */
  --accent-soft:  light-dark(#FFEEE6, #341F15);  /* fundo de selecionado: 10% / 12% de laranja */
  --focus-ring:   0 0 0 2px var(--surface), 0 0 0 4px var(--accent); /* halo opaco garante 3:1 em qualquer fundo */
  --logo-color:   light-dark(#FE5000, #EDECEA);

  /* ---------- estados (base = hex da marca; bg = tinta; ink = texto AA) ---------- */
  --success: #33CC66; --success-bg: light-dark(#E7F9ED, #1C3524); --success-ink: light-dark(#197638, #33CC66);
  --warning: #FFCC33; --warning-bg: light-dark(#FFF9E7, #3D351C); --warning-ink: light-dark(#806514, #FFCC33);
  --danger:  #FF3366; --danger-bg:  light-dark(#FFE7ED, #3D1C24); --danger-ink:  light-dark(#C7254E, #FF4A70);
  --info:    #3399FF; --info-bg:    light-dark(#E7F3FF, #1C2D3D); --info-ink:    light-dark(#216AB4, #3399FF);

  /* ---------- etiquetas e colunas (10), cores da marca e da barra assinatura ----------
     base = faixa/ponto; -bg = fundo do chip; -ink = texto do chip (4,6:1 ou mais no bg e na superfície) */
  --label-ambar:     #FEA824; --label-ambar-bg:     light-dark(#FFF3E0, #4B381B); --label-ambar-ink:     light-dark(#976211, #FEA824);
  --label-amarelo:   #FFCC33; --label-amarelo-bg:   light-dark(#FFF8E2, #4B401E); --label-amarelo-ink:   light-dark(#896C16, #FFCC33);
  --label-rosa:      #FF3366; --label-rosa-bg:      light-dark(#FFE2EA, #4B1E29); --label-rosa-ink:      light-dark(#C4254D, #FF5A79);
  --label-magenta:   #CA2177; --label-magenta-bg:   light-dark(#F8E0EC, #3F1A2D); --label-magenta-ink:   light-dark(#BF1F70, #DE6697);
  --label-roxo:      light-dark(#660099, #844AB1); --label-roxo-bg:      light-dark(#EADBF1, #291334); --label-roxo-ink:      light-dark(#660099, #9F74C4);
  --label-berinjela: light-dark(#3C2254, #6F5D84); --label-berinjela-bg: light-dark(#E4E0E7, #201A25); --label-berinjela-ink: light-dark(#3C2254, #8E7F9F);
  --label-verde:     #33CC66; --label-verde-bg:     light-dark(#E2F8EA, #1E4029); --label-verde-ink:     light-dark(#1B7B3B, #33CC66);
  --label-turquesa:  #33B2B1; --label-turquesa-bg:  light-dark(#E2F4F4, #1E3A3A); --label-turquesa-ink:  light-dark(#1F7877, #33B2B1);
  --label-azul:      #3399FF; --label-azul-bg:      light-dark(#E2F1FF, #1E344B); --label-azul-ink:      light-dark(#226CB7, #419FFF);
  --label-grafite:   #737373; --label-grafite-bg:   light-dark(#EBEBEB, #2C2C2C); --label-grafite-ink:   light-dark(#696969, #949494);
  /* o laranja NÃO é etiqueta: fica reservado para acento, foco e seleção */

  /* ---------- espaçamento (base 4) ---------- */
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 20px;
  --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px; --space-16: 64px;

  /* ---------- raios (14px = card de equipe da marca) ---------- */
  --radius-xs: 6px;   /* chip de etiqueta, badge */
  --radius-sm: 8px;   /* botão, input */
  --radius-md: 10px;  /* card do quadro */
  --radius-lg: 14px;  /* coluna, painel, popover */
  --radius-xl: 20px;  /* modal, card de login */
  --radius-full: 999px; /* avatar, pílula, contador */

  /* ---------- sombras (cores por tema; o escuro ganha brilho interno no topo) ---------- */
  --shadow-c1: light-dark(rgb(17 17 17 / .06), rgb(0 0 0 / .45));
  --shadow-c2: light-dark(rgb(17 17 17 / .10), rgb(0 0 0 / .60));
  --highlight: light-dark(rgb(255 255 255 / 0), rgb(255 255 255 / .04));
  --shadow-card:  0 1px 2px var(--shadow-c1), inset 0 1px 0 var(--highlight);
  --shadow-hover: 0 2px 4px var(--shadow-c1), 0 6px 16px var(--shadow-c1), inset 0 1px 0 var(--highlight);
  --shadow-pop:   0 2px 6px var(--shadow-c1), 0 12px 32px var(--shadow-c2), inset 0 1px 0 var(--highlight);
  --shadow-drag:  0 10px 24px var(--shadow-c2), 0 24px 48px var(--shadow-c1);
  --shadow-modal: 0 24px 64px var(--shadow-c2);

  /* ---------- vidro fosco (ver seção 8) ---------- */
  --glass-bg:        light-dark(rgb(255 255 255 / .80), rgb(17 17 17 / .82));
  --glass-border:    light-dark(rgb(255 255 255 / .55), rgb(255 255 255 / .08));
  --glass-edge:      light-dark(rgb(17 17 17 / .06), rgb(0 0 0 / .40));
  --glass-highlight: light-dark(rgb(255 255 255 / .70), rgb(255 255 255 / .06));
  --glass-text-3:    light-dark(#4A4A4A, #B8B7B5);  /* metadado sobre vidro sobe um degrau */
  --glass-blur: 24px; --glass-saturate: 160%;

  /* ---------- movimento ---------- */
  --ease: cubic-bezier(.2, .8, .2, 1);
  --dur-1: 120ms; --dur-2: 200ms; --dur-3: 320ms;
}
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"]  { color-scheme: dark; }
.chrome-dark { color-scheme: dark; }      /* topbar escura no tema claro (alternância da marca) */
@media (prefers-reduced-motion: reduce) { :root { --dur-1: 0ms; --dur-2: 0ms; --dur-3: 0ms; } }
body { background: var(--bg); color: var(--text); font: 400 14px/1.5 var(--font); }
```

### 7.1 Contrastes verificados (WCAG 2.x, calculados por script)

| Par | Claro | Escuro |
|---|---|---|
| `--text` em surface / sunken / bg | 18,9 · 15,8 · 17,0 | 15,0 · 16,0 · 16,8 |
| `--text-2` em surface / sunken | 8,9 · 7,4 | 8,9 · 9,4 |
| `--text-3` em surface / sunken / raised / hover | 5,7 · 4,8 · 5,7 · 5,4 | 5,1 · 5,5 · 4,8 · 4,6 |
| `--border-control` em surface (não-texto, mínimo 3:1) | 3,45 | 3,59 |
| `--accent` (#FE5000) em surface | 3,30 (só UI/ícone grande) | 5,38 |
| `--accent-ink` em surface / sunken | 5,60 · 4,70 | 5,38 · 5,72 |
| `--on-accent` em `--accent` / `--accent-hover` | 6,00 · 4,87 | 6,00 · 6,99 |
| `--accent` no anel de foco (contra o halo `--surface`) | 3,30 | 5,38 |
| `-ink` dos estados em `-bg` | 4,7–5,3 | 4,6–8,1 |
| `-ink` das etiquetas em `-bg` (pior caso) | 4,61 | 4,60 |

**Etiquetas claras no tema claro:** âmbar, amarelo, verde, turquesa e azul ficam abaixo de 3:1 contra o branco quando aparecem
como faixa ou ponto. Por isso a etiqueta **sempre traz o nome em texto** (chip com `-bg` e `-ink`), ou `aria-label`/tooltip
quando o card mostra só a faixa. Os pontos ganham `box-shadow: inset 0 0 0 1px rgb(0 0 0 / .10)` para ter contorno.
Se em algum lugar a cor for o único indicador, use as variantes de 3:1 ou mais: âmbar `#CA841A`, amarelo `#B48F21`,
verde `#29A953`, turquesa `#2EA4A3`, azul `#3297FC`.
No tema escuro, roxo e berinjela já sobem para `#844AB1` e `#6F5D84` dentro do token.

### 7.2 Mapeamento rápido para o quadro

- **Canvas:** imagem de fundo (seção 3.4) ou `--bg`. **Coluna:** `--surface-sunken`, `--radius-lg`, padding 12px, gap 16px
  entre colunas. Faixa de 3px no topo com `--label-*` quando a coluna tiver cor. O título usa `--fs-col` e o contador fica em `--text-3`.
- **Card:** `--surface`, `1px solid --border`, `--radius-md`, `--shadow-card`, padding 12–14px, gap 8px entre cards.
  Hover: `--shadow-hover`. Arrastando: `--shadow-drag` com `--border-strong` e rotação de 2°.
  Selecionado: fundo `--accent-soft` com borda `--accent`.
- **Chip de etiqueta:** `--label-*-bg` com `--label-*-ink`, `--fs-meta` 500, `--radius-xs`.
- **Prazo:** neutro em `--text-3`. Vencendo em 24h: `--warning-bg/ink`. Atrasado: `--danger-bg/ink`. Entregue: `--success-bg/ink`.
- **Botões:** primário `--accent` com `--on-accent` (um por tela). Secundário `--surface` com `--border-strong` e `--text`.
  Ghost: transparente que vira `--surface-hover` no hover. Danger: `--danger-ink` como texto, ou fundo `--danger` com `#0A0A0A`.
- **Avatar:** iniciais em `--label-X-ink` sobre `--label-X-bg`, com X escolhido por hash do id. Nunca laranja.
- **Foco:** `box-shadow: var(--focus-ring)` em todo elemento interativo com `:focus-visible`.

---

## 8. Vidro fosco elegante sem perder AA

O problema: texto sobre vidro fica sobre um fundo que não controlamos (a imagem do quadro). Os fundos da marca vão do
quase preto (`cover_dark`, luminância p95 0,018) a picos brancos (`marble` e `waves` chegam a 1,0).
O blur tira a média da imagem, mas não salva o pior caso, que é uma área grande toda branca ou toda preta.

**Cálculo do pior caso** (composição sRGB como o navegador faz; vidro claro sobre preto puro, vidro escuro sobre branco puro):

| Vidro | Texto | Opacidade mínima do vidro para 4,5:1 |
|---|---|---|
| Branco | `#111111` (text) | 0,49 |
| Branco | `#4A4A4A` (text-2) | 0,73 |
| Branco | `#666666` (text-3) | 0,90 |
| `#111111` | `#EDECEA` (text) | 0,62 |
| `#111111` | `#B8B7B5` (text-2) | 0,77 |
| `#111111` | `#8A8A8A` (text-3) | 0,93 |

**Decisão:** vidro claro com **0,80** e escuro com **0,82**. Isso cobre `--text` e `--text-2` em qualquer imagem.
Metadado sobre vidro usa `--glass-text-3`, que sobe um degrau (= text-2). Laranja sobre vidro só como ícone ou forma
(escuro a 0,82: 3,34:1 no pior caso). O anel de foco carrega o próprio halo opaco.

```css
.glass {
  background: var(--glass-bg);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
          backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-saturate));
  border: 1px solid var(--glass-border);                 /* aresta de luz */
  box-shadow: 0 0 0 1px var(--glass-edge),               /* define a borda em fundo claro */
              inset 0 1px 0 var(--glass-highlight),      /* brilho no topo = "espessura" */
              var(--shadow-pop);
  border-radius: var(--radius-lg);
}
.glass .meta { color: var(--glass-text-3); }
/* sem suporte: fica quase opaco */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass { background: light-dark(rgb(255 255 255 / .96), rgb(17 17 17 / .96)); }
}
/* acessibilidade: transparência reduzida ou alto contraste = sólido */
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .glass { background: var(--surface-raised); backdrop-filter: none; -webkit-backdrop-filter: none;
           border-color: var(--border-strong); }
}
@media (forced-colors: active) { .glass { background: Canvas; border: 1px solid CanvasText; } }
```

Opcional, para um acabamento premium: um grão de ruído SVG a 3% (`background-image` com `feTurbulence` em data-URI)
por cima do `--glass-bg`. Ele evita banding no blur dos gradientes.

**Onde usar e onde não usar:**

- **Usar** em poucas camadas grandes: topbar, sidebar, cabeçalho fixo das colunas e corpo das colunas quando o quadro tem
  imagem, além de menus, popovers e do modal do card sobre o quadro.
- **Não usar nos cards.** São dezenas ou centenas de elementos: `backdrop-filter` em cada um derruba o FPS ao arrastar
  e prejudica a leitura. Card é sempre sólido (`--surface`).
- No tema claro com imagem escura, o vidro claro a 0,80 vira um cinza-lavanda elegante (pior caso `#CCCCCC`: text 11,8:1, text-2 5,5:1).
  No escuro com imagem clara, o pior caso é `#3C3C3C` (text 9,3:1, text-2 5,5:1).
- Ao arrastar (drag ativo), o blur pode baixar para 12px, para manter 60 fps em máquinas fracas.

---

## 9. Pendências e confirmações

1. Pedir ao design os **SVG oficiais** do wordmark e do "e" mark, e confirmar se o logo laranja horizontal feito por máscara é aceitável.
2. Confirmar se a Syne tem `tnum` (numerais tabulares). Se não tiver, definir a saída para contadores.
3. O `reference/template.html` citado pela `melt-brand` não está no pacote. Se existir em outro lugar, revisar se há componentes reaproveitáveis.
4. Validar no navegador alvo da agência o suporte a `light-dark()`. Se houver máquina com navegador anterior a 2024, gerar o fallback no build.
5. Decidir se `section_color_b.jpg` (laranja) entra como capa de quadro. A recomendação é não incluir.

Scripts das medições (reproduzíveis): `scratchpad/scripts/amostra.py`, `fundos.py`, `tokens.mjs`, `extra.mjs`.
