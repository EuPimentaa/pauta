# Operação: agenda da Melt (Google Agenda) no Pauta

Agendas externas (FASE2 §3; API.md §F.9). O integrador leva este texto ao README, seção "Fase 2".

## O que é

O admin cola, em **Configurações → Agendas externas**, o "Endereço secreto no formato iCal" de uma ou mais agendas do
Google (nome e cor por agenda). O servidor lê cada agenda a cada 15 minutos (tarefa `agenda-busca`) e no "Atualizar
agora", e guarda as ocorrências de 30 dias atrás a 180 dias à frente. Os eventos aparecem:

- na **Agenda**, junto com os prazos: contorno na cor da agenda, só leitura (não arrastam), clicar abre os detalhes
  (horário, local, [Entrar na reunião] para Meet, Zoom e Teams, descrição em texto puro). No mês, os prazos têm
  prioridade e os eventos do dia viram uma linha ("3 eventos", que abre a lista do dia). Filtro por agenda na barra,
  guardado no aparelho;
- no **Início**, em "Hoje na agenda" (até 5 eventos e "Ver na Agenda"; some quando não há agenda ativa);
- no **MCP** (ferramenta `agenda`), pelo provedor `server/src/provedores/agenda.ts`.

Evento particular (`CLASS:PRIVATE` ou `CONFIDENTIAL`) aparece sempre como "Ocupado", sem local, descrição nem link: toda
a equipe vê a Agenda. Convidados e organizador nunca são guardados.

Nenhuma variável de ambiente nova. O endereço fica **cifrado com o `SEGREDO`** e nunca volta ao navegador, ao log nem a
mensagem de erro (a tela mostra só "calendar.google.com · <id da agenda> · …<4 últimos caracteres>"). Trocar o `SEGREDO`
deixa as agendas com "Não deu para ler o endereço guardado": cole os endereços de novo.

## Onde copiar o endereço (no computador)

Google Agenda → engrenagem → **Configurações** → em "Configurações das minhas agendas", clicar na agenda → **Integrar
agenda** → **Endereço secreto no formato iCal** → copiar. Quem tem esse endereço lê a agenda inteira, sem login: não
mande por WhatsApp nem e-mail; cole direto no Pauta. Só quem pode gerenciar o compartilhamento da agenda vê o campo; numa
conta Google Workspace, o administrador do Workspace pode ter escondido o campo (compartilhamento externo restrito). O
botão **Redefinir** do Google cria um endereço novo e o antigo para de funcionar: aí use "Trocar o endereço".

O Pauta aceita só `https://calendar.google.com/calendar/ical/<id>/private-<código>/basic.ics` (também colado como
`webcal://`), sem porta, usuário, `?` nem `#`: quem busca é o servidor, então nenhum outro endereço é aceito, e a regra
vale de novo antes de cada busca.

## Estados de uma agenda

| Na tela | Quando | O que fazer |
|---|---|---|
| Atualizada às 14:05 · 312 eventos | última busca deu certo | — |
| Buscando a agenda… | acabou de ser colada | esperar alguns segundos |
| O Google não reconhece mais este endereço… | `404` (endereço redefinido ou apagado; também `401`, `403` e `410`) | colar o endereço novo em "Trocar o endereço" |
| Não deu para ler o endereço guardado… | o `SEGREDO` mudou | colar o endereço de novo |
| O endereço não devolveu uma agenda… | veio HTML (página de login) | conferir se é o "Endereço secreto no formato iCal" |
| O Google não respondeu agora / demorou mais de 1 minuto | `429`, `5xx`, rede, 60 s | nada: tenta de novo em 15 min |
| A agenda passou de 32 MB / Mais de 20.000 eventos… | tetos | usar uma agenda com menos histórico |
| Pausada | o admin pausou | "Retomar" no menu da agenda |

Nos erros, os eventos da última busca boa continuam na Agenda. "1 evento com uma repetição que o Pauta não entende"
(regra fora do que o Google gera pela tela, ex.: `BYSETPOS`) mostra só a primeira vez daquele evento.

Limites: 32 MB descomprimidos por agenda, 60 s por busca, 1.000 ocorrências por série e 20.000 por agenda na janela,
"Atualizar agora" 1 vez por minuto por agenda. Só o admin cadastra, troca, pausa, exclui e atualiza; todos veem.

## Desenvolvimento

- O endereço `https://calendar.google.com/calendar/ical/teste%40pauta.test/private-0123456789abcdef/basic.ics` lê a
  fixture `server/test/fixtures/agenda/google-2026.ics` sem rede (ignorado com `NODE_ENV=production`). O seed de
  demonstração (`npm run seed:demo --workspace server`) já cria a agenda "Melt" com ele (`server/scripts/demo/agenda.ts`).
  Os eventos da fixture vão de setembro de 2026 a abril de 2027.
- Testes: `server/test/agenda-*.test.ts`; os de busca sobem um servidor falso local (`test/agenda-ajuda.ts`) que serve as
  fixtures por HTTP de verdade (gzip, 404, HTML, 5xx, 302, tempo esgotado, teto, gzip que estoura descomprimido).

## Produção (depois do deploy)

1. O admin cola o endereço secreto da agenda da Melt em Configurações → Agendas externas e espera "Atualizada às …".
2. No shell (o endereço só no ambiente do shell, nunca em arquivo, chat ou commit):
   ```
   AGENDA_ENDERECO='<endereço secreto>' node server/scripts/agenda-diagnostico.ts
   ```
   Imprime só contagens e nomes de propriedades. Anotar abaixo as respostas da pesquisa-ical §8.
3. Conferir 3 eventos contra o Google Agenda: um recorrente, um de dia inteiro e um particular ("Ocupado").

## Diagnóstico do endereço real (a preencher depois do deploy; só contagens)

| Pergunta (pesquisa-ical §8) | Resposta |
|---|---|
| VTIMEZONE de America/Sao_Paulo (STANDARD −03:00 desde 1970?) | |
| FREQ e partes de RRULE; séries fora do subconjunto | |
| STATUS:CANCELLED, CLASS:PRIVATE, VALARM, RDATE, RANGE, TZID fora do Intl, hora flutuante | |
| Privados com detalhes no endereço secreto? | |
| Tamanho, VEVENT, 1º byte, total | |
| Atraso entre editar no Google e aparecer no feed | |
| Quem vê o campo do endereço secreto no Workspace da Melt | |
