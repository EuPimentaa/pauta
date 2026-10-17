# Pedidos do F6 · Lista (Onda 3, leva 2)

Mudanças em arquivos de outros donos que a Lista, o Calendário do quadro, os filtros e o celular pediriam. Nada aqui
bloqueia: cada item diz o contorno em uso.

| # | Para | Pedido | Contorno em uso | Prioridade |
|---|---|---|---|---|
| 1 | NÚCLEO-WEB (`quadro/Cabecalho.tsx`, `quadro/quadro.css`) | **Seletor de visão no celular só com os ícones** (o rótulo vai para o `aria-label` e a dica). Com os três layouts instalados, abaixo de 768 px as abas "Quadro \| Lista \| Calendário" ocupam uma linha inteira do cabeçalho: título, "Filtros", total e "Só as minhas", as abas e a faixa de colunas somam 4 linhas (o card começa em y ≈ 230 a 390 × 844). Só com ícones as abas cabem na linha do total, com o ···. | Nenhum (4 linhas; a faixa de colunas é a última). | média |
| 2 | NÚCLEO-WEB (`quadro/Cabecalho.tsx`) | **Seletor de visão logo depois do nome** (INTEGRACAO-2, achado visual 16, "F4 e F6 no cabeçalho"). Hoje ele vem à direita, depois de "Só as minhas". | Nenhum. | baixa |
| 3 | NÚCLEO-WEB (`extensoes/tipos.ts`, `quadro/Cabecalho.tsx`) | **Lugar `abaixo` em `ExtensaoCabecalhoQuadro`** (uma linha inteira sob o cabeçalho) para os chips dos filtros ativos. Com chips, o lado esquerdo cresce e, a 1440 px, o grupo da direita (total, Só as minhas, Limpar, visões, ···) desce para a segunda linha; os chips numa linha própria deixariam a primeira estável. | Os chips ficam à esquerda, depois do botão "Filtros"; o cabeçalho quebra a linha quando não cabem. No celular eles já rolam numa linha só. | baixa |
| 4 | NÚCLEO-WEB (`calendario/CalendarioDemandas.tsx`) | **`semPrazo` também no celular**: a lista por dia (`ListaPorDia`) ignora a faixa "Sem prazo". | `LayoutCalendario` não passa `semPrazo` abaixo de 768 px e desenha "Sem prazo (N)" recolhível embaixo do calendário, com `CardDemanda` (abrir e escolher o prazo em Datas). | baixa |
| 5 | NÚCLEO-WEB (`teclado/index.ts`) | **"Card sob o mouse" na API do teclado** (§2.2): exportar `definirCardSobMouse`/`sairDoCard` (ou um `useSobMouseDemanda()`), como o `useFocoDemanda`. A linha da Lista marca a demanda sob o mouse para Espaço, `,`/`.` e Enter valerem como no card do quadro. | A Lista importa de `teclado/foco.ts` (só as duas funções). | baixa |
| 6 | NÚCLEO-WEB (`quadro/index.ts`) | **Exportar `MenuDoCard`** pela API do quadro (§2.2): o botão direito na linha da Lista abre o mesmo menu do card (Mover, Copiar, Enviar para, Arquivar…). | A Lista importa de `quadro/CardDemanda.tsx`. | baixa |
| 7 | NÚCLEO-WEB (`quadro/CardDemanda.tsx`) | **`tabIndex` opcional no `CardDemanda`** (foco itinerante fora do quadro). Na Lista do celular cada card é uma parada do Tab (283 na Criação da demonstração); com o `tabIndex`, a lista usaria uma parada só e as setas, como no desktop. | Nenhum (no celular o Tab é raro; a auditoria passa). | baixa |

## Decisões do F6 que valem para quem vem depois (não são pedidos)

- **Busca por texto dos filtros** (`shared/logica/filtros.ts`, agora do F6): cada termo casa o **começo** de uma palavra do
  título, da sigla ou do nome do cliente (antes, qualquer trecho: "he" pegava "Folheto"); palavra composta casa junta e
  por partes ("email", "e-mail" e "mail" acham "E-mail marketing"; "venda" acha "pós-venda"); pontuação separa ("HE:
  carrossel"); um `#` sozinho, no meio da digitação de "#12", não filtra. Número continua por prefixo ("#12" acha 12 e
  120). Vale para o quadro do núcleo também (é a mesma função); os testes do núcleo continuam passando.
- **Ordem e agrupamento da Lista na URL:** `?ordem=prazo` (crescente) ou `?ordem=-prazo` (decrescente) e
  `?agrupar=coluna|membro|cliente|prioridade|prazo|nenhum`, ao lado de `?v=` e `?f=`; o padrão (ordem do quadro,
  agrupada por coluna) não vai para a URL. O último escolhido em cada quadro fica no aparelho (`pauta:lista-ordem:<quadro>`,
  `pauta:lista-agrupar:<quadro>`), como a visão. Grupos recolhidos: `pauta:lista-recolhidos:<quadro>:<agrupamento>`.
  Calendário: `pauta:calendario-modo` e `pauta:calendario-campos` (início e publicação, além do prazo).
- **Agrupar por membro** repete a demanda em cada pessoa dela (como o Trello); "Sem membros" vem primeiro.
- **Soltar na Lista:** só agrupada por coluna. Na ordem do quadro, a demanda cai exatamente onde a linha indica (antes ou
  depois dela, ou no topo pelo cabeçalho do grupo); com outra ordem (prazo, título…) vai para o topo da coluna, porque a
  posição na coluna não aparece na tela. Pelo teclado, `,` e `.` (núcleo) e Shift+M (F1) continuam valendo na linha.
- **Atalho F** (escopo `quadro`): abre o painel de filtros no Quadro, na Lista e no Calendário.
- A coluna do agrupamento escolhido (Coluna, Cliente ou Prioridade) some da tabela: ela repetiria o grupo em cada linha.
