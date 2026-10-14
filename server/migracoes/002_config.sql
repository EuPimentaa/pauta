-- 002_config.sql: seed de CONFIGURAÇÃO (ADAPTACOES: nenhum quadro, pessoa, cliente ou demanda).
-- Ids estáveis e legíveis (prefixos eq-, mq-, mqc-, md-, mdi-) para seeds, testes e docs.
-- Os quadros nascem nos Primeiros passos do admin (modelo sugerido por equipe) ou em "Novo quadro".

-- ───────────── configuração da aplicação (valores em JSON) ─────────────
INSERT INTO configuracao (chave, valor) VALUES
  ('demanda.numero_inicial',        '1'),        -- o primeiro número será este (o importador pode subir)
  ('prazo.hora_padrao',             '"18:00"'),  -- prazo sem hora
  ('parado.limite_dias_uteis',      '2'),        -- "parado há" em destaque acima disto
  ('cliente.parado_dias_uteis',     '2'),        -- Início: "Com o cliente há mais de N dias úteis"
  ('retorno.prazo_dias_uteis',      '2'),        -- prazo de retorno padrão do cliente no envio
  ('ajuste.prazo_dias_uteis',       '1'),        -- prazo padrão da rodada de ajuste
  ('link_publico.validade_dias',    '30'),
  ('link_publico.arquivo_minutos',  '10'),       -- URL assinada de arquivo na página pública
  ('convite.validade_dias',         '7'),
  ('redefinicao.validade_horas',    '1'),
  ('sessao.validade_dias',          '30'),
  ('evento.retencao_dias',          '7'),
  ('upload.limite_bytes',           '10485760'),
  ('arquivo.lixo_dias',             '30'),
  ('backup.manter',                 '14'),
  ('quadro.concluidas_dias',        '7'),        -- concluídas saem do quadro depois de N dias (ficam no Arquivo)
  ('cronometro.limite_horas',       '10'),       -- ao parar, mais que isto vira o limite + aviso para conferir
  ('passos.modelos_revisados_em',   'null');     -- Primeiros passos: botão "Revisei os modelos" grava o instante

-- ───────────── modelos de quadro ("Novo quadro") ─────────────
INSERT INTO modelo_quadro (id, nome, descricao, pos) VALUES
  ('mq-kanban',     'Kanban simples', 'A fazer, Fazendo, Revisão, Com o cliente e Concluído. Serve para quase toda equipe.', 1024),
  ('mq-por-pessoa', 'Por pessoa',     'A Fila de entrada e uma coluna por pessoa da equipe, como no Trello de hoje.',      2048),
  ('mq-semana',     'Semana',         'Uma coluna por dia útil e Concluído. Bom para a pauta da semana.',                  3072),
  ('mq-branco',     'Em branco',      'Sem colunas. Você cria as suas.',                                                   4096);

-- cor nula = coluna sem cor. por_membro = 1 vira uma coluna por membro ativo da equipe do quadro.
INSERT INTO modelo_quadro_coluna (id, modelo_id, nome, cor, papel, por_membro, pos) VALUES
  ('mqc-kanban-a-fazer',  'mq-kanban',     'A fazer',       'grafite', 'normal',             0, 1024),
  ('mqc-kanban-fazendo',  'mq-kanban',     'Fazendo',       'azul',    'normal',             0, 2048),
  ('mqc-kanban-revisao',  'mq-kanban',     'Revisão',       'roxo',    'normal',             0, 3072),
  ('mqc-kanban-cliente',  'mq-kanban',     'Com o cliente', 'amarelo', 'aguardando_cliente', 0, 4096),
  ('mqc-kanban-concluido','mq-kanban',     'Concluído',     'verde',   'concluida',          0, 5120),
  ('mqc-pessoa-fila',     'mq-por-pessoa', 'Fila',          'grafite', 'normal',             0, 1024),
  ('mqc-pessoa-membros',  'mq-por-pessoa', 'Uma por pessoa', NULL,     'normal',             1, 2048),
  ('mqc-semana-seg',      'mq-semana',     'Segunda',       NULL,      'normal',             0, 1024),
  ('mqc-semana-ter',      'mq-semana',     'Terça',         NULL,      'normal',             0, 2048),
  ('mqc-semana-qua',      'mq-semana',     'Quarta',        NULL,      'normal',             0, 3072),
  ('mqc-semana-qui',      'mq-semana',     'Quinta',        NULL,      'normal',             0, 4096),
  ('mqc-semana-sex',      'mq-semana',     'Sexta',         NULL,      'normal',             0, 5120),
  ('mqc-semana-concluido','mq-semana',     'Concluído',     'verde',   'concluida',          0, 6144);

