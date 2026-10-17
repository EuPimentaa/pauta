/**
 * Página do cliente, a parte do cadastro (F5): logo, "Completar cadastro" (AM e contato padrão), contatos que aprovam,
 * pasta de saída, links e responsáveis por equipe. Quem edita: admin; atendimento da carteira e dos sem AM (API §2).
 */
import { useId, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList, Contact, ExternalLink, FolderOpen, ImagePlus, Link2, Mail, MessageCircle, Pencil, Plus, Star, Trash2, UsersRound,
} from 'lucide-react'
import {
  TIPOS_LINK_CLIENTE, type Cliente, type ClienteContato, type ClienteLink, type Id, type TipoLinkCliente,
} from '@shared/tipos/index.ts'
import { avisarErro } from '../../api/acoes.ts'
import { useEnviarArquivo } from '../../api/arquivos.ts'
import { useEquipes, useUsuarios } from '../../api/seletores.ts'
import { useAbrirDialogo } from '../../dialogos/index.ts'
import {
  criarContato, criarLink, definirResponsaveis, editarCliente, editarContato, editarLink, excluirLink,
} from '../../funcionalidades/cadastros/api.ts'
import { erroDoCampo, Faixa, mensagemGeral, nomeCurto, Painel, Pilula } from '../../funcionalidades/cadastros/comum.tsx'
import { membrosAtivos } from '../../funcionalidades/cadastros/logica.ts'
import { Avatar } from '../../ui/Avatar.tsx'
import { avisar } from '../../ui/avisos.tsx'
import { Botao, BotaoIcone } from '../../ui/Botao.tsx'
import { Campo, Selecao } from '../../ui/Campo.tsx'
import { Checkbox } from '../../ui/Checkbox.tsx'
import { Modal } from '../../ui/Modal.tsx'
import { CopiarTexto } from '../../ui/Texto.tsx'

const colacao = new Intl.Collator('pt-BR', { sensitivity: 'base' })

/** Pessoas que podem ser AM: o atendimento primeiro (e quem já é o AM, mesmo inativo). */
export function useOpcoesAm(atual: Id | null) {
  const usuarios = useUsuarios()
  return usuarios.filter((u) => (u.ativo && u.papel !== 'equipe') || u.id === atual)
    .sort((a, b) => Number(b.papel === 'atendimento') - Number(a.papel === 'atendimento') || colacao.compare(a.nome, b.nome))
    .map((u) => ({ valor: u.id, rotulo: `${u.nome}${u.papel === 'admin' ? ' (admin)' : ''}${u.ativo ? '' : ' (sem acesso)'}` }))
}

// ─────────────────────────────── logo ───────────────────────────────

