-- 002_config.sql: seed de CONFIGURAÇÃO (ADAPTACOES: nada de pessoas, clientes ou demandas).
-- Ids estáveis e legíveis (prefixos fl-, eq-, et-, tp-, tc-, vs-) para seeds, testes e docs.
-- Revisão humana pendente: SLAs e campos dos tipos (o card "S L A" da Criação é imagem; ver docs/PLANO.md, dúvidas).

-- ───────────── configuração da aplicação (valores em JSON) ─────────────
INSERT INTO configuracao (chave, valor) VALUES
  ('demanda.numero_inicial',        '1'),        -- o primeiro número será este (o importador pode subir)
  ('prazo.hora_padrao',             '"18:00"'),  -- prazo sem hora
  ('parado.limite_dias_uteis',      '2'),        -- "parado há" em destaque acima disto
  ('cliente.parado_dias_uteis',     '2'),        -- Início: "Com o cliente há mais de N dias úteis"
  ('link_publico.validade_dias',    '30'),
  ('link_publico.arquivo_minutos',  '10'),       -- URL assinada de arquivo na página pública
  ('convite.validade_dias',         '7'),
  ('redefinicao.validade_horas',    '1'),
  ('sessao.validade_dias',          '30'),
  ('evento.retencao_dias',          '7'),
  ('upload.limite_bytes',           '10485760'),
  ('arquivo.lixo_dias',             '30'),
  ('backup.manter',                 '14'),
  ('quadro.entregue_dias',          '7'),        -- coluna Entregue mostra só os últimos N dias; depois, só no Arquivo
  ('passos.tipos_revisados_em',     'null');     -- Primeiros passos: botão "Revisei os tipos" grava o instante

-- ───────────── fluxo ─────────────
INSERT INTO fluxo (id, nome, padrao) VALUES ('fl-padrao', 'Padrão', 1);

-- ───────────── equipes (sem pessoas: aprovador e distribuidor ficam nulos até o admin definir) ─────────────
INSERT INTO equipe (id, nome, slug, cor, fluxo_id, executora, pos) VALUES
  ('eq-atendimento', 'Atendimento', 'atendimento', 'ambar',     'fl-padrao', 0, 1024),
  ('eq-criacao',     'Criação',     'criacao',     'rosa',      'fl-padrao', 1, 2048),
  ('eq-social',      'Social',      'social',      'roxo',      'fl-padrao', 1, 3072),
  ('eq-web',         'Web',         'web',         'azul',      'fl-padrao', 1, 4096),
  ('eq-trafego',     'Tráfego',     'trafego',     'verde',     'fl-padrao', 1, 5120),
  ('eq-gestao',      'Gestão',      'gestao',      'grafite',   'fl-padrao', 0, 6144);

-- ───────────── etapas (SPEC §2.3). A ordem das colunas segue a SPEC §5.1: Ajustes antes de Revisão. ─────────────
INSERT INTO etapa (id, fluxo_id, nome, categoria, bola, pausa_sla, aplica_se, responsavel_regra, cor, pos) VALUES
  ('et-triagem',  'fl-padrao', 'Triagem',       'triagem',    'agencia', 0, 'sempre',            NULL,                'grafite',  1024),
  ('et-fila',     'fl-padrao', 'Na fila',       'fila',       'agencia', 0, 'sempre',            NULL,                'grafite',  2048),
  ('et-producao', 'fl-padrao', 'Em produção',   'producao',   'agencia', 0, 'sempre',            NULL,                'grafite',  3072),
  ('et-ajuste',   'fl-padrao', 'Ajustes',       'ajuste',     'agencia', 0, 'sempre',            NULL,                'warning',  4096),
  ('et-revisao',  'fl-padrao', 'Revisão',       'revisao',    'agencia', 0, 'sempre',            NULL,                'roxo',     5120),
  ('et-cliente',  'fl-padrao', 'Com o cliente', 'cliente',    'cliente', 1, 'aprovacao_cliente', NULL,                'info',     6144),
  ('et-aprovado', 'fl-padrao', 'Aprovado',      'aprovado',   'agencia', 0, 'aprovacao_cliente', NULL,                'success',  7168),
  ('et-agendar',  'fl-padrao', 'Agendar',       'publicacao', 'agencia', 0, 'publicacao',        'social_do_cliente', 'turquesa', 8192),
  ('et-entregue', 'fl-padrao', 'Entregue',      'concluido',  'agencia', 0, 'sempre',            NULL,                'success',  9216),
  ('et-cancelada','fl-padrao', 'Cancelada',     'cancelado',  'agencia', 0, 'sempre',            NULL,                'danger',  10240);

