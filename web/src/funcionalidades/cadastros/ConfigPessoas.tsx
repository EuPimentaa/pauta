/**
 * Configurações › Pessoas (admin; PLANO §3 F5): convidar com o link copiável, gerar um link novo de convite (quem ainda
 * não entrou) ou de nova senha (1 hora), editar (nome, apelido, e-mail, papel, equipes, cor), desativar e reativar.
 * O primeiro dos Primeiros passos aponta para cá.
 */
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { KeyRound, Link2, MoreHorizontal, Pencil, Search, UserCheck, UserMinus, UserPlus, Users } from 'lucide-react'
import type { LinkAcesso, Usuario } from '@shared/tipos/index.ts'
import { useEu } from '../../api/auth.ts'
import { avisarErro } from '../../api/acoes.ts'
import { useEquipes } from '../../api/seletores.ts'
import { useAbrirDialogo } from '../../dialogos/index.ts'
import { useNomeApp } from '../../lib/app.ts'
import { Abas } from '../../ui/Abas.tsx'
import { Avatar } from '../../ui/Avatar.tsx'
import { avisar } from '../../ui/avisos.tsx'
import { Botao, BotaoIcone } from '../../ui/Botao.tsx'
import { Campo } from '../../ui/Campo.tsx'
import { EsqueletoLinhas, EstadoVazio } from '../../ui/Indicadores.tsx'
import { Menu, type ItemMenuUi } from '../../ui/Menu.tsx'
import { Modal } from '../../ui/Modal.tsx'
import { editarPessoa, gerarLink, usePessoas } from './api.ts'
import { LinkConvite, Painel, Pilula } from './comum.tsx'
import { DialogoPessoa, ROTULO_PAPEL } from './DialogoPessoa.tsx'

const colacao = new Intl.Collator('pt-BR', { sensitivity: 'base' })
const normalizar = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

function dias(ate: string): number {
  return Math.ceil((Date.parse(ate) - Date.now()) / 86_400_000)
}

function quando(i: string): string {
  const d = Math.floor((Date.now() - Date.parse(i)) / 86_400_000)
  if (d <= 0) return 'hoje'
  if (d === 1) return 'ontem'
  if (d < 30) return `há ${d} dias`
  const m = Math.floor(d / 30)
  return m === 1 ? 'há 1 mês' : `há ${m} meses`
}

function Situacao({ u }: { u: Usuario }) {
  if (!u.ativo) return <Pilula tom="perigo">Sem acesso</Pilula>
  if (!u.temSenha) {
    if (u.conviteExpiraEm && dias(u.conviteExpiraEm) > 0) {
      const n = dias(u.conviteExpiraEm)
      return <Pilula tom="aviso">Convite pendente · {n === 1 ? 'vence amanhã' : `vence em ${n} dias`}</Pilula>
    }
    return <Pilula tom="perigo">Convite vencido</Pilula>
  }
  return <span className="cad-nota">{u.ultimoAcessoEm ? `Entrou ${quando(u.ultimoAcessoEm)}` : 'Ainda não entrou'}</span>
}