export function LogoCliente({ cliente, podeEditar }: { cliente: Cliente; podeEditar: boolean }) {
  const qc = useQueryClient()
  const enviar = useEnviarArquivo()
  const input = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  async function escolher(f: File | undefined) {
    if (!f) return
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { avisar('Use uma imagem JPG, PNG ou WebP.', { tipo: 'erro' }); return }
    setEnviando(true)
    try {
      const info = await enviar(f)
      await editarCliente(qc, cliente, { logoArquivoId: info.id })
      avisar('Logo trocado.', { tipo: 'sucesso', descricao: 'Ele aparece também na página de aprovação do cliente.' })
    } catch (e) {
      avisarErro(e, { titulo: 'Não foi possível enviar o logo.' })
    } finally {
      setEnviando(false)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <div className="cad-cliente-logo">
      <span className="cad-sigla" data-cor={cliente.cor} data-tamanho="g">
        {cliente.logoUrl ? <img src={cliente.logoUrl} alt={`Logo de ${cliente.nome}`} /> : <span aria-hidden="true">{cliente.sigla}</span>}
      </span>
      {podeEditar && (
        <>
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true"
            onChange={(e) => void escolher(e.target.files?.[0])} />
          <BotaoIcone icone={ImagePlus} variante="secundario" tamanho="p" rotulo={cliente.logoUrl ? 'Trocar o logo' : 'Enviar o logo'}
            disabled={enviando} onClick={() => input.current?.click()} />
        </>
      )}
    </div>
  )
}

// ─────────────────────────────── completar cadastro ───────────────────────────────

export function CompletarCadastro({ cliente, podeEditar, aoNovoContato }: { cliente: Cliente; podeEditar: boolean; aoNovoContato(): void }) {
  const qc = useQueryClient()
  const opcoesAm = useOpcoesAm(cliente.atendimentoId)
  if (cliente.pendencias.length === 0) return null
  if (!podeEditar) {
    return <Faixa icone={ClipboardList} tom="info">Cadastro incompleto: o atendimento completa (AM e contato que aprova).</Faixa>
  }
  return (
    <Faixa icone={ClipboardList}>
      <strong>Completar cadastro.</strong>
      <ul className="mt-2 flex flex-col gap-2">
        {cliente.pendencias.includes('sem_am') && (
          <li className="flex flex-wrap items-center gap-2">
            <span>Quem é o atendimento (AM)?</span>
            <Selecao rotulo="Atendimento do cliente" rotuloOculto tamanho="p" value="" vazia="Escolher…" opcoes={opcoesAm}
              onChange={async (e) => {
                if (!e.target.value) return
                try { await editarCliente(qc, cliente, { atendimentoId: e.target.value }) } catch (erro) { avisarErro(erro) }
              }} />
          </li>
        )}
        {cliente.pendencias.includes('sem_contato_padrao') && (
          <li className="flex flex-wrap items-center gap-2">
            <span>Quem aprova as peças?</span>
            <Botao tamanho="p" variante="secundario" icone={Plus} onClick={aoNovoContato}>Cadastrar o contato padrão</Botao>
          </li>
        )}
      </ul>
    </Faixa>
  )
}

// ─────────────────────────────── contatos ───────────────────────────────

function DialogoContato({ cliente, contato, aoFechar }: { cliente: Cliente; contato: ClienteContato | null; aoFechar(): void }) {
  const qc = useQueryClient()
  const idForm = useId()
  const primeiro = cliente.contatos.filter((c) => c.ativo).length === 0
  const [nome, setNome] = useState(contato?.nome ?? '')
  const [cargo, setCargo] = useState(contato?.cargo ?? '')
  const [whatsapp, setWhatsapp] = useState(contato?.whatsapp ?? '')
  const [email, setEmail] = useState(contato?.email ?? '')
  const [aprova, setAprova] = useState(contato?.aprova ?? true)
  const [padrao, setPadrao] = useState(contato?.padrao ?? primeiro)
  const [erro, setErro] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)
  const [tentou, setTentou] = useState(false)

  async function salvar() {
    setTentou(true)
    setErro(null)
    if (!nome.trim()) return
    const dados = { nome: nome.trim(), cargo: cargo.trim() || null, whatsapp: whatsapp.trim() || null, email: email.trim() || null, aprova, padrao }
    setEnviando(true)
    try {
      if (contato) await editarContato(qc, cliente, contato, dados)
      else await criarContato(qc, cliente, dados)
      avisar(contato ? 'Contato salvo.' : `Contato ${dados.nome} cadastrado.`, { tipo: 'sucesso' })
      aoFechar()
    } catch (e) {
      setErro(e)
    } finally {
      setEnviando(false)
    }
  }

  async function desativar() {
    if (!contato) return
    try {
      await editarContato(qc, cliente, contato, { ativo: false })
      // o servidor revoga os links de aprovação abertos para o contato (desfazer não os devolve: envie de novo)
      avisar(`${contato.nome} saiu dos contatos.`, {
        descricao: 'Os links de aprovação deste contato pararam de valer.',
        desfazer: async () => { await editarContato(qc, cliente, contato, { ativo: true }) },
      })
      aoFechar()
    } catch (e) { setErro(e) }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={contato ? `Editar ${contato.nome}` : `Novo contato de ${cliente.sigla}`} tamanho="m"
      rodape={(
        <>
          {contato && <Botao variante="perigo" icone={Trash2} onClick={() => void desativar()} className="mr-auto">Tirar contato</Botao>}
          <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={enviando}>Salvar contato</Botao>
        </>
      )}>
      <form id={idForm} className="cad-form" noValidate onSubmit={(e) => { e.preventDefault(); void salvar() }}>
        <div className="cad-grade-2">
          <Campo rotulo="Nome" value={nome} maxLength={120} data-autofocus="" onChange={(e) => setNome(e.target.value)}
            erro={tentou && !nome.trim() ? 'Escreva o nome.' : erroDoCampo(erro, 'nome')} />
          <Campo rotulo="Cargo" opcional value={cargo} maxLength={80} placeholder="Marketing" onChange={(e) => setCargo(e.target.value)} />
          <Campo rotulo="WhatsApp" opcional type="tel" value={whatsapp} maxLength={40} placeholder="+55 41 99999-0000" onChange={(e) => setWhatsapp(e.target.value)} />
          <Campo rotulo="E-mail" opcional type="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="cad-check-lista">
          <Checkbox checked={aprova} onChange={(e) => setAprova(e.target.checked)} descricao="Pode decidir pelo link de aprovação.">Aprova peças</Checkbox>
          <Checkbox checked={padrao} onChange={(e) => setPadrao(e.target.checked)} descricao="Vem escolhido ao enviar e ao registrar o retorno. Só um por cliente.">Contato padrão</Checkbox>
        </div>
        {erro && !erroDoCampo(erro, 'nome') ? <Faixa tom="perigo">{mensagemGeral(erro)}</Faixa> : null}
      </form>
    </Modal>
  )
}