-- ───────────── transições (SPEC §7.1) ─────────────
-- quem:   admin | atendimento (papel) | responsavel | aprovador (relações com a demanda, incluindo quem cobre) | cliente (link)
-- requer: ver RequisitoTransicao em shared/tipos/config.ts. Admin pode tudo o que a linha permite a qualquer papel interno.
-- Acréscimos à SPEC (marcados com +): fila→revisao (entregar direto da fila), producao→fila (largar),
-- aprovado/publicacao→cliente (desfazer "Aprovado pelo WhatsApp").
INSERT INTO transicao (de_categoria, para_categoria, quem, requer, negado) VALUES
  ('triagem',   'fila',       '["atendimento","admin","aprovador"]',             '["cliente_e_tipo"]',
     'Só o atendimento ou o aprovador da equipe aceita da triagem.'),
  ('triagem',   'cancelado',  '["atendimento","admin","aprovador"]',             '["motivo"]',
     'Só o atendimento ou o aprovador da equipe recusa da triagem.'),
  ('fila',      'producao',   '["responsavel","atendimento","admin"]',           '[]',
     'Pegue a demanda antes de começar.'),
  ('fila',      'revisao',    '["responsavel","atendimento","admin"]',           '["versao_nova"]',            -- +
     'Só o responsável entrega versão.'),
  ('producao',  'fila',       '["responsavel","atendimento","admin"]',           '[]',                         -- +
     'Só o responsável ou o atendimento devolve para a fila.'),
  ('producao',  'revisao',    '["responsavel","atendimento","admin"]',           '["versao_nova"]',
     'Só o responsável entrega versão.'),
  ('ajuste',    'revisao',    '["responsavel","atendimento","admin"]',           '["versao_nova"]',
     'Só o responsável entrega versão.'),
  ('ajuste',    'producao',   '["responsavel","admin"]',                         '[]',
     'Só o responsável volta a demanda para produção.'),
  ('revisao',   'ajuste',     '["aprovador","atendimento","admin"]',             '["rodada"]',
     'Só o aprovador ou o atendimento devolve para ajuste.'),
  ('revisao',   'cliente',    '["atendimento","admin"]',                         '["envio","com_aprovacao_cliente"]',
     'Só o atendimento envia ao cliente.'),
  ('revisao',   'concluido',  '["aprovador","atendimento","admin"]',             '["sem_aprovacao_cliente"]',
     'Só o aprovador ou o atendimento conclui.'),
  ('cliente',   'ajuste',     '["atendimento","admin","cliente"]',               '["retorno"]',
     'Só o atendimento registra o retorno do cliente.'),
  -- sem 'sem_publicacao': soltar um Post em Aprovado (ou "." em Com o cliente) abre "Registrar retorno";
  -- registrarRetorno() decide entre Aprovado e Agendar pelo tipo.
  ('cliente',   'aprovado',   '["atendimento","admin","cliente"]',               '["retorno"]',
     'Só o atendimento registra o retorno do cliente.'),
  ('cliente',   'publicacao', '["atendimento","admin","cliente"]',               '["retorno","com_publicacao"]',
     'Só o atendimento registra o retorno do cliente.'),
  ('cliente',   'concluido',  '["atendimento","admin"]',                         '["confirmacao"]',
     'Só o atendimento entrega sem aprovação registrada.'),
  ('aprovado',  'publicacao', '["atendimento","admin"]',                         '["com_publicacao"]',
     'Só o atendimento manda para Agendar.'),
  ('aprovado',  'concluido',  '["atendimento","admin"]',                         '[]',
     'Só o atendimento marca como entregue.'),
  ('publicacao','concluido',  '["atendimento","admin","responsavel"]',           '[]',
     'Só o responsável pelo agendamento ou o atendimento marca como entregue.'),
  ('aprovado',  'cliente',    '["atendimento","admin"]',                         '["anular_aprovacao"]',       -- +
     'Só o atendimento desfaz uma aprovação.'),
  ('publicacao','cliente',    '["atendimento","admin"]',                         '["anular_aprovacao"]',       -- +
     'Só o atendimento desfaz uma aprovação.'),
  ('*',         'cancelado',  '["atendimento","admin"]',                         '["motivo"]',
     'Só o atendimento cancela uma demanda.'),
  ('concluido', 'anterior',   '["atendimento","admin"]',                         '[]',
     'Só o atendimento reabre uma demanda entregue.'),
  ('cancelado', 'anterior',   '["atendimento","admin"]',                         '[]',
     'Só o atendimento reabre uma demanda cancelada.');

