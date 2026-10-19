# Pesquisa: iCal do Google Agenda (Fase 2, §3 "Agenda da Melt")

Feita em 19/10/2026 para orientar a leitura das "Agendas externas" (`docs/FASE2.md` §3). Fontes: ajuda do Google, RFC
5545, o código-fonte do ical.js 2.2.1 (lido no jsDelivr, sem instalar) e **medições em dois feeds públicos do próprio
Google** (mesmo gerador e mesmo formato do endereço secreto; links no fim). Nenhum endereço secreto foi usado; o que
depende dele está em [§8](#8-a-conferir-com-o-endereço-real). Nada foi instalado no projeto.

Sumário: [1 Recomendação](#1-recomendação) · [2 Endereço secreto](#2-o-endereço-secreto) ·
[3 RFC 5545](#3-rfc-5545-o-que-importa-e-o-que-o-google-grava) · [4 Fuso](#4-fuso-a-armadilha-do-vtimezone-do-google) ·
[5 ical.js × leitor próprio](#5-icaljs-221--leitor-próprio) · [6 Desenho sugerido](#6-desenho-sugerido) ·
[7 Casos de teste](#7-casos-de-teste) · [8 Pendências](#8-a-conferir-com-o-endereço-real) · [Fontes](#fontes)

---

## 1. Recomendação

1. **Leitor próprio, sem dependência nova**, só para o que o Google emite: ~450–500 linhas em 3–4 arquivos de serviço
   puros + ~60 testes sobre as fixtures desta pasta. O ical.js 2.2.1 é bom e não tem dependências, mas **não resolve as
   duas partes que mais importam aqui** (fuso pelo IANA e montagem das exceções) e traz 268 KB de código MPL para um
   formato que o Google usa num subconjunto pequeno e medido (§5).
2. **Fuso pelo `Intl` (tzdata do Node), nunca pelo `VTIMEZONE` do arquivo.** Medido: o Google escreve o `VTIMEZONE`
   só com a regra **atual** projetada desde 1970. Para `America/Sao_Paulo` isso dá −03:00 em qualquer data, o que erra
   em 1 h todo horário de verão até 2019 (§4). O `VTIMEZONE` só serve de reserva para TZID que o `Intl` não conhece.
3. **Dia inteiro é data local (`YYYY-MM-DD`), nunca instante.** `DTEND` é exclusivo.
4. **Exceções são do Pauta, não da biblioteca:** agrupar por `UID`, casar `RECURRENCE-ID` por instante UTC (o Google
   mistura TZID e `Z`), aplicar `EXDATE`, `STATUS:CANCELLED`, exceção movida para dentro ou para fora da janela, exceção
   sem mestre e a série partida por "esta e as seguintes" (`UID` com sufixo `_R<data>`).
5. **Texto de fora só como texto** (`PLANO.md` §0 regra 9): a `DESCRIPTION` do Google vem em **HTML** em 91% dos
   eventos medidos; converter para texto puro e guardar só links `https:`. Link da reunião pela propriedade
   `X-GOOGLE-CONFERENCE`; a regex na descrição é só reserva.
6. **Plano B sem retrabalho:** os testes do §7 descrevem comportamento, não implementação. Se o diagnóstico do feed
   real (§8) mostrar regras de repetição fora do subconjunto, troca-se só o expansor pelo ical.js 2.2.1, mantendo a
   conversão de fuso própria.

## 2. O endereço secreto

### 2.1 Como obter (só no computador)

Google Agenda → **Configurações** (engrenagem) → em "Configurações das minhas agendas", clicar na agenda →
**Integrar agenda** → seção **"Endereço secreto no formato iCal"** → copiar. O botão **Redefinir** cria um endereço novo
e invalida o antigo.

- Conta Google Workspace (o caso da Melt): o admin pode ter restringido o compartilhamento e aí o campo **não aparece**
  (ajuda do Google). Os níveis de compartilhamento externo do Admin são "Somente informações de disponibilidade",
  "Compartilhar todas as informações…" etc.; com o primeiro o campo some, segundo fontes de terceiros (a confirmar, §8).
- Agenda de outra pessoa ou agenda secundária: o campo só aparece para quem pode **gerenciar o compartilhamento**
  daquela agenda (a confirmar, §8). Para a agenda da agência, quem copia é o dono dela.
- O Google trata o endereço como senha: "Não compartilhe esse endereço com outras pessoas." Quem tem o link lê a
  agenda inteira, sem login. Por isso o `FASE2.md` manda guardar cifrado e nunca devolver ao navegador.

### 2.2 Formato do endereço

```
https://calendar.google.com/calendar/ical/<id da agenda, url-encoded>/private-<token hex>/basic.ics
```

- `<id>`: o e-mail para a agenda principal (`pessoa%40meltcomunicacao.com.br`) ou `<hash>%40group.calendar.google.com`
  para agendas secundárias. O token visto em exemplo público tem 32 hexadecimais; não fixar o tamanho na validação.
- A variante `/public/basic.ics` só funciona se a agenda for pública (não queremos).
- **Validação sugerida** (anti-SSRF, a URL vem do admin mas o servidor é quem busca): protocolo `https:`, host
  exatamente `calendar.google.com`, caminho `^/calendar/ical/[^/]+/private-[0-9a-f]+/basic\.ics$`. Aceitar `webcal://`
  colado trocando por `https://`. Sem redirecionamento (medido: o endereço válido responde 200 direto).

### 2.3 O que o feed expõe (medido no feed público do Kubernetes, mesmo gerador)

| Dado | Presença medida | O que o Pauta faz |
|---|---|---|
| **Todo o histórico** da agenda (2017 → 2028 no feed medido), sem janela | 15.676 VEVENT | expandir e guardar só −30…+180 dias |
| Título, início/fim, recorrência, exceções | todos | guardar |
| `LOCATION` (texto com `\,` escapado; muitas vezes um link) | 67% | guardar como texto; link `https:` vira link |
| `DESCRIPTION` **em HTML** (`<br>`, `<a href>`, atributos internos do Google) | 13.984 de 15.424 | converter para texto, cortar em ~2 KB |
| `X-GOOGLE-CONFERENCE:https://meet.google.com/...` | todos os que têm Meet | link da reunião |
| Bloco do Meet **traduzido** no fim da descrição ("Entrar com o Google Meet: …") | todos os que têm Meet | não depender do texto (idioma varia) |
| `ORGANIZER` e `ATTENDEE` com nome, e-mail e resposta (`PARTSTAT`) | 100% | **não guardar** (LGPD; não é preciso) |
| `ATTACH` (links do Drive com `FILENAME`) | 16% | ignorar |
| `CLASS` (no feed público só `PUBLIC`) | 5% | `PRIVATE`/`CONFIDENTIAL` → mostrar "Ocupado", sem detalhes (§8) |
| `TRANSP:TRANSPARENT` (evento "livre", ex.: feriados) | parte | guardar (estilo mais leve) |
| `STATUS` | só `CONFIRMED` no feed medido | tratar `CANCELLED` e `TENTATIVE` mesmo assim |
| `VALARM` (lembretes) | 0 | ignorar |

### 2.4 Comportamento HTTP (medido em 19/10/2026)

- `200`, `content-type: text/calendar; charset=utf-8`, linhas **CRLF**, dobra em **75 octetos**.
- `cache-control: no-cache, no-store, max-age=0, must-revalidate`; **sem `ETag` e sem `Last-Modified`**. Mandei
  `If-None-Match` e `If-Modified-Since`: volta `200` com o corpo inteiro. Não há busca condicional; toda busca baixa tudo.
- O corpo é **gerado na hora**: `DTSTAMP` de todos os eventos = hora da requisição. Logo, o hash do corpo muda a cada
  busca. Para saber se algo mudou, calcular o hash **sem as linhas `DTSTAMP`**.
- Compressão: com `Accept-Encoding: gzip` o feed de feriados cai de 102 KB para 10,7 KB e o do Kubernetes de 24,5 MB
  para 1,75 MB. O `fetch` do Node 24 já manda `accept-encoding: gzip, deflate` e descomprime sozinho (medido).
- Tempo: feed pequeno 0,45–0,49 s até o 1º byte; o de 24,5 MB levou **19,3 s até o 1º byte** (o Google monta tudo antes
  de enviar). O limite de tempo precisa ser folgado (sugestão: 60 s), diferente dos 5 s do teste do Drive.
- Endereço inválido ou **redefinido**: `404` com `text/html` (medido com token inventado). Tratar como "o endereço
  deixou de funcionar; cole o novo" e manter os eventos da última busca boa.

### 2.5 Frequência de atualização

O Google não documenta em quanto tempo uma alteração aparece no endereço secreto. Como o feed é gerado a cada pedido e
vem com `no-store`, a expectativa é de minutos; os "até 12–24 h" que aparecem em fóruns são do sentido contrário (o
Google lendo um iCal de fora). Os 15 min do `FASE2.md` são adequados; medir o atraso real com a agenda da Melt (§8).

### 2.6 Tamanho típico

| Feed (público, gerado pelo Google) | VEVENT | Tamanho | gzip | Bytes por VEVENT |
|---|---|---|---|---|
| Feriados no Brasil (só dia inteiro, sem convidados) | 275 | 102 KB | 10,7 KB | ~370 B |
| Kubernetes (reuniões com convidados e descrição HTML, desde 2017) | 15.676 | 24,5 MB | 1,75 MB | ~1,56 KB |

Uma agenda de agência com alguns milhares de eventos acumulados fica entre centenas de KB e poucos MB, e **cresce
sempre** (o feed não tem janela). Sugestão de teto: 32 MB descomprimidos por agenda (cabe o pior caso medido) e 15 min
entre buscas por agenda.

## 3. RFC 5545: o que importa e o que o Google grava

Contagens do feed do Kubernetes (15.676 VEVENT: 5.458 séries, 10.089 exceções, 129 avulsos).

| Ponto | RFC 5545 | O Google grava (medido) | O Pauta faz |
|---|---|---|---|
| Linhas | §3.1: CRLF; dobra = CRLF + espaço/tab; ≤ 75 octetos; ao desdobrar, restaurar a sequência UTF-8 | CRLF, 75 octetos | desdobrar **em bytes** antes de decodificar UTF-8; aceitar LF solto e BOM |
| Texto | §3.3.11: `\\` `\;` `\,` `\n`/`\N` | `\,` no LOCATION, `\n` na descrição | desescapar |
| Parâmetros | §3.2: valor entre aspas pode ter `:` `;` `,` | `CN=` com nomes | parser de parâmetros com aspas |
| `VEVENT` | §3.6.1 | um por série, um por exceção | ignorar `VTODO`, `VJOURNAL`, `VALARM` |
| `DTSTART`/`DTEND` | §3.3.5: 3 formas (flutuante, UTC com `Z`, local com `TZID`); `DTEND` exclusivo (§3.8.2.2) | avulsos em **UTC** (`Z`); séries com **TZID**; exceções com TZID (a maioria) ou `Z` | as 3 formas; flutuante = `X-WR-TIMEZONE`, senão São Paulo |
| Sem `DTEND` | §3.6.1: data → dura 1 dia; data-hora → termina no início | não emite | seguir a RFC |
| `DURATION` | §3.8.2.5 | não emite | aceitar `P#D`, `PT#H#M#S`, `P#W` |
| Dia inteiro | `VALUE=DATE`; `DTEND` também data | 4 no feed; comum em agendas reais | data local, nunca instante |
| `TZID` / `VTIMEZONE` | §3.2.19, §3.6.5 | IANA (18 fusos); `VTIMEZONE` com regra atual desde 1970 (§4) | `Intl` primeiro; `VTIMEZONE` só se o `Intl` recusar |
| `RRULE` | §3.3.10, §3.8.5.3; `UNTIL` inclusivo e em UTC quando DTSTART tem TZID; `DTSTART` conta como 1ª ocorrência do `COUNT`; datas inválidas (30/02) e horas inexistentes são ignoradas e não contam | `FREQ` WEEKLY/MONTHLY (DAILY e YEARLY esperados), `INTERVAL`, `COUNT`, `UNTIL` (UTC; data nas séries de dia inteiro), `BYDAY` com ordinal (`3TH`, `-1WE`), `WKST=SU`/`MO` | subconjunto do §5.3 |
| `EXDATE` | §3.8.5.1: tira da série; aceita lista com vírgula | uma por linha, TZID (95%) ou UTC; até 22 por série | casar por instante UTC; aceitar lista |
| `RDATE` | §3.8.5.2 | 0 | aceitar lista simples (barato) ou ignorar |
| `RECURRENCE-ID` | §3.8.4.4 + `RANGE=THISANDFUTURE` (§3.2.13) | 10.089 exceções; **0 com RANGE**; 511 em UTC com mestre em TZID; 52 movidas para outro dia; 6 sem mestre no arquivo | casar por instante UTC; RANGE não é preciso |
| "Esta e as seguintes" | — | série antiga ganha `UNTIL`; a nova vem com `UID` = `<uid>_R<AAAAMMDDTHHMMSS>` (14.800 VEVENT com esse sufixo) | tratar como série independente |
| `STATUS` | §3.8.1.11: `TENTATIVE`, `CONFIRMED`, `CANCELLED` | só `CONFIRMED` (instância apagada vira `EXDATE`) | `CANCELLED` em avulso, mestre ou exceção = some |
| `UID` / `SEQUENCE` | §3.8.4.7, §3.8.7.4 | `…@google.com`; `SEQUENCE` até 10 | duplicata de `UID`+`RECURRENCE-ID`: maior `SEQUENCE`, depois `LAST-MODIFIED` |
| `LOCATION`, `DESCRIPTION` | §3.8.1.7, §3.8.1.5 (TEXT) | descrição em HTML | texto puro (§6.4) |
| `ATTENDEE` | §3.8.4.1 | e-mail, nome, `PARTSTAT` | não guardar |
| Link de reunião | RFC 7986 tem `CONFERENCE`; o Google não usa | `X-GOOGLE-CONFERENCE` | ler essa; reserva: regex Meet/Zoom/Teams em LOCATION e DESCRIPTION |

## 4. Fuso: a armadilha do VTIMEZONE do Google

Medido no feed do Kubernetes: todo `VTIMEZONE` vem com **`DTSTART:1970…`** e só a regra vigente. Fusos sem horário de
verão hoje (Tóquio, Ho Chi Minh) têm um único `STANDARD` fixo; fusos com horário de verão (Nova York, Helsinque) têm
`DAYLIGHT`/`STANDARD` com o `RRULE` atual. Para São Paulo, que não tem horário de verão desde 2019, o esperado é um
`STANDARD` −03:00 desde 1970 (a confirmar no feed real, §8). Consequências:

- **Quem converte pelo `VTIMEZONE` do arquivo** (é o que o ical.js 2.x faz: `Time.fromDateTimeString` busca o TZID na
  árvore com `getTimeZoneByID`) erra em 1 h qualquer ocorrência de São Paulo em horário de verão antigo. Exemplo:
  `DTSTART;TZID=America/Sao_Paulo:20181105T100000` é `2018-11-05T12:00:00Z` (−02:00), não 13:00Z.
- **Se o TZID não estiver no arquivo nem registrado**, o ical.js cai em `Timezone.localTimezone` (hora flutuante =
  fuso da máquina). No Docker o fuso é UTC: erro de 3 h, calado.
- Na janela −30…+180 dias de hoje a regra atual coincide com o IANA, então o erro só aparece em testes com relógio no
  passado, em fusos que mudaram de regra há pouco, ou se o Brasil voltar a ter horário de verão (aí o Google muda o
  `VTIMEZONE` e o Node precisa de tzdata nova: hoje `process.versions.tz` = `2026c` no Node 24.20; manter a imagem
  `node:24-slim` atualizada).

**Decisão sugerida:** converter hora local + TZID em instante pelo `Intl.DateTimeFormat` (a mesma técnica de
`shared/logica/datas.ts`, generalizada de `partesSP` para qualquer fuso). Regras da RFC §3.3.5 para os casos de borda,
com um algoritmo curto e sem laço aberto:

```
t = Date.UTC(ano, mes-1, dia, hora, min, seg)          // relógio de parede tratado como se fosse UTC
o1 = desvio(t - 12h); o2 = desvio(t + 12h)              // desvio(x) = parede(x) - x, pelo Intl
candidatos = { t - o1, t - o2 } que voltam para o mesmo relógio de parede
2 candidatos (hora repetida, fim do horário de verão) -> o mais cedo (RFC: "first occurrence")
0 candidatos (hora que não existiu, início do horário de verão) -> t - o1 (RFC: desvio de antes da lacuna)
```

Vetores conferidos com o `Intl` do Node 24.20 (usados nos testes F do §7):

| Hora local em São Paulo | Instante | Por quê |
|---|---|---|
| 2018-10-29 10:00 | 13:00Z | −03:00 |
| 2018-11-05 10:00 | 12:00Z | −02:00 (horário de verão; o VTIMEZONE do Google diria 13:00Z) |
| 2018-11-04 00:30 | 03:30Z (aparece 01:30) | não existiu: o relógio pulou de 00:00 para 01:00 |
| 2019-02-16 23:30 | 2019-02-17T01:30Z | aconteceu duas vezes: vale a primeira (−02:00) |
| 2026-10-26 09:00 em Nova York | 13:00Z = 10:00 em SP | EDT |
| 2026-11-02 09:00 em Nova York | 14:00Z = 11:00 em SP | EST (os EUA saem do horário de verão em 01/11/2026) |

Ressalva da RFC §3.3.10: uma **ocorrência de série** que cai numa hora inexistente "MUST be ignored". Sugestão:
deslocar como no §3.3.5 (não some com um compromisso; só afeta 00:00–00:59 de domingos de início de horário de verão
até 2018) e registrar a escolha num comentário.

## 5. ical.js 2.2.1 × leitor próprio

### 5.1 O ical.js 2.2.1 (fatos)

- Mozilla/Philipp Kewisch; usado no Thunderbird. 2.2.0 em 28/06/2025, **2.2.1 em 08/08/2025**, ainda a `latest` hoje
  (14 meses sem versão nova). **Zero dependências** de execução, licença **MPL-2.0** (copyleft por arquivo: só obriga se
  modificarmos os arquivos dele e distribuirmos; uso interno sem mudança é tranquilo).
- ESM (`"type": "module"`, `exports.import = ./dist/ical.js`), tipos em `dist/types/module.d.ts` gerados do JSDoc.
  `dist/ical.js` tem 268 KB (78 KB minificado); pacote de 1,2 MB com 70 arquivos.
- O que entrega: `ICAL.parse` (texto → jCal), `Component`, `Property`, `Time`, `Duration`, `Event` (com
  `relateException`, `getOccurrenceDetails`, suporte a `RANGE=THISANDFUTURE`), `RecurExpansion` (RRULE completo,
  RDATE, EXDATE), `Timezone` a partir do `VTIMEZONE` do arquivo e `TimezoneService` para registrar fusos.
- O que **não** entrega, e teríamos de escrever de qualquer jeito:
  - **Fuso pelo IANA** (§4): converte pelo `VTIMEZONE` do arquivo; TZID ausente vira hora da máquina.
  - **Agrupar exceções**: é o chamador que separa os VEVENT por `UID` e chama `relateException`; exceção sem mestre
    fica por nossa conta.
  - **Cancelados**: `getOccurrenceDetails` devolve a exceção mesmo com `STATUS:CANCELLED`; filtrar é nosso.
  - **Janela**: `event.iterator()` começa no `DTSTART` (o parâmetro `startTime` só troca o ponto de partida, sem
    sincronizar com a regra); exceções movidas para dentro da janela a partir de fora precisam de um passe separado.
  - **Dia inteiro**: `Time` com `isDate`; `toJSDate()` dá meia-noite no fuso da máquina (outra armadilha no Docker).
  - Texto HTML da descrição, link de reunião, privacidade, limites de tamanho.
- Custo de memória: o jCal é um array por propriedade; para 24,5 MB fica várias vezes o tamanho do arquivo (não medi:
  rodar o pacote exigiria instalá-lo; ver §8).

### 5.2 Leitor próprio (estimativa)

| Parte | Linhas | Conteúdo |
|---|---|---|
| Leitura | ~90 | desdobrar em bytes, quebrar linhas, nome/parâmetros (com aspas)/valor, TEXT, componentes aninhados |
| Datas e fuso | ~90 | DATE, DATE-TIME (3 formas), DURATION simples, local + TZID → instante pelo `Intl` (§4), reserva pelo `VTIMEZONE` de desvio fixo |
| Repetição | ~170 | subconjunto do §5.3, expansão só até o fim da janela, salto aritmético para DAILY/WEEKLY sem COUNT, teto de ocorrências |
| Montagem | ~120 | agrupar por UID, EXDATE, exceções (movidas, canceladas, órfãs, SEQUENCE), privados, HTML → texto, link de reunião |

Medido: desdobrar e varrer as 268.854 linhas do feed de 24,5 MB levou 132 ms no Node 24 (heap 120 MB). Ler o feed da
agência não é gargalo; o gargalo é a rede (§2.4).

### 5.3 Subconjunto de RRULE (o que o Google gera pela tela)

A tela "Personalizar" do Google produz: `FREQ` = DAILY/WEEKLY/MONTHLY/YEARLY; `INTERVAL`; fim por `UNTIL` ou `COUNT`;
WEEKLY com `BYDAY` (lista, inclusive "dias úteis" = `MO,TU,WE,TH,FR`); MONTHLY por dia do mês (`BYMONTHDAY`, ou só o
`DTSTART`) ou por ordinal (`BYDAY=1MO` … `4FR`, `-1WE`); YEARLY pelo `DTSTART` (ou `BYMONTH`+`BYMONTHDAY`); `WKST`.
Medido no feed: só WEEKLY e MONTHLY, com essas partes. **Fora do subconjunto** (`BYSETPOS`, `BYYEARDAY`, `BYWEEKNO`,
`BYHOUR`/`BYMINUTE`/`BYSECOND`, `FREQ` abaixo de DAILY, várias RRULE): mostrar só a 1ª ocorrência se cair na janela e
contar um aviso no estado da agenda ("1 evento com repetição que o Pauta não entende"). Só aparece com convites
importados de fora; o diagnóstico do §8 diz se existe na agenda da Melt.

### 5.4 Comparação

| Critério | ical.js 2.2.1 | Leitor próprio |
|---|---|---|
| Regra 5 do PLANO (sem dependências) | precisa de justificativa (o `FASE2.md` permite) | cumpre |
| Fuso correto (IANA, histórico) | não; precisa de cola nossa por cima | sim, pelo `Intl` |
| Exceções, cancelados, janela, órfãs | cola nossa | nosso |
| RRULE raros | completo e testado há anos | subconjunto; resto vira aviso |
| Risco | baixo no RRULE, alto no fuso se usado direto | médio no RRULE (WKST, ordinais, fim de mês, COUNT): coberto pelos testes do §7, com vetores da própria RFC |
| Tamanho | 268 KB + tipos | ~500 linhas nossas |
| Manutenção | versão parada há 14 meses; API grande | código pequeno, nosso, no padrão do projeto |

**Descartados:** `node-ical` 0.27.3 (puxa `rrule-temporal` e `temporal-polyfill`); `rrule` 2.8.1 (só RRULE, puxa
`tslib`, e ainda faltaria o resto).

## 6. Desenho sugerido

Não é decisão de esquema; é o caminho que os testes do §7 pressupõem.

### 6.1 Fluxo de uma busca

```
buscar (fetch trocável nos testes, como definirBuscaDrive) -> conferir status 200, text/calendar, BEGIN:VCALENDAR,
teto de bytes -> hash sem DTSTAMP igual ao anterior? parar (sem escrita, sem SSE) -> desdobrar -> componentes ->
VEVENT por UID -> para cada série: expandir até o fim da janela, tirar EXDATE, trocar pelas exceções, tirar canceladas
-> exceções movidas para dentro da janela -> avulsos -> converter fuso -> filtrar janela -> privados -> gravar tudo
da agenda numa transação (substitui as ocorrências) -> evento de tempo real
```

- **Janela:** de `hojeSP − 30` a `hojeSP + 180`, datas locais inclusive; uma ocorrência entra se o intervalo
  [início, fim) cruza [de 00:00, ate+1 00:00) em São Paulo (dia inteiro: as datas se cruzam).
- **Chave estável da ocorrência:** `UID` + `RECURRENCE-ID` em UTC (ou o início original da ocorrência), para o front
  não piscar entre buscas.
- **Tetos:** 32 MB descomprimidos, 60 s, 1.000 ocorrências por série na janela, 20.000 por agenda. Passou do teto:
  falha a busca, mantém a anterior e mostra o erro.
- **Estado por agenda:** última busca, última busca boa, erro legível, contagens (eventos, ocorrências, repetições não
  entendidas, fusos desconhecidos). Contagens sim, conteúdo nunca nos logs.
- **Guardar por ocorrência:** agenda, chave, título, início/fim (instante UTC) ou data início/fim (dia inteiro), local,
  link da reunião, descrição em texto (≤ 2 KB), `tentativo`, `livre` (TRANSP), `privado`. Sem convidados.

### 6.2 Segredo

- `cifrar(url, 'agenda_ical')` de `server/src/servicos/cripto.ts` (finalidade própria = chave HKDF própria).
- Nunca devolver ao navegador: a API mostra só nome, cor, `calendar.google.com/…/basic.ics` e o estado.
- Nunca no log nem na mensagem de erro (cuidado com `error.message` e `cause` do `fetch`, e com o log de exceções).
- "Atualizar agora" e trocar o endereço: só admin; trocar o endereço exige colar de novo (nada de "editar" o antigo).

### 6.3 HTTP

`fetch(url, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(60_000), headers: { Accept:
'text/calendar' } })`, lendo o corpo em fluxo com teto. `404` → "endereço inválido ou redefinido"; `429`/`5xx` → tentar
na próxima rodada (não insistir na mesma); corpo que não começa com `BEGIN:VCALENDAR` (página de login, HTML) → erro.

### 6.4 Texto

- `SUMMARY` vazio → "(sem título)". `CLASS:PRIVATE`/`CONFIDENTIAL` → título "Ocupado", sem local, descrição e link.
- Descrição: HTML → texto (`<br>`/`</p>`/`</div>` viram quebra; `<a href="https://x">t</a>` vira `t (https://x)` quando
  `t` ≠ link; remover `<script>`/`<style>` com o conteúdo; demais tags somem; entidades decodificadas). Exibir só pelo
  caminho de texto puro do design system, nunca como HTML ou Markdown.
- Links: só `https:`; reunião = `X-GOOGLE-CONFERENCE`, senão o primeiro `https://meet.google.com/…`,
  `https://*.zoom.us/…` ou `https://teams.microsoft.com/…` em LOCATION ou DESCRIPTION.

### 6.5 Arquivos (sugestão, com o prefixo da funcionalidade)

`server/src/servicos/agenda-ical-leitura.ts`, `agenda-ical-fuso.ts`, `agenda-ical-repeticao.ts`, `agenda-ical.ts`
(montagem), `server/src/tarefas/agenda-*.ts` (busca a cada 15 min), `server/test/agenda-ical*.test.ts` e as fixtures
copiadas para `server/test/fixtures/agenda/`, **com um `.gitattributes` `*.ics -text`** na pasta: a raiz do repositório
tem `* text=auto eol=lf`, que trocaria o CRLF e estragaria o teste da dobra (G1). Esta pasta já tem o seu.

## 7. Casos de teste

Fixtures sintéticas no formato do Google em `docs/fase2/fixtures-ical/` (CRLF, dobra em 75 octetos, `VTIMEZONE` como
o Google projeta). Cada caso é um `UID` com o prefixo do id abaixo.

- `google-2026.ics`: relógio `2026-10-19T13:00:00Z` (seg, 10:00 em SP); janela **2026-09-19 a 2027-04-17**.
- `google-2018.ics`: relógio `2018-11-01T12:00:00Z`; janela **2018-10-02 a 2019-04-30**. O `VTIMEZONE` dele diz −03:00
  fixo de propósito: os resultados abaixo só batem se o fuso vier do `Intl`.

Horas em São Paulo, salvo indicação. **Obrigatórios** (os pedidos no `FASE2.md`) marcados com ●.

### A. Leitura

| Id | Caso | Esperado |
|---|---|---|
| G1 ● | dobra no meio do "ã" (octeto 75) | título termina em "Reunião", sem U+FFFD (decodificar linha a linha dá U+FFFD: o teste prova que o desdobramento é em bytes) |
| G2 | o mesmo arquivo com LF em vez de CRLF, e com BOM | mesmo resultado |
| G3 | B1: `LOCATION:Sala 2\, 3º andar\; fundos` | "Sala 2, 3º andar; fundos" |
| H9 | `VTODO` e `VALARM` dentro do VEVENT (G7) | ignorados |
| H10 | linha sem `:`, componente desconhecido, `END` sem `BEGIN` | ignorados, sem exceção; contagem de avisos |

### B. Fuso de São Paulo e outros

| Id | Caso | Esperado |
|---|---|---|
| B1 ● | avulso em UTC (como o Google grava) `20261020T130000Z` | 20/10 10:00–11:00 |
| B2 ● | `TZID=America/Sao_Paulo:20261021T150000` | 18:00Z–19:00Z (15:00–16:00) |
| B3 ● | série em `America/New_York` seg 09:00, `COUNT=4` desde 12/10 | 12/10, 19/10, 26/10 às 10:00; **02/11 às 11:00** (fim do horário de verão dos EUA em 01/11) |
| B4 | TZID que o `Intl` não conhece (`E. South America Standard Time`) com `VTIMEZONE` −03:00 | 22/10 10:00 (desvio do arquivo); sem `VTIMEZONE`: São Paulo + 1 aviso |
| B5 | hora flutuante `20261022T140000` | 14:00 (fuso de `X-WR-TIMEZONE`) |
| B6 | o servidor com `TZ=UTC` e com `TZ=Asia/Tokyo` | mesmos resultados (nada usa métodos de `Date` locais) |

### C. Dia inteiro

| Id | Caso | Esperado |
|---|---|---|
| C1 ● | `VALUE=DATE` 20261102 → 20261103 | só 02/11; data, não instante |
| C2 ● | 20261110 → 20261113 | 10, 11 e 12/11 (`DTEND` exclusivo) |
| C3 | sem `DTEND` | 15/11, um dia |
| C4 ● | semanal de dia inteiro, `UNTIL=20261026` (data) | 05, 12, 19 e 26/10 (`UNTIL` inclusivo) |
| D10 | anual de dia inteiro desde 2020-03-15 | 15/03/2027 (única na janela) |

### D. Recorrência

| Id | Caso | Esperado |
|---|---|---|
| D1 ● | **semanal com exceção**: seg 10:00 desde 07/09, `EXDATE` 12/10 (TZID) | 29 ocorrências, de 21/09 a 12/04/2027, sem 12/10; todas 13:00Z |
| D2 ● | `EXDATE` em UTC (`20261013T130000Z`) num mestre com TZID; `UNTIL=20261028T025959Z` | 22/09, 29/09, 06/10, 20/10, 27/10 (sem 13/10) |
| D3 | `COUNT=4` começando antes da janela | 21/09 e 28/09 (07 e 14/09 contam, mas ficam fora) |
| D4 | `COUNT=4` + `EXDATE` na 2ª | 06, 20 e 27/10 (a excluída conta para o COUNT) |
| D5 | `UNTIL=20261022T120000Z` = exatamente a última ocorrência | 01, 08, 15 e **22/10** |
| D6 | RFC §3.8.5.3 (WKST) trazido para 2026: `INTERVAL=2;COUNT=4;BYDAY=TU,SU`, 09:00 em Nova York desde 06/10 | `WKST=MO`: 06/10, 11/10, 20/10, 25/10; `WKST=SU`: 06/10, 18/10, 20/10, **01/11 (11:00 em SP)** |
| D7 | mensal na última quarta (`BYDAY=-1WE`) | 30/09, 28/10, 25/11, 30/12, 27/01, 24/02, 31/03 |
| D8 | mensal no dia 31 | 31/10, 31/12, 31/01, 31/03 (sem setembro, novembro e fevereiro) |
| D9 | dias úteis (`BYDAY=MO,TU,WE,TH,FR;COUNT=5`) | 19 a 23/10, 08:30 |
| D11 | diária `INTERVAL=3` desde 01/01/2015 | 70 ocorrências: 21/09, 24/09, …, 16/04/2027, 07:00; mede o tempo (deve ser ms) |
| D12 | `BYSETPOS=-1` (fora do subconjunto) | só 30/10 17:00 + 1 aviso "repetição não entendida" |
| D13 | avulso sem `DTEND` | 23/10 12:00, fim = início |
| D14 | série sem fim começando em 2017 com teto de ocorrências | não passa do teto; aviso se cortar |

### E. Exceções: movido, cancelado e companhia

Série `e-serie`: quartas 14:00 desde 02/09, com 6 exceções no mesmo `UID`. **Esperado no total: 29 ocorrências.**

| Id | Caso | Esperado |
|---|---|---|
| E1 ● | **movido** no mesmo dia (`RECURRENCE-ID` 28/10 14:00 → 17:00) | 28/10 só às 17:00, com o título da exceção e sem o link do mestre (a exceção vale por inteiro) |
| E2 ● | **movido** para outro dia (04/11 → qui 05/11 09:00) | nada em 04/11; 05/11 09:00 |
| E3 | movido **de fora para dentro** (16/09 → ter 22/09) | 22/09 14:00 aparece |
| E4 | movido **de dentro para fora** (23/09 → 11/09) | nada em 23/09 nem em 11/09 |
| E5 | `RECURRENCE-ID` em UTC (`20261111T170000Z`) com mestre em TZID | casa com 11/11 14:00; vira 15:00 |
| E6 ● | **exceção cancelada** (`STATUS:CANCELLED`, 18/11) | nada em 18/11 |
| E7 | exceção sem mestre no arquivo | avulso em 01/12 11:00–12:00 |
| E8 | "esta e as seguintes": mestre com `UNTIL` 18/10 23:59:59 + `UID` `…_R20261019T120000` | 09:00 em 21/09, 28/09, 05/10, 12/10; 11:00 de 19/10 a 12/04/2027 (26); nada às 09:00 em 19/10 |
| E9 | mesmo `UID` duas vezes, `SEQUENCE` 0 e 2 | só a de `SEQUENCE` 2 (22/10 16:00) |
| E10 ● | avulso **cancelado** | não aparece |
| E11 | mestre de série cancelado | nenhuma ocorrência |
| E12 | `EXDATE` com lista (`…T180000,…T180000`) | 05, 07 e 09/10 |

### F. Horário de verão histórico (`google-2018.ics`)

| Id | Caso | Esperado |
|---|---|---|
| F1 ● | 05/11/2018 10:00 (TZID SP) | `2018-11-05T12:00:00Z` (−02:00). Com o `VTIMEZONE` do arquivo seria 13:00Z: o teste prova o `Intl` |
| F2 ● | semanal seg 10:00 desde 29/10/2018, `COUNT=3` | 29/10 13:00Z; 05/11 12:00Z; 12/11 12:00Z (o relógio de parede fica em 10:00) |
| F3 ● | 04/11/2018 00:30 → 02:00 (hora que não existiu) | início `03:30Z` (01:30), fim `04:00Z` |
| F4 ● | 16/02/2019 23:30 → 17/02 00:30 (23:30 aconteceu duas vezes) | início `2019-02-17T01:30Z` (a primeira), fim `03:30Z` (dura 2 h de verdade) |
| F5 | semanal sáb 23:30 desde 09/02/2019, `COUNT=3`, 29 min | 10/02 01:30Z; 17/02 01:30Z; 24/02 02:30Z; cada uma com 29 min |
| F6 ● | dia inteiro em 04/11/2018 (o dia começou à 01:00) | data 2018-11-04, um dia (não escorrega para 03/11) |

### G. Texto, links e privacidade

| Id | Caso | Esperado |
|---|---|---|
| G4 | descrição HTML com `<b>`, `<a href="https://…">`, `&amp;`, `<script>` e `<a href="javascript:…">` | texto sem `<`, sem "alert", sem "javascript:"; contém "campanha", "briefing (https://docs.google.com/document/d/abc)" e "&"; link de reunião = `https://meet.google.com/xyz-abcd-efg` (achado na descrição) |
| G5 | `LOCATION:https://zoom.us/j/123456789` | link de reunião = esse |
| G6 | mestre da série E com `X-GOOGLE-CONFERENCE` | link de reunião das ocorrências normais = `https://meet.google.com/abc-defg-hij` |
| G7 | `ORGANIZER`/`ATTENDEE` com e-mails | nada de nome ou e-mail no que é gravado |
| G8 | `CLASS:PRIVATE` | "Ocupado" em 30/10 14:00–15:00, sem local, descrição e link |
| G9 | `TRANSP:TRANSPARENT` (C1, C2, D10) | marcado como livre |
| G10 | sem `SUMMARY` | "(sem título)" |

### H. Busca e robustez (busca trocável, sem rede)

| Id | Caso | Esperado |
|---|---|---|
| H1 | `404 text/html` | erro "endereço inválido ou redefinido"; ocorrências anteriores mantidas |
| H2 | `200` com HTML (página de login) | erro; anteriores mantidas |
| H3 | corpo acima do teto (em fluxo, sem ler tudo) | erro; anteriores mantidas |
| H4 | tempo esgotado / `5xx` / `429` | erro; anteriores mantidas; nova tentativa só na próxima rodada |
| H5 | mesmo feed com outro `DTSTAMP` | nada regravado e nenhum evento de tempo real |
| H6 | URL fora de `calendar.google.com`, `http:`, outro caminho; `webcal://` válido | recusadas com 400; `webcal` normalizado |
| H7 | o endereço nunca aparece em resposta da API, log ou mensagem de erro | conferir capturando o log no teste |
| H8 | ocorrência que começa antes da janela e termina dentro | entra |
| H11 | evento que atravessa a meia-noite (22:00 → 01:00) | um item, início num dia e fim no outro |

## 8. A conferir com o endereço real

Fazer **uma vez**, com o endereço da Melt, um diagnóstico que imprime só contagens (nunca conteúdo), como o usado nas
medições deste documento:

1. O `VTIMEZONE` de `America/Sao_Paulo` é mesmo um `STANDARD` −03:00 desde 1970?
2. Quais partes de `RRULE` aparecem (há `DAILY`, `YEARLY`, `BYMONTHDAY`, `BYSETPOS`)? Quantas séries ficariam com aviso?
3. Há `STATUS:CANCELLED`, `CLASS:PRIVATE`, `VALARM`, `RDATE`, `RANGE=THISANDFUTURE`, TZID fora do IANA, hora flutuante?
4. Evento privado aparece com detalhes no endereço secreto? (Se sim, a regra "Ocupado" do §6.4 é obrigatória: a
   agenda do Pauta é vista por toda a equipe.)
5. Tamanho, número de VEVENT, tempo até o 1º byte.
6. Atraso entre editar um evento no Google e a mudança aparecer no feed.
7. Na conta Workspace da Melt: o campo do endereço secreto aparece para quem? Qual nível de compartilhamento externo o
   admin precisa liberar?
8. Opcional, se o item 2 apontar regras fora do subconjunto: medir o ical.js 2.2.1 (memória e tempo) no feed real antes
   de adotar o plano B (§1.6).

## Fontes

- Google Agenda, ajuda: "Ver sua agenda do Google em outros aplicativos de agenda" —
  <https://support.google.com/calendar/answer/37648?hl=pt-BR> (passos, "Redefinir", aviso de não compartilhar, admin
  pode esconder o campo).
- Google Workspace Admin, opções de compartilhamento da agenda —
  <https://knowledge.workspace.google.com/admin/calendar/set-google-calendar-sharing-options?hl=en>.
- Exemplo público do formato `private-<token>/basic.ics` (base de conhecimento da Bay Path University) —
  <https://kb.baypath.edu/tech-support/finding-your-private-calendar-link-in-google-calen>.
- Google Calendar API, eventos recorrentes (instância cancelada, `originalStartTime`) —
  <https://developers.google.com/workspace/calendar/api/guides/recurringevents?hl=en>; Nylas, "How Google Calendar
  recurring events work" — <https://developer.nylas.com/docs/cookbook/calendar/google-calendar-recurring-events/>.
- RFC 5545 (iCalendar) — <https://www.rfc-editor.org/rfc/rfc5545> (§3.1, §3.2.13, §3.2.19, §3.3.5, §3.3.10, §3.3.11,
  §3.6.1, §3.6.5, §3.8.1.5, §3.8.1.7, §3.8.1.11, §3.8.2.2, §3.8.2.4, §3.8.2.5, §3.8.4.1, §3.8.4.4, §3.8.4.7, §3.8.5.1–3,
  §3.8.7.4; exemplos de WKST e de 30/02 no §3.8.5.3). RFC 7986 (`CONFERENCE`) — <https://www.rfc-editor.org/rfc/rfc7986>.
- ical.js: metadados no npm — <https://registry.npmjs.org/ical.js> (datas das versões, `dependencies` vazio, MPL-2.0,
  `exports`); arquivos e tamanhos — <https://data.jsdelivr.com/v1/packages/npm/ical.js@2.2.1>; código lido:
  <https://cdn.jsdelivr.net/npm/ical.js@2.2.1/lib/ical/event.js>, `time.js` (resolução de TZID e queda em
  `localTimezone`), `component.js` (`getTimeZoneByID`), `recur_expansion.js`; repositório — <https://github.com/kewisch/ical.js>.
- `node-ical` e `rrule` (dependências) — <https://registry.npmjs.org/node-ical/latest>, <https://registry.npmjs.org/rrule/latest>.
- Feeds medidos em 19/10/2026 (públicos, gerados pelo Google): Feriados no Brasil —
  `https://calendar.google.com/calendar/ical/pt-br.brazilian%23holiday%40group.v.calendar.google.com/public/basic.ics`;
  comunidade Kubernetes — `https://calendar.google.com/calendar/ical/calendar%40kubernetes.io/public/basic.ics`.
  Contagens feitas com um script local que só soma propriedades; nenhum conteúdo foi guardado neste repositório.
- Node 24.20.0: `fetch` manda `accept-encoding: gzip, deflate` (medido com um servidor local); `process.versions.tz` =
  `2026c`; vetores de horário de verão calculados com `Intl.DateTimeFormat`.