export function Contatos({ cliente, podeEditar, novo, setNovo }: { cliente: Cliente; podeEditar: boolean; novo: boolean; setNovo(v: boolean): void }) {
  const [editando, setEditando] = useState<ClienteContato | null>(null)
  const ativos = cliente.contatos.filter((c) => c.ativo).sort((a, b) => Number(b.padrao) - Number(a.padrao) || colacao.compare(a.nome, b.nome))
  return (
    <Painel titulo="Contatos" icone={Contact} id="cad-contatos"
      acoes={podeEditar ? <Botao tamanho="p" variante="ghost" icone={Plus} onClick={() => setNovo(true)}>Contato</Botao> : undefined}>
      {ativos.length === 0 ? (
        <div className="cad-painel-corpo"><p className="cad-nota">Nenhum contato. Cadastre quem aprova as peças.</p></div>
      ) : (
        <ul className="cad-lista">
          {ativos.map((c) => (
            <li key={c.id} className="cad-linha">
              <div className="cad-linha-principal">
                <span className="cad-linha-nome">
                  <span>{c.nome}</span>
                  {c.padrao && <Pilula tom="acento" icone={Star}>Padrão</Pilula>}
                  {!c.aprova && <Pilula>Não aprova</Pilula>}
                </span>
                <span className="cad-linha-meta">
                  {c.cargo && <span>{c.cargo}</span>}
                  {c.whatsapp && <span><MessageCircle aria-hidden="true" />{c.whatsapp}</span>}
                  {c.email && <span><Mail aria-hidden="true" />{c.email}</span>}
                </span>
              </div>
              {podeEditar && <BotaoIcone icone={Pencil} rotulo={`Editar ${c.nome}`} tamanho="p" onClick={() => setEditando(c)} />}
            </li>
          ))}
        </ul>
      )}
      {(novo || editando) && <DialogoContato cliente={cliente} contato={editando} aoFechar={() => { setNovo(false); setEditando(null) }} />}
    </Painel>
  )
}

// ─────────────────────────────── pasta de saída e links ───────────────────────────────

export const ROTULO_LINK: Record<TipoLinkCliente, string> = {
  drive: 'Drive', marca: 'Marca', acessos: 'Acessos (cofre)', site: 'Site', redes: 'Redes sociais', outro: 'Outro',
}