-- ───────────── tipos de peça: 12 + Outro (SPEC §4.6) ─────────────
-- SLA em dias úteis. folga = dias úteis entre o prazo interno e a publicação/entrega ao cliente.
INSERT INTO tipo_peca (id, nome, slug, equipe_id, aprovacao_cliente, publicacao, com_horario,
                       sla_dias_uteis, sla_ajuste_dias_uteis, folga_aprovacao_dias, estimativa_min, checklist_padrao, pos) VALUES
  ('tp-post',         'Post',                 'post',         'eq-criacao', 1, 1, 0,  2, 1, 1,   60, '[]', 1024),
  ('tp-carrossel',    'Carrossel',            'carrossel',    'eq-criacao', 1, 1, 0,  3, 1, 1,  120, '[]', 2048),
  ('tp-reels',        'Reels',                'reels',        'eq-criacao', 1, 1, 0,  3, 2, 2,  180, '[]', 3072),
  ('tp-anuncio-meta', 'Anúncio Meta',         'anuncio-meta', 'eq-criacao', 1, 0, 0,  2, 1, 1,   90,
     '["Exportar um arquivo por formato"]', 4096),
  ('tp-peca-grafica', 'Peça gráfica',         'peca-grafica', 'eq-criacao', 1, 0, 0,  3, 1, 2,  120,
     '["Conferir medida e sangria","Exportar PDF para impressão"]', 5120),
  ('tp-video',        'Vídeo',                'video',        'eq-criacao', 1, 0, 0,  5, 2, 2,  480, '[]', 6144),
  ('tp-gravacao',     'Gravação',             'gravacao',     'eq-criacao', 0, 0, 1,  2, 1, 0,  240,
     '["Confirmar local e horário com o cliente","Separar equipamento"]', 7168),
  ('tp-relatorio',    'Relatório',            'relatorio',    'eq-social',  0, 0, 0,  3, 1, 1,  120, '[]', 8192),
  ('tp-site',         'Site ou landing page', 'site',         'eq-web',     1, 0, 0, 10, 3, 3, 2400, '[]', 9216),
  ('tp-ajuste-site',  'Ajuste de site',       'ajuste-site',  'eq-web',     0, 0, 0,  3, 1, 1,  120, '[]', 10240),
  ('tp-auditoria',    'Auditoria de site',    'auditoria',    'eq-web',     0, 0, 0,  5, 2, 0,  240, '[]', 11264),
  ('tp-op-trafego',   'OP de tráfego',        'op-trafego',   'eq-trafego', 0, 0, 0,  2, 1, 0,   60, '[]', 12288),
  ('tp-outro',        'Outro',                'outro',        NULL,         1, 0, 0,  2, 1, 1, NULL, '[]', 65536);

