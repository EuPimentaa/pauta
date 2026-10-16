/**
 * Cliente (lateral 200): o cliente da demanda (trocar, tirar ou "Criar cliente XYZ" pelo diálogo `criar-cliente` do
 * F5), o atendimento (AM; só atendimento e admin trocam), os links do cliente (Drive, marca, Acessos no cofre) e a
 * pasta de saída como texto com [Copiar]. Depois de uma versão enviada o cliente fica fixo: o popover explica e
 * oferece "Copiar demanda".
 */
import { useState } from 'react'
import { ExternalLink, Headset, KeyRound, Store } from 'lucide-react'
import type { ClienteResumo, Id, TipoLinkCliente, UsuarioResumo } from '@shared/tipos/index.ts'
import type { ContextoDemanda } from '../../../extensoes/tipos.ts'
import { useClienteDetalhe } from '../../../api/clientes.ts'
import { useAcoes } from '../../../api/demandas.ts'
import { useClientes } from '../../../api/seletores.ts'
import { abrirDialogo } from '../../../dialogos/estado.ts'
import { Botao } from '../../../ui/Botao.tsx'
import { GrupoCampo } from '../../../ui/Campo.tsx'
import { ChipCliente } from '../../../ui/Chips.tsx'
import { Combobox } from '../../../ui/Combobox.tsx'
import { Popover } from '../../../ui/Popover.tsx'
import { CopiarTexto } from '../../../ui/Texto.tsx'
import { Propriedade, Vazio, nomeCurto, useUsuarios } from '../comum.tsx'

const ROTULO_LINK: Record<TipoLinkCliente, string> = {
  drive: 'Drive', marca: 'Marca', acessos: 'Acessos (cofre)', site: 'Site', redes: 'Redes', outro: 'Link',
}
const SIGLA = /^[A-Z0-9]{1,12}$/

