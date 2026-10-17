/**
 * "Copiar para WhatsApp" (F2; API.md §6): o texto pronto do servidor (envio, lembrete com o mesmo link, aprovado,
 * ajuste), que dá para retocar antes de copiar. O Início (F3) abre com `modelo: 'lembrete'`.
 */
import { useEffect, useId, useState } from 'react'
import { Copy } from 'lucide-react'
import type { ModeloWhatsapp } from '@shared/tipos/index.ts'
import type { PropsDialogo } from '../../../extensoes/tipos.ts'
import { mensagemDeErro } from '../../../api/cliente.ts'
import { MolduraDialogo } from '../../../dialogos/Moldura.tsx'
import { avisar } from '../../../ui/avisos.tsx'
import { Abas } from '../../../ui/Abas.tsx'
import { Botao } from '../../../ui/Botao.tsx'
import { EsqueletoLinhas } from '../../../ui/Indicadores.tsx'
import { copiarParaAreaDeTransferencia } from '../../../ui/Texto.tsx'
import { textoWhatsapp } from '../api.ts'
import { NaoEncontrada, useDemandaAlvo } from './comum.tsx'

const MODELOS: { id: ModeloWhatsapp; rotulo: string }[] = [
  { id: 'envio', rotulo: 'Envio' }, { id: 'lembrete', rotulo: 'Lembrete' }, { id: 'aprovado', rotulo: 'Aprovado' }, { id: 'ajuste', rotulo: 'Ajuste' },
]

export default function CopiarWhatsapp({ params, fechar }: PropsDialogo<'copiar-whatsapp'>) {
  const d = useDemandaAlvo(params.demandaId)
  const idBase = useId()
  const [modelo, setModelo] = useState<ModeloWhatsapp>(params.modelo)
  const [texto, setTexto] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    const c = new AbortController()
    setTexto(null)
    setErro(null)
    textoWhatsapp(params.demandaId, modelo, c.signal)
      .then((r) => setTexto(r.texto))
      .catch((e) => { if (!(e instanceof DOMException)) setErro(mensagemDeErro(e)) })
    return () => c.abort()
  }, [params.demandaId, modelo])

  if (!d) return <NaoEncontrada fechar={() => fechar(null)} />

  async function copiar() {
    if (!texto) return
    const ok = await copiarParaAreaDeTransferencia(texto)
    if (ok) {
      avisar('Texto copiado. Cole no WhatsApp.', { tipo: 'sucesso', duracao: 2500 })
      fechar({ copiado: true })
    } else {
      avisar('Não foi possível copiar. Selecione o texto e copie com Ctrl+C.', { tipo: 'erro' })
    }
  }

  return (
    <MolduraDialogo titulo="Copiar para WhatsApp" descricao={`#${d.numero} ${d.titulo}`} tamanho="m"
      rodape={(
        <>
          <Botao onClick={() => fechar(null)}>Fechar</Botao>
          <Botao variante="primario" icone={Copy} disabled={!texto} onClick={() => void copiar()}>Copiar</Botao>
        </>
      )}>
      <div className="cic-form">
        <Abas rotulo="Modelo do texto" ativa={modelo} aoMudar={(m) => setModelo(m)} idBase={idBase}
          abas={MODELOS.map((m) => ({ id: m.id, rotulo: m.rotulo }))} />
        <div id={`${idBase}-painel-${modelo}`} role="tabpanel" aria-labelledby={`${idBase}-aba-${modelo}`} className="cic-campo">
          {erro ? <p className="cic-vazio" role="status">{erro}</p> : texto === null ? <EsqueletoLinhas linhas={3} /> : (
            <>
              <label className="sr-only" htmlFor={`${idBase}-texto`}>Texto</label>
              <textarea id={`${idBase}-texto`} className="cic-texto-whatsapp" value={texto} onChange={(e) => setTexto(e.target.value)} />
              <p className="cic-ajuda">Dá para retocar antes de copiar.</p>
            </>
          )}
        </div>
      </div>
    </MolduraDialogo>
  )
}
