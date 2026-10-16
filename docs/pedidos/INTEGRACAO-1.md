# Integração da Onda 1

Feita sobre `d295938`, com a revisão adversarial do NÚCLEO-SERVIDOR (commits `b818c5a..9ae0bc0`) e a do
DESIGN-SYSTEM-WEB (commits até `d295938`). Commits da integração: `91a6e70..5580492`.

## Pedidos (`docs/pedidos/*.md`)

| Pedido | O que foi feito | Commit |
|---|---|---|
| design-system-web 1: nome do produto antes do login | `server/src/web.ts` lê o `index.html` uma vez e troca o `<title>` e o `<meta name="application-name">` pelo `APP_NOME` escapado para HTML, inclusive em `/index.html`. Conferido com o build de produção servido pelo Node e `APP_NOME="Fila & Cia"`: título e eyebrow certos em `/entrar` e `/convite`, nenhuma mensagem no console (CSP). | `ff4add5` |
| design-system-web 2: cor da pessoa no convite | `TokenAcessoInfo.cor` (contrato `shared/tipos/pessoas.ts`), devolvida pelas duas rotas `.../consultar`; o avatar de `/convite` e `/redefinir` usa a cor. | `91a6e70`, `fc9ef55` |
| dono: Cloudflare na frente | `TRUST_PROXY_HOPS=2` documentado como o de produção (API §1, ARQUITETURA, PLANO §5 e §6, `.env.example` já dizia); `README.md` novo com o deploy e as recomendações da Cloudflare (Full strict, Rocket Loader desligado, Bypass em `/api/*` e `/a/*`, sem Always Online em `/a/*`). Teste novo: com 2 saltos o limite de login conta o IP do visitante e ignora o primeiro item forjado. SSE: já saía com `Cache-Control: no-cache`, `X-Accel-Buffering: no`, ping de 25 s e sem compressão (nada a mudar). | `91a6e70`, `3d1e819` |
| dono: repositório no GitHub | Só informação (o EasyPanel faz o build de `master`); registrada no README. Nada foi enviado ao GitHub. | — |
| design-system-web, "Avisos" | Não são pedidos; seguem valendo. | — |

Nenhum pedido pediu banco: nenhuma migração 090–099.

## Achados do servidor

| # | Achado | O que foi feito | Teste que falhava antes |
|---|---|---|---|
| 1 | alta: limite de login não vale em rajada | `servicos/acesso.ts`: `reservarTentativaLogin` confere os três limites e grava a tentativa com `ok = 0` na mesma transação, antes do scrypt; o acerto vira `ok = 1` (`confirmarTentativa`), o que também zera o par e-mail+IP. | 30 logins em `Promise.all` com a senha certa na 25ª → exatamente 5 respostas 401, 25 respostas 429, a certa 429 e 5 falhas gravadas. |
| 2 | média: convite antigo vale depois da redefinição | Convite só vale (consultar e definir) com `senha_definida_em` nulo; definir a senha por convite, redefinição ou troca revoga os links pendentes das duas finalidades na mesma transação; gerar um link revoga todos os pendentes da pessoa (a redefinição revoga o convite que ainda circula). A conferência repete dentro da transação, depois do scrypt. | Convite pendente + redefinição usada → convite 410 em consultar e em definir, a senha da pessoa continua e a sessão dela também; convite gerado direto para quem já tem senha → 410; definir pelo convite revoga a redefinição pendente; gerar redefinição revoga o convite; trocar a senha revoga a redefinição. |
| 3 | média: limite da troca de senha em rajada | Mesma reserva (`reservarTentativaSenha`). | 20 trocas em `Promise.all` com a senha atual errada → 5 respostas 401 e 15 respostas 429; depois disso, a senha certa → 429. |
| 4 | baixa: `X-Trace-Id` fora de uuid v4 | `app.ts` valida com a regex de uuid v4 (`TRACE_UUID_V4`), como a API §1 pede; o front e o `test/ajuda.ts` já mandavam `randomUUID()`. | `aaaaaaaa`, um uuid v1 e um uuid com sufixo → 403 csrf; uuid v4 em maiúsculas → 201. |

