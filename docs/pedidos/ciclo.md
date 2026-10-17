# Pedidos do F2 · CICLO (Onda 3)

Mudanças em arquivos de outros donos e decisões que o contrato não fechava. Nada aqui bloqueia o merge: cada item diz
o que está em uso. As decisões (seção "Esclarecimentos de contrato") pedem só o registro na `docs/API.md`.

## 1. Etiquetas no "aprovado" que sai do Atendimento (NÚCLEO-SERVIDOR · `server/src/servicos/mover.ts`, `automacoes.ts`)

**Pedido (opcional, produto):** quando `executarAutomacao` roda a automação do **quadro do envio** (ajuste e aprovado)
e a demanda está em outro quadro (ex.: Atendimento › Com o cliente), mapear para o destino as etiquetas **guardadas
no quadro do envio** (as da Criação), além das atuais.

**Por quê:** no vaivém da fixture a demanda sai da Criação com "Urgente" e "Alteração" (ficam guardadas lá, porque o
Atendimento não tem etiquetas) e é aprovada estando no Atendimento; a automação leva ao Social › Agendar e
`mapearEtiquetas` só olha as atuais (nenhuma), então "Alteração" não aparece no Social, embora exista lá com o mesmo
nome. Quando a aprovação sai da própria Criação (sem a automação de envio), o mapeamento acontece (teste
`publico-decisao`: "Alteração" mapeada, "Urgente" guardada). Nada se perde: as etiquetas continuam guardadas na
Criação e voltam se a demanda voltar.

**Em uso:** o comportamento do núcleo, coberto pelos testes do F2 (`ciclo-retorno`, vaivém).

## 2. `entregarPorSql` sem a miniatura do Drive (NÚCLEO-SERVIDOR · `server/scripts/ciclo-sql.ts`)

**Pedido:** gravar `previa_url = https://drive.google.com/thumbnail?id=<id>&sz=w400` no item do Drive público
(o que o teste do Drive do serviço grava).

**Por quê:** a paridade (`server/test/ciclo-paridade.test.ts`) compara as linhas da fixture com as do serviço e hoje
precisa ignorar `versao_item.previa_url`.

**Em uso:** a paridade deixa `previa_url` de fora (comentado no topo do teste).

## Esclarecimentos de contrato (para a `docs/API.md`, §4.8, §4.16 e §4.17)

1. **Entregar depois da aprovação → `422`** ("Esta peça já foi aprovada…"): sem rodada aberta não há onde pôr a
   versão. O caminho é anular a aprovação ou pedir ajuste interno (que abre a rodada seguinte).
2. **Enviar uma versão que já tem decisão válida → `409 ja_decidida`** (senão a peça ficava "com o cliente" sem
   decisão possível). `contatoId: null` no envio = sem contato (o link pergunta o nome); ausente = o contato padrão.
   Reaproveitar o link ativo estende a validade dele para mais `linkPublicoValidadeDias` a partir do novo envio.
3. **Drive privado com arquivo no lugar:** `drive_privado` bloqueia o envio por link só quando a versão não tem um
   arquivo enviado pelo app; com o "[Enviar arquivo (até 10 MB)]" do diálogo (`POST /api/versoes/:id/itens`), o envio
   passa e a página pública deixa de fora o link do Drive privado (o cliente veria uma tela de login). Caminho de rede
   nunca vai ao cliente; a tela de envio avisa quando a versão só tem caminhos.
4. **Teste do Drive:** a miniatura (`drive.google.com/thumbnail`) sempre redireciona (302) para
   `lh3.googleusercontent.com`, que responde a imagem ou nega (medido em 16/10/2026). O teste segue até 3
   redirecionamentos, só para `drive.google.com` e `*.googleusercontent.com`: imagem 200 → `publico`; 401/403 ou
   redirecionamento para fora (a tela de login) → `privado`; 404, 5xx, rede → `erro`, que **não** bloqueia o envio
   (a tela mostra "Não deu para testar"). O teste depois de entregar ou acrescentar itens sai com ator sem trace, para
   o resultado chegar também à janela de quem entregou.
5. **Decisão pública, ordem:** "versão já decidida" (`409 ja_decidida`) vem antes de "não aguarda mais" (`409
   conflito`) quando a versão pedida é a última enviada por este link e já tem decisão válida: assim, de duas decisões
   simultâneas, a segunda recebe `ja_decidida` (o envio pendente já foi limpo pela primeira).
6. **`ItemAprovacaoPublico.proximoPasso`** também vale "Esta peça não aguarda mais sua decisão." quando a versão do
   link não tem decisão mas a peça não espera mais por ela (outra versão foi enviada por fora, ou o envio pendente foi
   tratado de outro jeito): a página não mostra os botões. Sem decisão e aguardando: `null`. Comentários visíveis ao
   cliente saem com a menção trocada por "@Nome" (a página mostra texto puro, sem o renderizador de Markdown).
7. **`GET /api/publico/arquivos/:id`** aceita `&inline=1` (só vale para imagem, como na rota interna); a prévia de
   imagem da página usa.
8. **Anular** também recusa (`409`) quando já há uma rodada nova aberta (ajuste interno depois da aprovação). Vale
   para aprovação pelo link e pelo atendimento; o "Desfazer" do aviso só aparece na manual.
9. **`DELETE /api/quadros/:id/automacoes/:gatilho`** é idempotente (`204` sem automação). Quadro arquivado → `422`;
   desconhecido → `404`.
10. **Texto para WhatsApp:** sem contato, "Olá, tudo bem." no envio e no lembrete e "Obrigado." (sem nome) no
    aprovado e no ajuste; lembrete sem link (envio por fora sem link ativo do contato) termina sem o endereço; o nome
    do modelo não se repete quando o título já começa com ele ("Carrossel de outubro").

## Avisos (não são pedidos)

- **F3 (Início):** `copiar-whatsapp` com `modelo: 'lembrete'` e `registrar-retorno` com `{ demandaId }` funcionam fora
  do modal (buscam a demanda no bootstrap e o detalhe por número).
- **F5 (Configurações › Quadros):** o botão [Automações] já abre `automacoes-quadro`.
- **Peso da página pública:** `/a/:token` baixa 142 kB gzip (nível 9) somando o HTML de entrada, os imports estáticos,
  o CSS de entrada e o chunk da tela (que não usa os componentes do design system em JS, só as classes). O grafo de
  entrada sozinho já são ~131 kB: qualquer coisa nova no chunk de entrada aperta a margem.
- **Atalhos ocupados pelo F2:** Shift+R e Shift+E (escopos `card` e `modal`).
