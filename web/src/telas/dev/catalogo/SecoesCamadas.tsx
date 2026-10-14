/** Catálogo: modal, folha, popover, menu (com submenu e de contexto), tooltip e avisos. */
import { useState, type MouseEvent } from 'react'
import {
  Archive, ArrowRightLeft, CalendarDays, Copy, Filter, Link2, MoreHorizontal, Send, Tag, Trash2, Users,
} from 'lucide-react'
import { Botao, BotaoIcone } from '../../../ui/Botao.tsx'
import { Campo, Selecao } from '../../../ui/Campo.tsx'
import { Checkbox } from '../../../ui/Checkbox.tsx'
import { Menu, MenuFlutuante, type ItemMenuUi } from '../../../ui/Menu.tsx'
import { Folha, Modal } from '../../../ui/Modal.tsx'
import { Popover } from '../../../ui/Popover.tsx'
import { avisar } from '../../../ui/avisos.tsx'
import { Amostra, Bloco, Linha, Nota } from './Amostra.tsx'

function DemoModais() {
  const [aberto, setAberto] = useState<null | 'confirmar' | 'form' | 'folha' | 'folha-topo'>(null)
  const fechar = () => setAberto(null)
  return (
    <Bloco titulo="Modal (tela cheia abaixo de 768 px) e folha">
      <Linha>
        <Botao variante="secundario" onClick={() => setAberto('confirmar')}>Confirmar arquivar</Botao>
        <Botao variante="secundario" onClick={() => setAberto('form')}>Formulário</Botao>
        <Botao variante="secundario" onClick={() => setAberto('folha')}>Folha de baixo</Botao>
        <Botao variante="secundario" onClick={() => setAberto('folha-topo')}>Folha do topo</Botao>
      </Linha>
      <Modal aberto={aberto === 'confirmar'} aoFechar={fechar} tamanho="p" titulo="Arquivar esta demanda?"
        descricao="Ela sai do quadro e continua no histórico. Dá para restaurar pelo Arquivo."
        rodape={<><Botao variante="ghost" onClick={fechar}>Cancelar</Botao><Botao variante="perigo" icone={Archive}
          onClick={() => { fechar(); avisar('Arquivada.', { desfazer: () => { avisar('Restaurada.', { tipo: 'sucesso' }) } }) }}>Arquivar</Botao></>} />
      <Modal aberto={aberto === 'form'} aoFechar={fechar} titulo="Convidar pessoa" descricao="Gera um link de uso único, válido por 7 dias."
        rodape={<><Botao variante="ghost" onClick={fechar}>Cancelar</Botao><Botao variante="primario" onClick={fechar}>Gerar convite</Botao></>}>
        <div className="flex flex-col gap-4">
          <Campo rotulo="Nome" placeholder="Rafaela Souza" data-autofocus />
          <Campo rotulo="E-mail" type="email" placeholder="rafa@meltcomunicacao.com.br" />
          <Selecao rotulo="Papel" defaultValue="equipe" opcoes={[{ valor: 'admin', rotulo: 'Admin' }, { valor: 'atendimento', rotulo: 'Atendimento' }, { valor: 'equipe', rotulo: 'Equipe' }]} />
          <Checkbox defaultChecked descricao="Ela passa a seguir os quadros da equipe.">Entrar na equipe Criação</Checkbox>
        </div>
      </Modal>
      <Folha aberto={aberto === 'folha'} aoFechar={fechar} titulo="Mover para…">
        <div className="flex flex-col gap-4 px-2 pb-2">
          <Selecao rotulo="Quadro" defaultValue="criacao" opcoes={[{ valor: 'criacao', rotulo: 'Criação' }, { valor: 'social', rotulo: 'Social' }]} />
          <Selecao rotulo="Coluna" defaultValue="fila" opcoes={[{ valor: 'fila', rotulo: 'Fila' }, { valor: 'fazendo', rotulo: 'Fazendo' }]} />
          <Botao variante="primario" larguraTotal onClick={fechar}>Mover</Botao>
        </div>
      </Folha>
      <Folha aberto={aberto === 'folha-topo'} aoFechar={fechar} titulo="Menu" lado="topo">
        <p className="px-2 pb-4 text-fg-2">O menu lateral abre assim no celular.</p>
      </Folha>
    </Bloco>
  )
}

function DemoPopover() {
  const [aberto, setAberto] = useState(false)
  const [ancora, setAncora] = useState<HTMLButtonElement | null>(null)
  return (
    <Bloco titulo="Popover ancorado (vira folha no celular)">
      <Linha>
        <Botao ref={setAncora} variante="secundario" icone={Filter} aria-expanded={aberto} aria-haspopup="dialog" onClick={() => setAberto(!aberto)}>Filtros</Botao>
      </Linha>
      <Popover aberto={aberto} aoFechar={() => setAberto(false)} ancora={ancora} titulo="Filtros" mostrarTitulo largura={300}>
        <div className="ui-popover-corpo flex flex-col gap-3">
          <Checkbox defaultChecked>Só as minhas</Checkbox>
          <Checkbox>Com o cliente</Checkbox>
          <Selecao rotulo="Prazo" tamanho="p" vazia="Qualquer prazo" opcoes={[{ valor: 'atrasado', rotulo: 'Atrasadas' }, { valor: 'hoje', rotulo: 'Vence hoje' }, { valor: 'semana', rotulo: 'Esta semana' }]} />
          <div className="flex justify-end gap-2"><Botao variante="ghost" tamanho="p" onClick={() => setAberto(false)}>Limpar</Botao></div>
        </div>
      </Popover>
    </Bloco>
  )
}