-- automações sugeridas: nascem com o quadro se a coluna de destino não for desmarcada no "Novo quadro".
-- Kanban simples: "Enviar ao cliente" leva a Com o cliente; o ajuste pedido volta para Fazendo. Aprovar não move
-- (aprovado não é concluído: cada equipe decide, ex.: a Criação manda ao Social).
INSERT INTO modelo_quadro_automacao (modelo_id, gatilho, destino_coluna_id) VALUES
  ('mq-kanban', 'enviado_ao_cliente', 'mqc-kanban-cliente'),
  ('mq-kanban', 'ajuste_pedido',      'mqc-kanban-fazendo');

-- ───────────── equipes (sem pessoas; o modelo é só a sugestão dos Primeiros passos) ─────────────
INSERT INTO equipe (id, nome, slug, cor, modelo_quadro_id, pos) VALUES
  ('eq-atendimento', 'Atendimento', 'atendimento', 'ambar',    'mq-kanban',     1024),
  ('eq-criacao',     'Criação',     'criacao',     'rosa',     'mq-por-pessoa', 2048),
  ('eq-social',      'Social',      'social',      'roxo',     'mq-por-pessoa', 3072),
  ('eq-web',         'Web',         'web',         'azul',     'mq-kanban',     4096),
  ('eq-trafego',     'Tráfego',     'trafego',     'verde',    'mq-kanban',     5120),
  ('eq-producao',    'Produção',    'producao',    'turquesa', 'mq-kanban',     6144);