-- Campos: no máximo 2 obrigatórios por tipo no seed (a API aceita até 3), sempre com ajuda.
INSERT INTO tipo_peca_campo (id, tipo_peca_id, chave, rotulo, tipo, opcoes, obrigatorio, ajuda, pos) VALUES
  ('tc-post-formato',      'tp-post', 'formato', 'Formato', 'selecao',
     '["Feed 4:5 (1080×1350)","Feed 1:1 (1080×1080)","Stories 9:16 (1080×1920)"]', 1,
     'Formato final da arte. Na dúvida, Feed 4:5.', 1024),
  ('tc-post-rede',         'tp-post', 'rede', 'Rede', 'multipla',
     '["Instagram","Facebook","LinkedIn","TikTok"]', 1,
     'Onde o post vai sair. Muda o formato e o tom.', 2048),
  ('tc-post-texto',        'tp-post', 'texto_arte', 'Texto da arte', 'texto_longo', NULL, 0,
     'Só o texto que vai na arte. A legenda fica com o Social.', 3072),

  ('tc-carrossel-laminas', 'tp-carrossel', 'laminas', 'Lâminas', 'numero', NULL, 1,
     'Quantidade de lâminas, contando capa e fechamento.', 1024),
  ('tc-carrossel-roteiro', 'tp-carrossel', 'roteiro', 'Roteiro', 'texto_longo', NULL, 1,
     'O texto de cada lâmina, uma por linha. Sem roteiro, a Criação devolve.', 2048),
  ('tc-carrossel-rede',    'tp-carrossel', 'rede', 'Rede', 'multipla',
     '["Instagram","Facebook","LinkedIn"]', 0, 'Onde o carrossel vai sair.', 3072),

  ('tc-reels-duracao',     'tp-reels', 'duracao', 'Duração', 'selecao',
     '["até 15 s","até 30 s","até 60 s","até 90 s"]', 1, 'Duração final do vídeo.', 1024),
  ('tc-reels-material',    'tp-reels', 'material', 'Material', 'selecao',
     '["Vamos gravar","O cliente envia","Banco de imagens"]', 1,
     'De onde vêm as imagens. Se for gravar, crie também a demanda de Gravação.', 2048),
  ('tc-reels-roteiro',     'tp-reels', 'roteiro', 'Roteiro', 'texto_longo', NULL, 0,
     'Cenas e falas, se já existirem.', 3072),

  ('tc-anuncio-formatos',  'tp-anuncio-meta', 'formatos', 'Formatos', 'multipla',
     '["Feed 1:1","Feed 4:5","Stories e Reels 9:16"]', 1,
     'Siga o MODELO PARA ADS - META: cada formato vira um arquivo.', 1024),
  ('tc-anuncio-objetivo',  'tp-anuncio-meta', 'objetivo', 'Objetivo', 'selecao',
     '["Tráfego","Engajamento","Mensagens","Conversões","Reconhecimento"]', 1,
     'Objetivo da campanha. Muda a chamada e o texto.', 2048),
  ('tc-anuncio-chamada',   'tp-anuncio-meta', 'chamada', 'Botão', 'texto', NULL, 0,
     'Texto do botão: Saiba mais, Fale conosco, Comprar.', 3072),

  ('tc-grafica-medida',    'tp-peca-grafica', 'medida', 'Medida', 'texto', NULL, 1,
     'Largura × altura em cm, ex.: 90 × 50. Para banner, informe também a sangria.', 1024),
  ('tc-grafica-material',  'tp-peca-grafica', 'material', 'Material e acabamento', 'texto', NULL, 0,
     'Ex.: lona fosca, adesivo vinil, couché 300 g com laminação.', 2048),
  ('tc-grafica-qtd',       'tp-peca-grafica', 'quantidade', 'Quantidade', 'numero', NULL, 0,
     'Quantidade a imprimir, se já souber.', 3072),

  ('tc-video-duracao',     'tp-video', 'duracao', 'Duração', 'texto', NULL, 1,
     'Duração final aproximada, ex.: 30 s, 2 min.', 1024),
  ('tc-video-bruto',       'tp-video', 'material_bruto', 'Material bruto', 'url', NULL, 1,
     'Link da pasta do Drive com o material gravado.', 2048),
  ('tc-video-formato',     'tp-video', 'formato', 'Formato', 'selecao',
     '["Horizontal 16:9","Vertical 9:16","Quadrado 1:1"]', 0, 'Proporção do vídeo final.', 3072),

  ('tc-gravacao-captacao', 'tp-gravacao', 'captacao', 'Captação', 'selecao',
     '["Foto","Vídeo","Foto e vídeo"]', 1, 'O que a equipe vai captar. Local e horário ficam nos campos da demanda.', 1024),
  ('tc-gravacao-roteiro',  'tp-gravacao', 'roteiro', 'Roteiro ou lista de cenas', 'texto_longo', NULL, 0,
     'Cenas, falas e quem aparece.', 2048),
  ('tc-gravacao-contato',  'tp-gravacao', 'contato_local', 'Contato no local', 'texto', NULL, 0,
     'Quem recebe a equipe e o telefone.', 3072),

  ('tc-relatorio-periodo', 'tp-relatorio', 'periodo', 'Período', 'texto', NULL, 1,
     'EXPLICAÇÃO PARA RELATÓRIOS: informe o período (ex.: setembro de 2026) e o que o cliente quer acompanhar.', 1024),
  ('tc-relatorio-redes',   'tp-relatorio', 'redes', 'Redes', 'multipla',
     '["Instagram","Facebook","LinkedIn","TikTok","YouTube","Google Meu Negócio"]', 1,
     'Quais perfis entram no relatório.', 2048),
  ('tc-relatorio-kpis',    'tp-relatorio', 'kpis', 'Indicadores', 'texto_longo', NULL, 0,
     'Indicadores pedidos pelo cliente, se houver algum fora do padrão.', 3072),

  ('tc-site-escopo',       'tp-site', 'escopo', 'Escopo', 'selecao',
     '["Landing page","Site institucional","E-commerce","Protótipo no Figma"]', 1,
     'Prazos de referência: Figma da home 5 dias, LP 10, institucional 15, e-commerce 45.', 1024),
  ('tc-site-objetivo',     'tp-site', 'objetivo', 'Objetivo e páginas', 'texto_longo', NULL, 1,
     'Para que serve e quais páginas ou seções entram.', 2048),
  ('tc-site-dominio',      'tp-site', 'dominio', 'Domínio', 'url', NULL, 0,
     'Endereço onde o site vai ficar, se já existir.', 3072),

  ('tc-ajuste-site-url',   'tp-ajuste-site', 'pagina', 'Página', 'url', NULL, 1,
     'Endereço exato da página que vai mudar.', 1024),
  ('tc-ajuste-site-compl', 'tp-ajuste-site', 'complexidade', 'Complexidade', 'selecao',
     '["Simples (até 3 dias)","Complexo (7 a 15 dias)"]', 1,
     'Troca de texto e imagem é simples. Nova seção ou integração é complexo.', 2048),

  ('tc-auditoria-site',    'tp-auditoria', 'site', 'Site', 'url', NULL, 1,
     'Endereço do site auditado.', 1024),
  ('tc-auditoria-plat',    'tp-auditoria', 'plataforma', 'Plataforma', 'selecao',
     '["WordPress","Shopify","Wix","Outra"]', 0, 'Onde o site roda.', 2048),

  ('tc-op-plataforma',     'tp-op-trafego', 'plataforma', 'Plataforma', 'multipla',
     '["Meta","Google","TikTok","LinkedIn"]', 1, 'Onde a OP será executada.', 1024),
  ('tc-op-verba',          'tp-op-trafego', 'verba', 'Verba e período', 'texto', NULL, 0,
     'Ex.: R$ 1.500 de 20/10 a 31/10. Nunca escreva senhas aqui: use o cofre.', 2048);