function DialogoLink({ cliente, link, aoFechar }: { cliente: Cliente; link: ClienteLink | null; aoFechar(): void }) {
  const qc = useQueryClient()
  const idForm = useId()
  const [tipo, setTipo] = useState<TipoLinkCliente>(link?.tipo ?? 'drive')
  const [rotulo, setRotulo] = useState(link?.rotulo ?? '')
  const [url, setUrl] = useState(link?.url ?? '')
  const [erro, setErro] = useState<unknown>(null)
  const [enviando, setEnviando] = useState(false)
  const [tentou, setTentou] = useState(false)
  const urlOk = /^https:\/\/[^\s]+$/i.test(url.trim())

  async function salvar() {
    setTentou(true)
    setErro(null)
    if (!rotulo.trim() || !urlOk) return
    setEnviando(true)
    try {
      const dados = { tipo, rotulo: rotulo.trim(), url: url.trim() }
      if (link) await editarLink(qc, cliente, link, dados)
      else await criarLink(qc, cliente, dados)
      aoFechar()
    } catch (e) {
      setErro(e)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal aberto aoFechar={aoFechar} titulo={link ? 'Editar link' : `Novo link de ${cliente.sigla}`} tamanho="m"
      rodape={(
        <>
          <Botao variante="secundario" onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" form={idForm} variante="primario" carregando={enviando}>Salvar link</Botao>
        </>
      )}>
      <form id={idForm} className="cad-form" noValidate onSubmit={(e) => { e.preventDefault(); void salvar() }}>
        <div className="cad-grade-2">
          <Selecao rotulo="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoLinkCliente)}
            opcoes={TIPOS_LINK_CLIENTE.map((t) => ({ valor: t, rotulo: ROTULO_LINK[t] }))} />
          <Campo rotulo="Nome" value={rotulo} maxLength={80} placeholder={tipo === 'drive' ? 'Pasta do cliente' : 'Manual da marca'} data-autofocus=""
            onChange={(e) => setRotulo(e.target.value)} erro={tentou && !rotulo.trim() ? 'Dê um nome ao link.' : erroDoCampo(erro, 'rotulo')} />
        </div>
        <Campo rotulo="Endereço" type="url" value={url} maxLength={2000} placeholder="https://" onChange={(e) => setUrl(e.target.value)}
          erro={tentou && !urlOk ? 'Use um endereço que comece com https://' : erroDoCampo(erro, 'url')}
          ajuda={tipo === 'acessos' ? 'O link do cofre de senhas. Nunca a senha em si.' : 'Só endereços https.'} />
        {erro && !erroDoCampo(erro, 'url') && !erroDoCampo(erro, 'rotulo') ? <Faixa tom="perigo">{mensagemGeral(erro)}</Faixa> : null}
      </form>
    </Modal>
  )
}

function PastaSaida({ cliente, podeEditar }: { cliente: Cliente; podeEditar: boolean }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(cliente.pastaSaida ?? '')
  async function salvar() {
    try {
      await editarCliente(qc, cliente, { pastaSaida: texto.trim() || null })
      setEditando(false)
    } catch (e) { avisarErro(e) }
  }
  if (editando) {
    return (
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void salvar() }}>
        <Campo classeGrupo="flex-1 min-w-[220px]" rotulo="Pasta de saída" rotuloOculto tamanho="p" value={texto} maxLength={500}
          placeholder="M:\Clientes\HE\Saída" autoFocus onChange={(e) => setTexto(e.target.value)} />
        <Botao type="submit" tamanho="p" variante="secundario">Salvar</Botao>
        <Botao tamanho="p" variante="ghost" onClick={() => { setTexto(cliente.pastaSaida ?? ''); setEditando(false) }}>Cancelar</Botao>
      </form>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0">
      {cliente.pastaSaida ? <CopiarTexto texto={cliente.pastaSaida} rotulo="Copiar caminho" avisoCopiado="Caminho copiado." /> : <span className="cad-nota">Sem pasta de saída.</span>}
      {podeEditar && <BotaoIcone icone={Pencil} rotulo="Editar a pasta de saída" tamanho="p" onClick={() => setEditando(true)} />}
    </div>
  )
}