const itensDemanda = (feito: (o: string) => void): ItemMenuUi[] => [
  { id: 'mover', rotulo: 'Mover para…', icone: ArrowRightLeft, atalho: 'm', executar: () => feito('Mover para…') },
  { id: 'copiar', rotulo: 'Copiar…', icone: Copy, executar: () => feito('Copiar…') },
  {
    id: 'enviar', rotulo: 'Enviar para', icone: Send, subitens: [
      { tipo: 'grupo', id: 'g-fav', rotulo: 'Favoritos' },
      { id: 'social', rotulo: 'Social', executar: () => feito('Enviada para Social') },
      { id: 'atendimento', rotulo: 'Atendimento', executar: () => feito('Enviada para Atendimento') },
      { tipo: 'separador', id: 's1' },
      { id: 'web', rotulo: 'Web', executar: () => feito('Enviada para Web') },
    ],
  },
  { tipo: 'separador', id: 's0' },
  { id: 'membros', rotulo: 'Membros', icone: Users, atalho: 'space', executar: () => feito('Membros') },
  { id: 'etiquetas', rotulo: 'Etiquetas', icone: Tag, atalho: 'l', executar: () => feito('Etiquetas') },
  { id: 'datas', rotulo: 'Datas', icone: CalendarDays, atalho: 'd', executar: () => feito('Datas') },
  { id: 'seguir', rotulo: 'Seguindo', marcado: true, executar: () => feito('Deixou de seguir') },
  { tipo: 'separador', id: 's2' },
  { id: 'link', rotulo: 'Copiar link', icone: Link2, executar: () => feito('Link copiado.') },
  { id: 'arquivar', rotulo: 'Arquivar', icone: Archive, executar: () => feito('Arquivada.') },
  { id: 'excluir', rotulo: 'Excluir', icone: Trash2, perigo: true, executar: () => feito('Excluir (pede confirmação).') },
  { id: 'bloqueado', rotulo: 'Enviar ao cliente', desabilitado: true },
]

function DemoMenus() {
  const avisarFeito = (o: string) => { avisar(o) }
  const [contexto, setContexto] = useState<{ x: number; y: number } | null>(null)
  const abrirContexto = (e: MouseEvent) => { e.preventDefault(); setContexto({ x: e.clientX, y: e.clientY }) }
  return (
    <Bloco titulo="Menu (setas, letra, → abre o submenu, ← volta) e menu de contexto">
      <Linha>
        <Menu rotulo="Ações da demanda" itens={itensDemanda(avisarFeito)}>
          {(g) => <BotaoIcone {...g} icone={MoreHorizontal} rotulo="Ações da demanda" variante="secundario" />}
        </Menu>
        <Menu rotulo="Ordenar coluna" itens={[
          { tipo: 'grupo', id: 'g', rotulo: 'Ordenar por' },
          { id: 'prazo', rotulo: 'Prazo', marcado: true, executar: () => avisarFeito('Por prazo') },
          { id: 'criacao', rotulo: 'Data de criação', marcado: false, executar: () => avisarFeito('Por criação') },
          { id: 'titulo', rotulo: 'Título', marcado: false, executar: () => avisarFeito('Por título') },
        ]}>
          {(g) => <Botao {...g} variante="secundario">Ordenar</Botao>}
        </Menu>
      </Linha>
      <div className="cat-menu-contexto" tabIndex={0} onContextMenu={abrirContexto}
        onKeyDown={(e) => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setContexto({ x: r.left + 24, y: r.top + 24 }) } }}>
        Clique com o botão direito aqui (ou Shift+F10 com o foco)
      </div>
      <MenuFlutuante aberto={!!contexto} aoFechar={() => setContexto(null)} ancora={contexto} itens={itensDemanda(avisarFeito)} rotulo="#1.204 Carrossel do Dia do Cliente" />
    </Bloco>
  )
}

export function SecaoCamadas() {
  return (
    <>
      <Nota>As camadas abrem em portal e seguem o tema da página (troque no topo). O fundo fica inerte, Esc fecha só a de cima e o foco volta para quem abriu.</Nota>
      <Amostra rotulo="Modal, folha, popover e menus">
        <DemoModais />
        <DemoPopover />
        <DemoMenus />
      </Amostra>
    </>
  )
}

export function SecaoAvisos() {
  return (
    <Amostra rotulo="Avisos">
      <Bloco titulo="Avisos (sonner, superfície invertida; Desfazer fica 8 s)">
        <Linha>
          <Botao variante="secundario" onClick={() => avisar('Movida para Social › Agendar', { desfazer: () => { avisar('Voltou para Criação › Fazendo.') } })}>Com Desfazer</Botao>
          <Botao variante="secundario" onClick={() => avisar('Link copiado.', { tipo: 'sucesso' })}>Sucesso</Botao>
          <Botao variante="secundario" onClick={() => avisar('Não foi possível salvar.', { tipo: 'erro', descricao: 'Suas alterações estão guardadas aqui.', acao: { rotulo: 'Tentar de novo', executar: () => { avisar('Salvo.', { tipo: 'sucesso' }) } } })}>Erro com ação</Botao>
          <Botao variante="secundario" onClick={() => avisar('2 etiquetas ficaram no quadro Criação.', { tipo: 'aviso' })}>Aviso</Botao>
          <Botao variante="secundario" onClick={() => avisar('Disponível em breve.', { tipo: 'info' })}>Informação</Botao>
        </Linha>
      </Bloco>
    </Amostra>
  )
}
