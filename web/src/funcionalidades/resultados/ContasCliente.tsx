/**
 * "Contas de resultados" (F8; seção da aba Configurações do cliente, ordem 100): as contas da Windsor ligadas a este
 * cliente, por canal; [Ligar conta] abre o diálogo `resultados-ligar-conta` e [Desligar] pede confirmação. Só quem
 * edita o cliente (admin; atendimento da carteira e dos sem AM) liga e desliga; os outros só veem.
 */
import { useQueryClient } from '@tanstack/react-query'
import { Link2, Unlink } from 'lucide-react'
import { CONECTORES_WINDSOR, ROTULO_CONECTOR, type Cliente, type ContaLigada } from '@shared/tipos/index.ts'
import { avisarErro } from '../../api/acoes.ts'
import { useUsuarios } from '../../api/seletores.ts'
import { useAbrirDialogo } from '../../dialogos/index.ts'
import { avisar } from '../../ui/avisos.tsx'
import { Botao } from '../../ui/Botao.tsx'
import { EsqueletoLinhas } from '../../ui/Indicadores.tsx'
import { Faixa, nomeCurto, Painel } from '../cadastros/comum.tsx'
import { desligarConta, useContasLigadas } from './api.ts'
import { diaMes } from './logica.ts'
import { dataLocalDe } from '@shared/logica/datas.ts'
import './dialogos.ts'
import './resultados.css'

export default function ContasCliente({ cliente, podeEditar }: { cliente: Cliente; podeEditar: boolean }) {
  const qc = useQueryClient()
  const abrirDialogo = useAbrirDialogo()
  const consulta = useContasLigadas(cliente.id)
  const usuarios = useUsuarios()

  async function desligar(c: ContaLigada) {
    const ok = await abrirDialogo('confirmar', {
      titulo: `Desligar ${c.nome}?`, confirmar: 'Desligar conta', perigo: true,
      mensagem: `Os resultados de ${ROTULO_CONECTOR[c.conector]} desta conta saem da aba Resultados de ${cliente.sigla}. Dá para ligar de novo depois.`,
    })
    if (!ok) return
    try {
      await desligarConta(qc, cliente.id, c.id)
      avisar(`${c.nome} desligada de ${cliente.sigla}.`, { tipo: 'sucesso' })
    } catch (e) {
      avisarErro(e, { titulo: 'Não foi possível desligar a conta.' })
    }
  }

  const quem = (c: ContaLigada) => {
    const u = c.ligadaPor ? usuarios.find((x) => x.id === c.ligadaPor) : undefined
    return `ligada${u ? ` por ${nomeCurto(u)}` : ''} em ${diaMes(dataLocalDe(c.ligadaEm))}`
  }

  return (
    <Painel titulo="Contas de resultados" icone={Link2} id="res-contas-cliente">
      <div className="cad-painel-corpo">
        <p className="cad-nota">As contas da Windsor cujos números aparecem na aba Resultados. Um cliente pode ter várias contas por canal.</p>
        {!podeEditar && <Faixa tom="info">Só o atendimento do cliente e o admin ligam e desligam contas.</Faixa>}
        {consulta.isPending ? <EsqueletoLinhas linhas={3} /> : consulta.isError ? (
          <Faixa tom="perigo" acoes={<Botao tamanho="p" variante="secundario" onClick={() => void consulta.refetch()}>Tentar de novo</Botao>}>
            Não foi possível carregar as contas. {consulta.error.mensagem}
          </Faixa>
        ) : (
          <div className="res-contas-grupos">
            {CONECTORES_WINDSOR.map((conector) => {
              const contas = consulta.data.filter((c) => c.conector === conector)
              return (
                <section key={conector} className="res-contas-grupo" aria-label={ROTULO_CONECTOR[conector]}>
                  <div className="res-contas-cabeca">
                    <h3 className="res-contas-titulo">{ROTULO_CONECTOR[conector]}</h3>
                    {podeEditar && (
                      <Botao tamanho="p" variante="secundario" icone={Link2}
                        onClick={() => void abrirDialogo('resultados-ligar-conta', { clienteId: cliente.id, conector })}>
                        Ligar conta
                      </Botao>
                    )}
                  </div>
                  {contas.length === 0 ? <p className="cad-nota">Nenhuma conta ligada.</p> : (
                    <ul className="cad-lista">
                      {contas.map((c) => (
                        <li key={c.id} className="cad-linha">
                          <div className="cad-linha-principal">
                            <span className="cad-linha-nome"><span>{c.nome}</span></span>
                            <span className="cad-linha-meta"><span className="tabular">{c.contaId}</span><span>{quem(c)}</span></span>
                          </div>
                          {podeEditar && (
                            <Botao tamanho="p" variante="ghost" icone={Unlink} onClick={() => void desligar(c)} aria-label={`Desligar ${c.nome}`}>Desligar</Botao>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </Painel>
  )
}