API §4.2 e §4.3 e os critérios de aceite do PLANO §1.1 descrevem as regras novas.

## Achados do design

A auditoria de navegador nova (`npm run auditoria --workspace web`, achado 17) foi rodada também sobre o código de
`d295938` (worktree temporária, mesmo `/dev/ui`): **78 paradas do Tab sem anel, 56 textos abaixo de AA, 12 pares
não textuais abaixo de 3:1 e 764 textos abaixo do piso de tipo** nas 4 combinações de tema e largura. Depois da
integração: **0** em tudo, inclusive na casca e no menu do avatar logados.

| # | O que foi feito | Commit |
|---|---|---|
| 1 alta: anel de foco apagado | `@layer foco` acima de `components` e `utilities` (ordem declarada em `index.css`; o build mantém theme, base, components, utilities, foco). Só regras de `:focus-visible` entram nela; os anéis especiais (inset nas listas, moldura do campo, aviso) também. As abas ganham anel por dentro (a lista rola e cortava o de fora). Conferido no navegador: aba selecionada, BotaoIcone secundário, coluna recolhida e rádio do tema com anel. | `7a64882` |
| 2 alta: GradeCalendario no celular | Abaixo de 768 px os itens ocupam a largura da célula e cortam; "+N" curto (rótulo acessível "+N outros"). A opção "pontos ou contador por dia" ficou para quem desenha os itens (o `CalendarioDemandas` do NÚCLEO-WEB): a grade não sabe a cor nem o tipo do item. | `91883aa` |
| 3 média: interruptor desligado | Trilho `--surface` com contorno `--border-control` e bolinha `--text-3` (5:1 ou mais nos dois temas); o `/dev/ui` mostra o desligado habilitado. | `1bd521c` |
| 4 média: escuro "parede preta" | Menu e abas do celular em `--glass-bg-menu` (#171717 medido), barra um degrau acima (`--glass-bg-topo-escuro`, #232323 medido) e conteúdo em `--bg` (#0A0A0A). O `.chrome-dark` resolve o `light-dark()` sempre no escuro, então a barra troca por seletor de tema. Login escuro: lado do formulário em `--auth-lado` (#111) com o pontilhado visível. | `b7d2acd` |
| 5 média: dente ao lado da barra | Tirado o `scrollbar-gutter` do documento (a primeira tentativa, pintar a faixa da calha, não funciona: o Chrome não pinta imagem de fundo do root na calha). Menu e colunas reservam a calha delas. Barra de 1440 px medida até a borda nos dois temas. | `b7d2acd` |
| 6 média: texto abaixo de 12 px | `--fs-iniciais` (10 px) como mínimo das iniciais e do "+N"; kbd, contadores e micros em `--fs-micro`; feriado em `--fs-meta`; dias da semana do SeletorData e papel do menu do avatar em 11 px caixa alta; rótulo das abas do celular em 12 px com reticências; código do Markdown e do `/dev/ui` com 12 px ou mais; avatar do card de amostra com 24 px. O piso está nos tokens e a auditoria confere. | `994ead5` |
| 7 média: ChipCliente com opacidade | Nome na tinta cheia, diferenciado só pelo peso. | `75a2213` |
| 8 média: caixa marcada do Checkbox | Contorno na cor `-ink` (`--accent-ink`, `--success-ink`); par no contraste.ts. | `1bd521c` |
| 9 média: cabeçalho da grade a 390 px | Título numa linha; segmento Mês \| Semana (abas iguais), Hoje e setas na segunda. | `91883aa` |
| 10 média: feriado some no celular | Número na cor de perigo com um ponto; o nome continua no rótulo da célula e vira dica (`title`). | `91883aa` |
| 11 baixa: hora da Agenda com opacidade | Sem opacidade (números tabulares). | `75a2213` |
| 12 baixa: vidro em camadas de tela cheia | Modal e folha do topo sólidos (`--surface-raised`) abaixo de 768 px. **Recusado no desktop:** o modal é uma das camadas de vidro da marca (§8 e PLANO §1.2) e a variação de fundo é o próprio vidro; o `--glass-bg-camada` a .92 já limita. | `1aa820c` |
| 13 baixa: foco automático no celular | `focoNaCarga()` (`lib/foco.ts`): só com `(pointer: fine)`, no login e na senha nova do convite/redefinição. | `d01a3a1` |
| 14 baixa: anel retangular no item da grade | `.ui-cal-item` com o raio do chip. | `7a64882` |
| 15 baixa: fundos de quadro sem personalidade | Paradas claras com croma 0,04–0,07 (Aurora pêssego → rosa → lavanda; Cobalto; Berinjela; Grafite mais fundo); `--text` e `--text-2` seguem AA em cada parada (contraste.ts). | `e596569` |
| 16 baixa: "Página não encontrada" sem título | `EstadoVazio` aceita `como="h1"`; a casca usa. | `f113b60` |
| 17 baixa: contraste.ts só confere tokens | Pares não textuais e do menu/barra no contraste.ts (284 pares); `web/scripts/auditoria-navegador.ts` + `web/scripts/cdp.ts` (CDP direto, sem dependência) no "pronto" da regra 8. Também achou e corrigiu o que a revisão não listou: foco do campo inválido (só um halo de 22%; agora a borda dobra na cor do erro) e dias de outro mês do SeletorData (clicáveis, em `--text-disabled` a 3,11:1; agora `--text-3`). | `5580492`, `7a64882`, `75a2213` |

Nota de histórico: no `b7d2acd` o `tokens.css` intermediário ficou com os 2 tokens `--auth-*` fora do bloco `:root` (preparação
parcial do commit); o `e596569`, logo depois, deixa o arquivo como deve ser. Não reescrevi o histórico porque a árvore
é compartilhada.

## Estado final (regra 8, na raiz)

- `npx tsc --noEmit -p server` e `-p web`: sem erros.
- `npm test`: 177 de 177 (eram 169; 8 testes novos).
- `node server/scripts/verificar-migracoes.ts`: 420 checagens, 0 falhas.
- `npm run build`: ok, sem aviso de chunk.
- `npm run contraste --workspace web`: 284 pares, 0 abaixo do mínimo.
- `npm run auditoria --workspace web -- --url <Vite>` com login: 0 problemas nas 12 passagens (`/dev/ui`, casca e
  menu do avatar; claro e escuro; 1440 e 390 px).
- Capturas antes/depois conferidas: casca, `/entrar`, `/dev/ui` (calendário a 390 px, fundos, controles, foco),
  modal e folha do topo no celular.

## Avisos para a Onda 2

- Regra de foco: componente novo com anel próprio escreve o `:focus-visible` dentro de `@layer foco { }` no próprio
  CSS; fora dela, ele perde para o anel padrão.
- `X-Trace-Id` tem que ser uuid v4 (o `api()` de `api/cliente.ts` já gera).
- `EstadoVazio` com `como="h1"` quando for o conteúdo principal da tela.
- `focoNaCarga()` para `autoFocus` de tela inteira (no celular o teclado cobre a tela).
- O documento não reserva calha de rolagem; contêiner que rola por dentro usa `scrollbar-gutter: stable` nele.
- Antes de dar "pronto" no front: `npm run auditoria --workspace web -- --url <seu Vite>` (com `AUDITORIA_EMAIL` e
  `AUDITORIA_SENHA` para a casca). Credenciais do integrador: `.env.integrador` (não versionado).
