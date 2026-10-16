# Pedidos do F5 (cadastros)

Pedidos a outros donos (PLANO §0, regra 1) e esclarecimentos de contrato que o F5 precisou decidir. Nada aqui
bloqueia o merge: cada item tem um contorno local já no código do F5.

## Pedidos

| # | Para | Pedido | Contorno no F5 | Prioridade |
|---|---|---|---|---|
| 1 | F3 (Início) | Os **Primeiros passos** do admin chegaram pelo F5, a pedido da orquestração da Onda 3, como seção do Início: `web/src/extensoes/inicio/cadastros-primeiros-passos.tsx` (ordem 50, só admin). O Início do F3 só precisa hospedar `secoesInicio()`; não repita o bloco (se o F3 já tiver um `paineis-primeiros-passos`, o integrador fica com um). Os critérios saem do bootstrap com a regra da API §4.18 (`calcularPassos`, testado em `server/test/cadastros-web-logica.test.ts`); o `primeirosPassos` de `GET /api/inicio` continua no contrato. O convite abre ali mesmo, com o link para copiar. | Rota só de DEV `/dev/cadastros-inicio` (`web/src/telas/quadros/dev/`) desenha as seções do Início para o roteiro; pode sair quando o Início do F3 entrar. | média |
| 2 | NÚCLEO-WEB | `useCopiarQuadro` (`api/quadros.ts`) põe no bootstrap o quadro, as colunas, as etiquetas e as automações, mas não os **modelos de demanda copiados** nem o `eu.seguindo` do quadro novo (os eventos `modelo_demanda` e `quadro_usuario` são eco e o tratador os ignora). Sugestão: recarregar o bootstrap no próprio hook depois de copiar (ou o contrato devolver os modelos no `QuadroCompleto`). | `depoisDeCopiar(qc)` em `funcionalidades/cadastros/api.ts` recarrega o bootstrap. | baixa |
| 3 | Contrato (`shared/tipos/tempo-real.ts`) + NÚCLEO-SERVIDOR + NÚCLEO-WEB | `PATCH /api/config/app` não tem evento: não existe a entidade `config` em `MapaEntidades`, então as outras janelas só veem a configuração nova (prazo padrão, dias das concluídas…) no próximo bootstrap. Sugestão: entidade `config` (público interno, objeto `ConfigApp` inteiro), emitida pelo F5 no PATCH e aplicada pelo tratador do núcleo em `['bootstrap'].config`. | A janela de quem salva atualiza `['config','app']` e `['bootstrap'].config` pela resposta. | baixa |
| 4 | DESIGN-SYSTEM-WEB (`sessao/Tela.tsx`) | Rota `acesso: 'admin'` com `layout: 'sobreposta'` (`/quadros/novo`): quem não é admin e abre o endereço direto vê o "Você não tem acesso a esta página." solto por cima da tela de baixo, fora de um modal. Sugestão: na sobreposta, desenhar o aviso dentro de um `Modal`. | Só o admin vê os caminhos para `/quadros/novo` (menu, Configurações, Primeiros passos, paleta). | baixa |

## Esclarecimentos de contrato (para a API.md)

Decisões que o texto da API deixava em aberto; o integrador pode registrar na API.md:

- **§4.11, `GET /api/config/feriados` sem `ano`**: devolve o ano corrente de São Paulo. `ano` fora de 2000–2100 → `400`.
- **§4.11, `POST /api/config/feriados` sem `tipo`**: vale o padrão do banco (`nacional`); a tela manda `municipal` por padrão.
- **§4.11, `PATCH /api/config/app`**: grava só o que mudou. Mandar o **mesmo** `demandaNumeroInicial` que já está gravado não é
  mudança (`200`), para o formulário poder mandar a configuração inteira; diferente do atual, precisa ser maior que o maior
  número já usado (`400 validacao` com `detalhes.campos.demandaNumeroInicial`). Campos fora de `EditarConfigAppEntrada`
  (como `modelosRevisadosEm`) são descartados, como no resto da API. Um campo fora da faixa recusa o corpo inteiro (nada é gravado).
- **§4.19, `GET /api/arquivo?q=`**: `#12` ou `12` acha pelo número; o maior começo do texto que for apelido ou sigla de um
  cliente filtra o cliente ("he outubro", "hospital evangelico carrossel"); o resto procura no título e na descrição pelo
  FTS5 por prefixo, sem acento. O mês é o de São Paulo (23h30 de 30/09 é setembro). Cursor inválido → `400`.
- **§4.10, `GET /api/clientes/:id/aprovacoes`**: pelo id (a sigla dá `404`); `quem` = o contato, o nome informado no link ou
  "registrado por <apelido>".

## Avisos para quem vem depois

- Diálogo `criar-cliente` (F1, F4): devolve `{ cliente }` já no bootstrap e em `['clientes']`. Sigla de outro cliente
  (`409` com `detalhes.clienteId`): o diálogo oferece "Usar HE" e devolve o cliente que já existe.
- Diálogo `copiar-quadro` é só do F5 (tipo acrescentado com `declare module` em `funcionalidades/cadastros/dialogos.ts`).
- `/config/quadros?quadro=<slug>` abre o quadro escolhido; `/config/pessoas?convidar=1` já abre o convite;
  `/quadros/novo?equipe=<id>` já escolhe a equipe; `/arquivo?cliente=<id>&quadro=<id>&mes=AAAA-MM&q=` filtra.