export function Links({ cliente, podeEditar }: { cliente: Cliente; podeEditar: boolean }) {
  const qc = useQueryClient()
  const abrirDialogo = useAbrirDialogo()
  const [editando, setEditando] = useState<ClienteLink | null | 'novo'>(null)
  async function excluir(l: ClienteLink) {
    const ok = await abrirDialogo('confirmar', { titulo: `Excluir o link ${l.rotulo}?`, mensagem: l.url, confirmar: 'Excluir link', perigo: true })
    if (!ok) return
    try { await excluirLink(qc, cliente, l) } catch (e) { avisarErro(e) }
  }
  return (
    <Painel titulo="Pasta e links" icone={FolderOpen} id="cad-links"
      acoes={podeEditar ? <Botao tamanho="p" variante="ghost" icone={Plus} onClick={() => setEditando('novo')}>Link</Botao> : undefined}>
      <div className="cad-painel-corpo">
        <dl className="cad-dl">
          <dt><FolderOpen aria-hidden="true" />Pasta de saída</dt>
          <dd><PastaSaida cliente={cliente} podeEditar={podeEditar} /></dd>
          {cliente.links.map((l) => (
            <div key={l.id} className="contents">
              <dt><Link2 aria-hidden="true" />{ROTULO_LINK[l.tipo]}</dt>
              <dd>
                {/^https:\/\//i.test(l.url)
                  ? <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 underline underline-offset-2">{l.rotulo}<ExternalLink width={13} height={13} aria-hidden="true" /></a>
                  : <span>{l.rotulo}</span>}
                {podeEditar && (
                  <>
                    <BotaoIcone icone={Pencil} rotulo={`Editar o link ${l.rotulo}`} tamanho="p" onClick={() => setEditando(l)} />
                    <BotaoIcone icone={Trash2} rotulo={`Excluir o link ${l.rotulo}`} tamanho="p" onClick={() => void excluir(l)} />
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
        {cliente.links.length === 0 && <p className="cad-nota">Nenhum link. Drive, manual da marca, redes e o cofre de acessos ficam aqui.</p>}
      </div>
      {editando && <DialogoLink cliente={cliente} link={editando === 'novo' ? null : editando} aoFechar={() => setEditando(null)} />}
    </Painel>
  )
}

// ─────────────────────────────── responsáveis por equipe ───────────────────────────────

export function Responsaveis({ cliente, podeEditar }: { cliente: Cliente; podeEditar: boolean }) {
  const qc = useQueryClient()
  const equipes = useEquipes().filter((e) => e.ativa).sort((a, b) => a.pos - b.pos)
  const usuarios = useUsuarios()
  const opcoesAm = useOpcoesAm(cliente.atendimentoId)
  const am = cliente.atendimentoId ? usuarios.find((u) => u.id === cliente.atendimentoId) : undefined

  async function mudar(equipeId: Id, usuarioId: Id | null) {
    const outros = cliente.responsaveis.filter((r) => r.equipeId !== equipeId)
    try {
      await definirResponsaveis(qc, cliente, usuarioId ? [...outros, { equipeId, usuarioId }] : outros)
    } catch (e) { avisarErro(e) }
  }

  return (
    <Painel titulo="Quem cuida" icone={UsersRound} id="cad-responsaveis">
      <div className="cad-painel-corpo">
        <dl className="cad-dl">
          <dt>Atendimento (AM)</dt>
          <dd>
            {podeEditar ? (
              <Selecao rotulo="Atendimento do cliente" rotuloOculto tamanho="p" value={cliente.atendimentoId ?? ''} vazia="Sem AM" opcoes={opcoesAm}
                onChange={async (e) => { try { await editarCliente(qc, cliente, { atendimentoId: e.target.value || null }) } catch (erro) { avisarErro(erro) } }} />
            ) : am ? <span className="cad-pessoa"><Avatar pessoa={am} tamanho={22} /><span>{am.nome}</span></span> : <span className="cad-nota">Sem AM</span>}
          </dd>
          {equipes.filter((e) => e.slug !== 'atendimento').map((e) => {
            const atual = cliente.responsaveis.find((r) => r.equipeId === e.id)
            const pessoa = atual ? usuarios.find((u) => u.id === atual.usuarioId) : undefined
            const membros = membrosAtivos(e, usuarios)
            const opcoes = [...(pessoa && !membros.some((m) => m.id === pessoa.id) ? [pessoa] : []), ...membros]
            return (
              <div key={e.id} className="contents">
                <dt><span className="cad-ponto" data-cor={e.cor} aria-hidden="true" />{e.nome}</dt>
                <dd>
                  {podeEditar ? (
                    <Selecao rotulo={`Responsável na equipe ${e.nome}`} rotuloOculto tamanho="p" value={atual?.usuarioId ?? ''}
                      vazia={membros.length ? 'Ninguém' : 'Equipe sem pessoas'} disabled={opcoes.length === 0}
                      opcoes={opcoes.map((u) => ({ valor: u.id, rotulo: nomeCurto(u) }))}
                      onChange={(ev) => void mudar(e.id, ev.target.value || null)} />
                  ) : pessoa ? <span className="cad-pessoa"><Avatar pessoa={pessoa} tamanho={22} /><span>{nomeCurto(pessoa)}</span></span> : <span className="cad-nota">Ninguém</span>}
                </dd>
              </div>
            )
          })}
        </dl>
        <p className="cad-nota">O responsável é sugerido como membro nas demandas novas da equipe e pode receber a demanda ao mudar de quadro.</p>
      </div>
    </Painel>
  )
}