export default function ConfigPessoas() {
  const qc = useQueryClient()
  const eu = useEu()
  const appNome = useNomeApp()
  const abrirDialogo = useAbrirDialogo()
  const equipes = useEquipes()
  const consulta = usePessoas()
  const [aba, setAba] = useState<'ativas' | 'desativadas'>('ativas')
  const [busca, setBusca] = useState('')
  const [params, setParams] = useSearchParams()
  const [editando, setEditando] = useState<Usuario | null | 'nova'>(() => (params.get('convidar') === '1' ? 'nova' : null))
  const [link, setLink] = useState<{ u: Usuario; link: LinkAcesso; finalidade: 'convite' | 'redefinicao' } | null>(null)

  const pessoas = useMemo(() => [...(consulta.data ?? [])].sort((a, b) => colacao.compare(a.nome, b.nome)), [consulta.data])
  const ativas = pessoas.filter((p) => p.ativo)
  const desativadas = pessoas.filter((p) => !p.ativo)
  const termo = normalizar(busca.trim())
  const lista = (aba === 'ativas' ? ativas : desativadas)
    .filter((p) => !termo || normalizar(`${p.nome} ${p.apelido ?? ''} ${p.email}`).includes(termo))
  const pendentes = ativas.filter((p) => !p.temSenha).length

  async function novoLink(u: Usuario, finalidade: 'convite' | 'redefinicao') {
    try {
      setLink({ u, finalidade, link: await gerarLink(qc, u, finalidade) })
    } catch (e) {
      avisarErro(e, { titulo: 'Não foi possível gerar o link.' })
    }
  }

  async function mudarAtivo(u: Usuario, ativo: boolean) {
    if (!ativo) {
      const ok = await abrirDialogo('confirmar', {
        titulo: `Desativar ${u.nome}?`, confirmar: 'Desativar', perigo: true,
        mensagem: 'A pessoa sai do sistema na hora e não entra mais; os links pendentes param de valer e o cronômetro dela para.\nEla continua nas demandas e com a coluna dela até alguém tirar.',
      })
      if (!ok) return
    }
    try {
      await editarPessoa(qc, u, { ativo })
      avisar(ativo ? `Acesso de ${u.nome} reativado.` : `Acesso de ${u.nome} desativado.`, { tipo: 'sucesso', descricao: ativo && !u.temSenha ? 'Gere um link de convite novo para a pessoa entrar.' : undefined })
    } catch (e) {
      avisarErro(e, { titulo: ativo ? 'Não foi possível reativar.' : 'Não foi possível desativar.' })
    }
  }

  function itens(u: Usuario): ItemMenuUi[] {
    const lista: ItemMenuUi[] = [{ id: 'editar', rotulo: 'Editar', icone: Pencil, executar: () => setEditando(u) }]
    if (u.ativo && !u.temSenha) lista.push({ id: 'convite', rotulo: 'Gerar link de convite', icone: Link2, executar: () => void novoLink(u, 'convite') })
    if (u.ativo && u.temSenha) lista.push({ id: 'senha', rotulo: 'Gerar link de nova senha', icone: KeyRound, executar: () => void novoLink(u, 'redefinicao') })
    if (u.id !== eu.usuario.id) {
      lista.push({ tipo: 'separador', id: 's' })
      lista.push(u.ativo
        ? { id: 'desativar', rotulo: 'Desativar', icone: UserMinus, perigo: true, executar: () => void mudarAtivo(u, false) }
        : { id: 'reativar', rotulo: 'Reativar', icone: UserCheck, executar: () => void mudarAtivo(u, true) })
    }
    return lista
  }

  return (
    <div className="cad-secao">
      <header className="cad-cabecalho">
        <div className="cad-cabecalho-texto">
          <h1 className="cad-titulo">Pessoas</h1>
          <p className="cad-subtitulo">Convide pelo link: a pessoa abre, define a senha e entra. Quem entra numa equipe segue os quadros dela e ganha a própria coluna.</p>
        </div>
        <Botao variante="primario" icone={UserPlus} onClick={() => setEditando('nova')}>Convidar pessoa</Botao>
      </header>

      <div className="cad-filtros">
        <Abas rotulo="Pessoas" ativa={aba} aoMudar={setAba} abas={[
          { id: 'ativas', rotulo: 'Ativas', contador: ativas.length },
          { id: 'desativadas', rotulo: 'Desativadas', contador: desativadas.length },
        ]} />
        {pessoas.length > 6 && (
          <Campo classeGrupo="cad-filtro-busca" rotulo="Buscar pessoa" rotuloOculto icone={Search} tamanho="p" type="search"
            placeholder="Nome, apelido ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
        )}
      </div>

      {pendentes > 0 && aba === 'ativas' && (
        <p className="cad-nota" role="status">{pendentes === 1 ? '1 pessoa ainda não entrou.' : `${pendentes} pessoas ainda não entraram.`} Se o link se perdeu, gere outro em "Link de convite".</p>
      )}

      <Painel>
        {consulta.isPending ? (
          <div className="cad-painel-corpo"><EsqueletoLinhas linhas={5} /></div>
        ) : consulta.isError ? (
          <EstadoVazio titulo="Não foi possível carregar as pessoas." texto={consulta.error.mensagem}
            acoes={<Botao variante="secundario" onClick={() => void consulta.refetch()}>Tentar de novo</Botao>} />
        ) : lista.length === 0 ? (
          <EstadoVazio icone={Users} tamanho="p"
            titulo={termo ? 'Ninguém com esse nome.' : aba === 'ativas' ? 'Só você por enquanto.' : 'Ninguém desativado.'}
            texto={!termo && aba === 'ativas' ? 'Convide a equipe: cada pessoa recebe um link para definir a senha.' : undefined}
            acoes={!termo && aba === 'ativas' ? <Botao variante="secundario" icone={UserPlus} onClick={() => setEditando('nova')}>Convidar pessoa</Botao> : undefined} />
        ) : (
          <ul className="cad-lista" aria-label={aba === 'ativas' ? 'Pessoas ativas' : 'Pessoas desativadas'}>
            {lista.map((u) => (
              <li key={u.id} className="cad-linha" data-inativa={u.ativo ? undefined : ''}>
                <Avatar pessoa={u} tamanho={36} dica={false} />
                <div className="cad-linha-principal">
                  <span className="cad-linha-nome">
                    <span>{u.nome}{u.apelido ? <span className="cad-texto-2"> · {u.apelido}</span> : null}</span>
                    {u.id === eu.usuario.id && <Pilula>você</Pilula>}
                  </span>
                  <span className="cad-linha-meta">
                    <span>{u.email}</span>
                    <span>{ROTULO_PAPEL[u.papel]}</span>
                    {u.equipeIds.map((id) => equipes.find((e) => e.id === id)).filter((e) => !!e).map((e) => (
                      <span key={e.id}><span className="cad-ponto" data-cor={e.cor} aria-hidden="true" />{e.nome}</span>
                    ))}
                  </span>
                </div>
                <div className="cad-linha-fim">
                  <Situacao u={u} />
                  {u.ativo && !u.temSenha && (
                    <Botao tamanho="p" variante="secundario" icone={Link2} onClick={() => void novoLink(u, 'convite')}>Link de convite</Botao>
                  )}
                  <Menu rotulo={`Ações de ${u.nome}`} itens={itens(u)} alinhar="fim">
                    {(g) => <BotaoIcone {...g} icone={MoreHorizontal} rotulo={`Ações de ${u.nome}`} />}
                  </Menu>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Painel>

      {editando && <DialogoPessoa pessoa={editando === 'nova' ? null : editando} aoFechar={() => {
        setEditando(null)
        if (params.has('convidar')) setParams((p) => { const n = new URLSearchParams(p); n.delete('convidar'); return n }, { replace: true })
      }} />}
      {link && (
        <Modal aberto aoFechar={() => setLink(null)} titulo={link.finalidade === 'convite' ? `Link de convite de ${link.u.nome}` : `Nova senha de ${link.u.nome}`}
          descricao={link.finalidade === 'convite' ? 'O link anterior deixou de valer.' : 'O link vale 1 hora e encerra as sessões antigas quando for usado.'}
          tamanho="m" rodape={<Botao variante="primario" onClick={() => setLink(null)}>Pronto</Botao>}>
          <LinkConvite nome={link.u.nome} appNome={appNome} link={link.link} finalidade={link.finalidade} />
        </Modal>
      )}
    </div>
  )
}