function TrocarCliente({ ctx, ancora, fechar }: { ctx: ContextoDemanda; ancora: HTMLElement; fechar(): void }) {
  const acoes = useAcoes()
  const clientes = useClientes()
  const d = ctx.demanda
  const fixo = !!d.versaoEnviadaId
  const [escolhido, setEscolhido] = useState<ClienteResumo | null>(ctx.cliente)

  async function salvar(clienteId: Id | null) {
    fechar()
    if (clienteId !== d.clienteId) await acoes.editar(d, { clienteId })
  }
  async function criar(sigla: string) {
    const r = await abrirDialogo('criar-cliente', { sigla })
    if (r) await salvar(r.cliente.id)
  }

  return (
    <Popover aberto aoFechar={fechar} ancora={ancora} titulo="Cliente" mostrarTitulo largura={320}>
      <div className="ui-popover-corpo mdl-formulario">
        {fixo ? (
          <>
            <p className="text-body text-fg">
              Esta demanda já foi enviada ao cliente {ctx.cliente?.sigla}. O link e a trilha de aprovação são dele.
              Para outro cliente, copie a demanda.
            </p>
            <div className="mdl-formulario-botoes">
              <Botao variante="secundario" tamanho="p" onClick={() => { fechar(); void abrirDialogo('copiar-demanda', { demandaId: d.id }) }}>
                Copiar demanda
              </Botao>
            </div>
          </>
        ) : (
          <>
            <GrupoCampo rotulo="Sigla ou nome">
              {(aria) => (
                <Combobox<ClienteResumo> {...aria} opcoes={clientes} valor={escolhido} idDe={(c) => c.id} rotuloDe={(c) => c.sigla}
                  detalheDe={(c) => c.nome} iconeDe={(c) => <span className="mdl-ponto" data-cor={c.cor} aria-hidden="true" />}
                  filtrar={(c, t) => `${c.sigla} ${c.nome} ${c.apelidos.join(' ')}`.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').includes(t)}
                  aoMudar={(c) => { setEscolhido(c); if (c) void salvar(c.id) }} placeholder="HE, Hospital…" vazio="Nenhum cliente com esse nome."
                  extra={(t) => {
                    const s = t.trim().toUpperCase()
                    return SIGLA.test(s) && !clientes.some((c) => c.sigla === s) ? { rotulo: `Criar cliente ${s}`, executar: () => void criar(s) } : null
                  }} />
              )}
            </GrupoCampo>
            {d.clienteId && (
              <div className="mdl-formulario-botoes">
                <Botao variante="ghost" tamanho="p" onClick={() => void salvar(null)}>Tirar o cliente</Botao>
              </div>
            )}
          </>
        )}
      </div>
    </Popover>
  )
}

function TrocarAtendimento({ ctx, ancora, fechar }: { ctx: ContextoDemanda; ancora: HTMLElement; fechar(): void }) {
  const acoes = useAcoes()
  const usuarios = useUsuarios()
  const opcoes = usuarios.filter((u) => u.ativo && (u.papel === 'atendimento' || u.papel === 'admin'))
  const atual = usuarios.find((u) => u.id === ctx.demanda.atendimentoId) ?? null
  async function salvar(id: Id | null) {
    fechar()
    if (id !== ctx.demanda.atendimentoId) await acoes.editar(ctx.demanda, { atendimentoId: id })
  }
  return (
    <Popover aberto aoFechar={fechar} ancora={ancora} titulo="Atendimento" mostrarTitulo largura={300}>
      <div className="ui-popover-corpo mdl-formulario">
        <GrupoCampo rotulo="Quem atende">
          {(aria) => (
            <Combobox<UsuarioResumo> {...aria} opcoes={opcoes} valor={atual} idDe={(u) => u.id} rotuloDe={(u) => u.nome} detalheDe={(u) => u.apelido ?? undefined}
              aoMudar={(u) => { if (u) void salvar(u.id) }} placeholder="Nome" />
          )}
        </GrupoCampo>
        {atual && <div className="mdl-formulario-botoes"><Botao variante="ghost" tamanho="p" onClick={() => void salvar(null)}>Sem atendimento</Botao></div>}
      </div>
    </Popover>
  )
}

function DoCliente({ ctx }: { ctx: ContextoDemanda }) {
  const q = useClienteDetalhe(ctx.demanda.clienteId)
  const links = (q.data?.links ?? []).filter((l) => /^https:\/\//i.test(l.url))
  const pasta = ctx.cliente?.pastaSaida
  if (!links.length && !pasta) return null
  return (
    <div className="mdl-cliente-extra">
      {links.length > 0 && (
        <div className="mdl-cliente-links">
          {links.map((l) => (
            <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer" title={l.rotulo}>
              {l.tipo === 'acessos' ? <KeyRound aria-hidden="true" /> : <ExternalLink aria-hidden="true" />}
              {l.tipo === 'outro' ? l.rotulo : ROTULO_LINK[l.tipo]}
            </a>
          ))}
        </div>
      )}
      {pasta && <CopiarTexto texto={pasta} rotulo="Copiar a pasta de saída" avisoCopiado="Pasta de saída copiada." />}
    </div>
  )
}

export default function Cliente({ ctx }: { ctx: ContextoDemanda }) {
  const usuarios = useUsuarios()
  const [aberto, setAberto] = useState<{ qual: 'cliente' | 'am'; ancora: HTMLElement } | null>(null)
  const d = ctx.demanda
  const am = d.atendimentoId ? usuarios.find((u) => u.id === d.atendimentoId) : undefined
  const so = ctx.somenteLeitura
  return (
    <>
      <Propriedade id="cliente" icone={Store} rotulo="Cliente" grupo desabilitado={so}
        abrir={(ancora) => setAberto({ qual: 'cliente', ancora })} dica={d.versaoEnviadaId ? 'O cliente fica fixo depois do envio.' : undefined}>
        {ctx.cliente ? <ChipCliente cliente={ctx.cliente} comNome /> : <Vazio>Sem cliente</Vazio>}
      </Propriedade>
      {ctx.cliente && <DoCliente ctx={ctx} />}
      {(am || ctx.atendimento) && (
        <Propriedade id="atendimento" icone={Headset} rotulo="Atendimento" desabilitado={so || !ctx.atendimento}
          abrir={(ancora) => setAberto({ qual: 'am', ancora })}>
          {am ? <span>{nomeCurto(am)}</span> : <Vazio>Ninguém</Vazio>}
        </Propriedade>
      )}
      {aberto?.qual === 'cliente' && <TrocarCliente ctx={ctx} ancora={aberto.ancora} fechar={() => setAberto(null)} />}
      {aberto?.qual === 'am' && <TrocarAtendimento ctx={ctx} ancora={aberto.ancora} fechar={() => setAberto(null)} />}
    </>
  )
}
