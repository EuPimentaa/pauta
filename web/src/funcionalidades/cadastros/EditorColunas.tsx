/**
 * Editor das colunas sugeridas (Novo quadro e "Criar os quadros das equipes"): desmarcar, renomear, cor, papel e
 * ordem; as colunas das pessoas já vêm expandidas (com o avatar); as automações do modelo aparecem embaixo da coluna
 * de destino e somem junto com ela. "+ Adicionar coluna" acrescenta uma coluna comum no fim.
 */
import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2, Zap } from 'lucide-react'
import { PAPEIS_COLUNA, ROTULO_PAPEL_COLUNA, type GatilhoAutomacao, type PapelColuna, type UsuarioResumo } from '@shared/tipos/index.ts'
import { Avatar } from '../../ui/Avatar.tsx'
import { Botao, BotaoIcone } from '../../ui/Botao.tsx'
import { Campo, Selecao } from '../../ui/Campo.tsx'
import { Checkbox } from '../../ui/Checkbox.tsx'
import { BotaoCor, nomeCurto } from './comum.tsx'
import { FRASE_GATILHO, type ColunaPlano } from './logica.ts'

const OPCOES_PAPEL = PAPEIS_COLUNA.map((p) => ({ valor: p, rotulo: ROTULO_PAPEL_COLUNA[p] }))

export interface PropsEditorColunas {
  plano: ColunaPlano[]
  aoMudar(plano: ColunaPlano[]): void
  automacoes: Map<string, GatilhoAutomacao[]>
  usuarios: readonly UsuarioResumo[]
  erros?: Map<string, string>
  /** Nome do quadro (para os rótulos acessíveis). */
  rotulo: string
}

export function EditorColunas({ plano, aoMudar, automacoes, usuarios, erros, rotulo }: PropsEditorColunas) {
  const idNova = useId()
  const [nova, setNova] = useState('')
  const mudar = (chave: string, patch: Partial<ColunaPlano>) => aoMudar(plano.map((c) => (c.chave === chave ? { ...c, ...patch } : c)))
  const mover = (i: number, passo: -1 | 1) => {
    const j = i + passo
    if (j < 0 || j >= plano.length) return
    const lista = plano.slice()
    ;[lista[i], lista[j]] = [lista[j]!, lista[i]!]
    aoMudar(lista)
  }
  function adicionar() {
    const nome = nova.trim()
    if (!nome) return
    aoMudar([...plano, { chave: `nova-${Date.now().toString(36)}`, nome, cor: null, papel: 'normal', responsavelId: null, modeloColunaId: null, manter: true, nova: true }])
    setNova('')
  }
  const mantidas = plano.filter((c) => c.manter).length

  return (
    <div className="cad-colunas" role="group" aria-label={`Colunas de ${rotulo}`}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault() }}>
      {plano.length === 0 && <p className="cad-nota">Nenhuma coluna. Acrescente abaixo ou crie depois, no próprio quadro.</p>}
      {plano.map((c, i) => {
        const pessoa = c.responsavelId ? usuarios.find((u) => u.id === c.responsavelId) : undefined
        const gatilhos = automacoes.get(c.chave) ?? []
        const erro = erros?.get(c.chave)
        return (
          <div key={c.chave} className="cad-coluna" data-cor={c.manter && c.cor ? c.cor : undefined} data-desmarcada={c.manter ? undefined : ''}>
            {c.nova
              ? <BotaoIcone icone={Trash2} rotulo={`Tirar a coluna ${c.nome}`} tamanho="p" onClick={() => aoMudar(plano.filter((x) => x.chave !== c.chave))} />
              : <Checkbox tom="neutro" checked={c.manter} onChange={(e) => mudar(c.chave, { manter: e.target.checked })} aria-label={`Criar a coluna ${c.nome || i + 1}`} />}
            <BotaoCor valor={c.cor} rotulo={`Cor da coluna ${c.nome}`} permitirSemCor aoMudar={(cor) => mudar(c.chave, { cor })} desabilitado={!c.manter} />
            <Campo rotulo={`Nome da coluna ${i + 1}`} rotuloOculto tamanho="p" value={c.nome} maxLength={60} disabled={!c.manter}
              onChange={(e) => mudar(c.chave, { nome: e.target.value })} erro={erro} />
            {pessoa
              ? (
                <span className="cad-coluna-pessoa cad-coluna-papel">
                  <Avatar pessoa={pessoa} tamanho={22} />
                  <span>Coluna de {nomeCurto(pessoa)}</span>
                </span>
              )
              : (
                <Selecao classeGrupo="cad-coluna-papel" rotulo={`Papel da coluna ${c.nome}`} rotuloOculto tamanho="p" opcoes={OPCOES_PAPEL}
                  value={c.papel} disabled={!c.manter} onChange={(e) => mudar(c.chave, { papel: e.target.value as PapelColuna })} />
              )}
            <span className="cad-coluna-fim">
              <BotaoIcone icone={ArrowUp} rotulo={`Subir ${c.nome}`} tamanho="p" disabled={i === 0} onClick={() => mover(i, -1)} />
              <BotaoIcone icone={ArrowDown} rotulo={`Descer ${c.nome}`} tamanho="p" disabled={i === plano.length - 1} onClick={() => mover(i, 1)} />
            </span>
            {gatilhos.length > 0 && (
              <span className="cad-coluna-auto">
                <Zap aria-hidden="true" />
                {gatilhos.map((g) => FRASE_GATILHO[g]).join('; ')}.
                {!c.manter && ' Desmarcada: a automação não nasce.'}
              </span>
            )}
          </div>
        )
      })}
      {/* dentro do formulário do quadro: Enter acrescenta a coluna em vez de enviar o formulário (sem <form> aninhado) */}
      <div className="flex items-end gap-2">
        <Campo id={idNova} classeGrupo="flex-1" rotulo="Nova coluna" rotuloOculto tamanho="p" placeholder="+ Adicionar coluna (nome e Enter)"
          value={nova} maxLength={60} onChange={(e) => setNova(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }} />
        <Botao tamanho="p" variante="secundario" icone={Plus} disabled={!nova.trim()} onClick={adicionar}>Adicionar</Botao>
      </div>
      <p className="cad-nota">{mantidas === 0 ? 'O quadro nasce sem colunas.' : `${mantidas} ${mantidas === 1 ? 'coluna' : 'colunas'} no quadro.`}</p>
    </div>
  )
}