-- ───────────── modelos de demanda globais (aparecem em todos os quadros) ─────────────
-- briefing_md vira a descrição da demanda; prazo em dias úteis a partir da criação; rodadas nulas = as do cliente.
INSERT INTO modelo_demanda (id, quadro_id, nome, descricao, icone, briefing_md, prazo_dias_uteis, prioridade, estimativa_min,
                            rodadas_inclusas, pos) VALUES
  ('md-post', NULL, 'Post', 'Arte única para o feed ou para os stories.', 'image',
'## Objetivo
O que o post precisa comunicar e para quem.

## Rede e formato
- Rede: Instagram, Facebook, LinkedIn ou TikTok
- Formato: Feed 4:5 (1080×1350), Feed 1:1 (1080×1080) ou Stories 9:16 (1080×1920)

## Texto da arte
Só o texto que vai na imagem. A legenda fica com o Social.

## Referências
Links do Drive, posts de que o cliente gostou, fotos e materiais da marca.

## Publicação
Data e horário previstos, se já houver.', 2, NULL, 60, NULL, 1024),

  ('md-carrossel', NULL, 'Carrossel', 'Várias lâminas com roteiro.', 'gallery-horizontal',
'## Objetivo
O que o carrossel precisa ensinar ou convencer.

## Lâminas
Quantidade de lâminas, contando capa e fechamento.

## Roteiro
Uma linha por lâmina, na ordem. Sem roteiro, a Criação devolve.

## Rede e formato
- Rede: Instagram, LinkedIn ou Facebook
- Formato: 4:5 (1080×1350) ou 1:1 (1080×1080)

## Referências
Links do Drive e carrosséis de referência.', 3, NULL, 120, NULL, 2048),

  ('md-reels', NULL, 'Reels', 'Vídeo curto vertical.', 'clapperboard',
'## Objetivo
O que o vídeo precisa provocar em quem assiste.

## Duração
Até 15 s, 30 s, 60 s ou 90 s.

## Material
Vamos gravar, o cliente envia ou banco de imagens. Se for gravar, crie também a demanda da gravação.

## Roteiro
Cenas, falas e textos na tela.

## Trilha e legendas
Música de referência e se precisa de legenda na tela.

## Referências
Reels de referência e a pasta do material.', 3, NULL, 180, NULL, 3072),

  ('md-stories', NULL, 'Stories', 'Sequência de telas 9:16.', 'smartphone',
'## Objetivo
O que a sequência precisa comunicar.

## Sequência
Quantidade de telas e o que vai em cada uma, uma por linha.

## Interação
Enquete, caixa de perguntas, link ou nenhuma.

## Referências
Links do Drive e stories de referência.', 1, NULL, 30, NULL, 4096),

  ('md-video', NULL, 'Vídeo', 'Edição de vídeo institucional, campanha ou evento.', 'video',
'## Objetivo
Onde o vídeo vai passar e o que precisa provocar.

## Duração e formato
Duração aproximada e proporção: horizontal 16:9, vertical 9:16 ou quadrado 1:1.

## Material bruto
Link da pasta do Drive com o material gravado.

## Roteiro
Cenas, falas, letterings e a chamada final.

## Trilha e locução
Música de referência e se tem locução.

## Referências
Vídeos de referência.', 5, NULL, 480, NULL, 5120),

  ('md-site', NULL, 'Site ou landing page', 'Site novo, landing page, e-commerce ou protótipo.', 'globe',
'## Objetivo
Para que serve o site e qual ação o visitante deve tomar.

## Escopo
Landing page, site institucional, e-commerce ou protótipo no Figma.
Prazos de referência: Figma da home 5 dias úteis, landing page 10, institucional 15, e-commerce 45.

## Páginas e seções
Uma por linha.

## Conteúdo
Textos, fotos e onde estão (pasta do Drive).

## Domínio e hospedagem
Endereço e onde fica hospedado. Senhas nunca aqui: use o link Acessos do cliente (cofre).

## Referências
Sites de referência.', 10, NULL, 2400, 3, 6144),

  ('md-ajuste-site', NULL, 'Ajuste de site', 'Mudança pontual num site que já existe.', 'wrench',
'## Página
Endereço exato da página que vai mudar.

## O que muda
Um ajuste por linha.

## Complexidade
Simples (troca de texto ou imagem, até 3 dias úteis) ou complexo (nova seção ou integração, 7 a 15 dias úteis).

## Acessos
Use o link Acessos do cliente (cofre). Nunca escreva senha aqui.', 3, NULL, 120, NULL, 7168),

  ('md-relatorio', NULL, 'Relatório', 'Relatório mensal de redes ou de anúncios.', 'chart-column',
'## Período
Ex.: setembro de 2026.

## Redes e canais
Instagram, Facebook, LinkedIn, TikTok, YouTube, Google Meu Negócio ou anúncios.

## Indicadores
Os de sempre (alcance, engajamento, seguidores, cliques) e os que o cliente pediu fora do padrão.

## O que o cliente quer acompanhar
Metas e perguntas do mês.

## O que aconteceu no mês
Ações que explicam os números: campanha, evento, post que foi muito bem.', 3, NULL, 120, NULL, 8192),

  ('md-anuncio', NULL, 'Campanha de anúncio', 'Campanha paga no Meta, Google, TikTok ou LinkedIn.', 'megaphone',
'## Objetivo
Tráfego, engajamento, mensagens, conversões ou reconhecimento.

## Plataformas
Meta, Google, TikTok ou LinkedIn.

## Público
Região, idade, interesses e públicos personalizados.

## Verba e período
Ex.: R$ 1.500 de 20/10 a 31/10.

## Criativos
Formatos: Feed 1:1, Feed 4:5, Stories e Reels 9:16. Cada formato vira um arquivo.

## Textos e chamada
Texto principal, título e botão (Saiba mais, Fale conosco, Comprar).

## Destino
Link, WhatsApp ou formulário.', 3, NULL, 180, NULL, 9216),

  ('md-grafico', NULL, 'Material gráfico', 'Peça para impressão: banner, folder, cartão, adesivo.', 'printer',
'## Peça
O que é: banner, folder, cartão, adesivo, placa, uniforme.

## Medida
Largura × altura em cm, com sangria.

## Material e acabamento
Ex.: lona fosca, adesivo vinil, couché 300 g com laminação.

## Quantidade
Quantas unidades, se já souber.

## Texto
Todo o texto da peça.

## Entrega
Data e endereço de entrega, se a agência cuida da produção.', 3, NULL, 120, NULL, 10240),

  ('md-outro', NULL, 'Outro', 'Qualquer pedido que não se encaixa nos outros.', 'file-text',
'## O que precisa ser feito

## Para quando e por quê

## Referências', NULL, NULL, NULL, NULL, 65536);

INSERT INTO modelo_demanda_item (id, modelo_id, checklist, texto, pos) VALUES
  ('mdi-post-1',       'md-post',        'Checklist', 'Conferir a marca e as cores do cliente',                 1024),
  ('mdi-post-2',       'md-post',        'Checklist', 'Revisar o texto da arte',                                2048),
  ('mdi-post-3',       'md-post',        'Checklist', 'Exportar no formato da rede',                            3072),
  ('mdi-post-4',       'md-post',        'Checklist', 'Salvar na pasta SAÍDA do cliente',                       4096),
  ('mdi-carrossel-1',  'md-carrossel',   'Checklist', 'Conferir a ordem das lâminas com o roteiro',             1024),
  ('mdi-carrossel-2',  'md-carrossel',   'Checklist', 'Revisar os textos de todas as lâminas',                  2048),
  ('mdi-carrossel-3',  'md-carrossel',   'Checklist', 'Capa convida a arrastar',                                3072),
  ('mdi-carrossel-4',  'md-carrossel',   'Checklist', 'Exportar as lâminas numeradas',                          4096),
  ('mdi-carrossel-5',  'md-carrossel',   'Checklist', 'Salvar na pasta SAÍDA do cliente',                       5120),
  ('mdi-reels-1',      'md-reels',       'Checklist', 'Conferir a duração',                                     1024),
  ('mdi-reels-2',      'md-reels',       'Checklist', 'Revisar as legendas',                                    2048),
  ('mdi-reels-3',      'md-reels',       'Checklist', 'Trilha com licença de uso',                              3072),
  ('mdi-reels-4',      'md-reels',       'Checklist', 'Capa do Reels',                                          4096),
  ('mdi-reels-5',      'md-reels',       'Checklist', 'Exportar em 9:16 (1080×1920)',                           5120),
  ('mdi-reels-6',      'md-reels',       'Checklist', 'Salvar na pasta SAÍDA do cliente',                       6144),
  ('mdi-stories-1',    'md-stories',     'Checklist', 'Respeitar a área segura do topo e do rodapé',            1024),
  ('mdi-stories-2',    'md-stories',     'Checklist', 'Revisar os textos',                                      2048),
  ('mdi-stories-3',    'md-stories',     'Checklist', 'Exportar em 9:16 (1080×1920)',                           3072),
  ('mdi-video-1',      'md-video',       'Checklist', 'Conferir o material bruto',                              1024),
  ('mdi-video-2',      'md-video',       'Checklist', 'Primeiro corte',                                         2048),
  ('mdi-video-3',      'md-video',       'Checklist', 'Cor e áudio',                                            3072),
  ('mdi-video-4',      'md-video',       'Checklist', 'Revisar as legendas',                                    4096),
  ('mdi-video-5',      'md-video',       'Checklist', 'Exportar no formato pedido',                             5120),
  ('mdi-video-6',      'md-video',       'Checklist', 'Salvar na pasta SAÍDA do cliente',                       6144),
  ('mdi-site-1',       'md-site',        'Checklist', 'Briefing aprovado com o cliente',                        1024),
  ('mdi-site-2',       'md-site',        'Checklist', 'Layout no Figma',                                        2048),
  ('mdi-site-3',       'md-site',        'Checklist', 'Desenvolvimento',                                        3072),
  ('mdi-site-4',       'md-site',        'Checklist', 'Testar no celular e no computador',                      4096),
  ('mdi-site-5',       'md-site',        'Checklist', 'Testar formulários e integrações',                       5120),
  ('mdi-site-6',       'md-site',        'Checklist', 'SEO básico: título, descrição e imagem de compartilhamento', 6144),
  ('mdi-site-7',       'md-site',        'Checklist', 'Publicar com SSL',                                       7168),
  ('mdi-ajuste-1',     'md-ajuste-site', 'Checklist', 'Fazer backup antes de mexer',                            1024),
  ('mdi-ajuste-2',     'md-ajuste-site', 'Checklist', 'Aplicar os ajustes',                                     2048),
  ('mdi-ajuste-3',     'md-ajuste-site', 'Checklist', 'Testar no celular e no computador',                      3072),
  ('mdi-ajuste-4',     'md-ajuste-site', 'Checklist', 'Avisar o atendimento com o link da página',              4096),
  ('mdi-relatorio-1',  'md-relatorio',   'Checklist', 'Coletar os números de cada rede',                        1024),
  ('mdi-relatorio-2',  'md-relatorio',   'Checklist', 'Comparar com o mês anterior',                            2048),
  ('mdi-relatorio-3',  'md-relatorio',   'Checklist', 'Escrever destaques e recomendações',                     3072),
  ('mdi-relatorio-4',  'md-relatorio',   'Checklist', 'Revisão do atendimento',                                 4096),
  ('mdi-relatorio-5',  'md-relatorio',   'Checklist', 'Exportar em PDF',                                        5120),
  ('mdi-anuncio-1',    'md-anuncio',     'Checklist', 'Criativos aprovados pelo cliente',                       1024),
  ('mdi-anuncio-2',    'md-anuncio',     'Checklist', 'Conferir pixel e eventos',                               2048),
  ('mdi-anuncio-3',    'md-anuncio',     'Checklist', 'Criar os públicos',                                      3072),
  ('mdi-anuncio-4',    'md-anuncio',     'Checklist', 'Configurar e revisar a campanha',                        4096),
  ('mdi-anuncio-5',    'md-anuncio',     'Checklist', 'Campanha no ar',                                         5120),
  ('mdi-anuncio-6',    'md-anuncio',     'Checklist', 'Primeiro acompanhamento em 48 h',                        6144),
  ('mdi-grafico-1',    'md-grafico',     'Checklist', 'Conferir medida e sangria',                              1024),
  ('mdi-grafico-2',    'md-grafico',     'Checklist', 'Revisar os textos',                                      2048),
  ('mdi-grafico-3',    'md-grafico',     'Checklist', 'Converter as fontes em curvas',                          3072),
  ('mdi-grafico-4',    'md-grafico',     'Checklist', 'Exportar PDF para impressão',                            4096),
  ('mdi-grafico-5',    'md-grafico',     'Checklist', 'Enviar a prova ao cliente',                              5120);

-- ───────────── feriados nacionais 2026 e 2027 ─────────────
-- Todo dia desta tabela é não útil. Os facultativos (Carnaval, Corpus Christi) entram porque a agência costuma
-- parar; o admin remove em Configurações se a casa trabalhar. Municipais: cadastrar.
INSERT INTO feriado (data, nome, tipo) VALUES
  ('2026-01-01', 'Confraternização Universal',                   'nacional'),
  ('2026-02-16', 'Carnaval',                                     'facultativo'),
  ('2026-02-17', 'Carnaval',                                     'facultativo'),
  ('2026-04-03', 'Sexta-feira Santa',                            'nacional'),
  ('2026-04-21', 'Tiradentes',                                   'nacional'),
  ('2026-05-01', 'Dia do Trabalho',                              'nacional'),
  ('2026-06-04', 'Corpus Christi',                               'facultativo'),
  ('2026-09-07', 'Independência do Brasil',                      'nacional'),
  ('2026-10-12', 'Nossa Senhora Aparecida',                      'nacional'),
  ('2026-11-02', 'Finados',                                      'nacional'),
  ('2026-11-15', 'Proclamação da República',                     'nacional'),
  ('2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
  ('2026-12-25', 'Natal',                                        'nacional'),
  ('2027-01-01', 'Confraternização Universal',                   'nacional'),
  ('2027-02-08', 'Carnaval',                                     'facultativo'),
  ('2027-02-09', 'Carnaval',                                     'facultativo'),
  ('2027-03-26', 'Sexta-feira Santa',                            'nacional'),
  ('2027-04-21', 'Tiradentes',                                   'nacional'),
  ('2027-05-01', 'Dia do Trabalho',                              'nacional'),
  ('2027-05-27', 'Corpus Christi',                               'facultativo'),
  ('2027-09-07', 'Independência do Brasil',                      'nacional'),
  ('2027-10-12', 'Nossa Senhora Aparecida',                      'nacional'),
  ('2027-11-02', 'Finados',                                      'nacional'),
  ('2027-11-15', 'Proclamação da República',                     'nacional'),
  ('2027-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
  ('2027-12-25', 'Natal',                                        'nacional');