-- ───────────── feriados nacionais 2026 e 2027 ─────────────
-- Todo dia desta tabela é não útil no cálculo de prazo. Os facultativos (Carnaval, Corpus Christi) entram
-- porque a agência costuma parar; o admin remove em Configurações se a casa trabalhar. Municipais: cadastrar.
INSERT INTO feriado (data, nome, tipo) VALUES
  ('2026-01-01', 'Confraternização Universal',            'nacional'),
  ('2026-02-16', 'Carnaval',                              'facultativo'),
  ('2026-02-17', 'Carnaval',                              'facultativo'),
  ('2026-04-03', 'Sexta-feira Santa',                     'nacional'),
  ('2026-04-21', 'Tiradentes',                            'nacional'),
  ('2026-05-01', 'Dia do Trabalho',                       'nacional'),
  ('2026-06-04', 'Corpus Christi',                        'facultativo'),
  ('2026-09-07', 'Independência do Brasil',               'nacional'),
  ('2026-10-12', 'Nossa Senhora Aparecida',               'nacional'),
  ('2026-11-02', 'Finados',                               'nacional'),
  ('2026-11-15', 'Proclamação da República',              'nacional'),
  ('2026-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
  ('2026-12-25', 'Natal',                                 'nacional'),
  ('2027-01-01', 'Confraternização Universal',            'nacional'),
  ('2027-02-08', 'Carnaval',                              'facultativo'),
  ('2027-02-09', 'Carnaval',                              'facultativo'),
  ('2027-03-26', 'Sexta-feira Santa',                     'nacional'),
  ('2027-04-21', 'Tiradentes',                            'nacional'),
  ('2027-05-01', 'Dia do Trabalho',                       'nacional'),
  ('2027-05-27', 'Corpus Christi',                        'facultativo'),
  ('2027-09-07', 'Independência do Brasil',               'nacional'),
  ('2027-10-12', 'Nossa Senhora Aparecida',               'nacional'),
  ('2027-11-02', 'Finados',                               'nacional'),
  ('2027-11-15', 'Proclamação da República',              'nacional'),
  ('2027-11-20', 'Dia Nacional de Zumbi e da Consciência Negra', 'nacional'),
  ('2027-12-25', 'Natal',                                 'nacional');

-- ───────────── visões semeadas (SPEC §5.1) ─────────────
-- filtros: FiltrosVisao (shared/tipos/config.ts). recolhidas: categorias recolhidas por padrão.
-- A Triagem nunca aparece numa visão (aplicarFiltros a exclui sempre; ela tem tela própria).
-- Social: "ou" traz o Agendar de qualquer equipe (o Post da Criação continua com equipe_id = eq-criacao).
INSERT INTO visao (id, nome, slug, equipe_id, layout, agrupar_por, filtros, recolhidas, icone, pos) VALUES
  ('vs-criacao',       'Criação',      'criacao',       'eq-criacao', 'quadro', 'responsavel',
     '{"equipes":["eq-criacao"],"categorias":["fila","producao","ajuste","revisao"]}', '[]', 'palette', 1024),
  ('vs-social',        'Social',       'social',        'eq-social',  'quadro', 'responsavel',
     '{"equipes":["eq-social"],"categorias":["fila","producao","ajuste","revisao","publicacao"],"ou":[{"categorias":["publicacao"]}]}',
     '[]', 'megaphone', 2048),
  ('vs-web',           'Web',          'web',           'eq-web',     'quadro', 'responsavel',
     '{"equipes":["eq-web"],"categorias":["fila","producao","ajuste","revisao"]}', '[]', 'globe', 3072),
  ('vs-trafego',       'Tráfego',      'trafego',       'eq-trafego', 'quadro', 'responsavel',
     '{"equipes":["eq-trafego"],"categorias":["fila","producao","ajuste","revisao"]}', '[]', 'trending-up', 4096),
  ('vs-meus-clientes', 'Meus clientes','meus-clientes', NULL,         'quadro', 'etapa',
     '{"atendimento":"eu"}', '["fila","producao"]', 'briefcase', 5120),
  ('vs-geral',         'Geral',        'geral',         NULL,         'quadro', 'etapa',
     '{}', '["concluido"]', 'layout-grid', 6144);
