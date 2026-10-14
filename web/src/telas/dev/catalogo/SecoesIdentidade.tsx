/** Catálogo: avatares e chips, indicadores, abas, cores e datas. */
import { useId, useState } from 'react'
import { CalendarRange, Columns3, Inbox, LayoutList, Search } from 'lucide-react'
import type { Cor, DataLocal, HoraLocal } from '@shared/tipos/index.ts'
import { hojeLocal, somarDias } from '../../../lib/datas.ts'
import { Abas, painelAba } from '../../../ui/Abas.tsx'
import { Avatar, PilhaAvatares } from '../../../ui/Avatar.tsx'
import { Botao } from '../../../ui/Botao.tsx'
import { GrupoCampo } from '../../../ui/Campo.tsx'
import { ChipCliente, ChipEtiqueta } from '../../../ui/Chips.tsx'
import { BarraProgresso, Contador, Esqueleto, EsqueletoLinhas, EstadoVazio } from '../../../ui/Indicadores.tsx'
import { SeletorCor } from '../../../ui/SeletorCor.tsx'
import { CalendarioMes, SeletorData, SeletorHora, type FeriadoUi } from '../../../ui/SeletorData.tsx'
import { Amostra, Bloco, Linha } from './Amostra.tsx'
import { CLIENTES, ETIQUETAS, PESSOAS } from './dados.ts'

export const FERIADOS: FeriadoUi[] = [
  { data: '2026-10-12', nome: 'Nossa Senhora Aparecida' },
  { data: '2026-11-02', nome: 'Finados' },
  { data: '2026-11-15', nome: 'Proclamação da República' },
  { data: '2026-11-20', nome: 'Consciência Negra' },
  { data: '2026-12-25', nome: 'Natal' },
]

function DemoEtiquetas() {
  const [recolhidas, setRecolhidas] = useState(false)
  return (
    <Bloco titulo="Etiquetas (clique recolhe todas, como no Trello)">
      <Linha>
        {ETIQUETAS.map((e) => <ChipEtiqueta key={`${e.nome}-${e.cor}`} etiqueta={e} recolhida={recolhidas} aoClicar={() => setRecolhidas(!recolhidas)} />)}
      </Linha>
    </Bloco>
  )
}

export function SecaoIdentidade() {
  return (
    <Amostra rotulo="Pessoas, etiquetas e clientes">
      <Bloco titulo="Avatares (cor da pessoa; nunca laranja)">
        <Linha>
          {PESSOAS.map((p) => <Avatar key={p.id} pessoa={p} tamanho={32} />)}
          <Avatar pessoa={{ nome: 'Pessoa desativada', cor: 'grafite', ativo: false }} tamanho={32} />
          <Avatar pessoa={PESSOAS[0]} tamanho={24} />
          <Avatar pessoa={PESSOAS[1]} tamanho={40} />
        </Linha>
      </Bloco>
      <Bloco titulo="Pilha (até 3 + o resto)">
        <Linha>
          <PilhaAvatares pessoas={PESSOAS.slice(0, 2)} />
          <PilhaAvatares pessoas={PESSOAS.slice(0, 5)} />
          <PilhaAvatares pessoas={PESSOAS} max={4} tamanho={28} />
        </Linha>
      </Bloco>
      <DemoEtiquetas />
      <Bloco titulo="Clientes (sigla na cor; o nome no hover)">
        <Linha>
          {CLIENTES.map((c) => <ChipCliente key={c.id} cliente={c} />)}
          <ChipCliente cliente={CLIENTES[0]} tamanho="m" comNome />
        </Linha>
      </Bloco>
    </Amostra>
  )
}

function DemoAbas() {
  const [visao, setVisao] = useState<'quadro' | 'lista' | 'calendario'>('quadro')
  const [secao, setSecao] = useState<'pessoas' | 'convites' | 'equipes'>('pessoas')
  const base = useId()
  return (
    <>
      <Bloco titulo="Segmento (setas, Home e End)">
        <Abas rotulo="Visão do quadro" ativa={visao} aoMudar={setVisao} abas={[
          { id: 'quadro', rotulo: 'Quadro', icone: Columns3 },
          { id: 'lista', rotulo: 'Lista', icone: LayoutList },
          { id: 'calendario', rotulo: 'Calendário', icone: CalendarRange },
        ]} />
      </Bloco>
      <Bloco titulo="Linha, com contador">
        <Abas rotulo="Configurações" variante="linha" idBase={base} ativa={secao} aoMudar={setSecao} abas={[
          { id: 'pessoas', rotulo: 'Pessoas', contador: 12 },
          { id: 'convites', rotulo: 'Convites', contador: 2 },
          { id: 'equipes', rotulo: 'Equipes' },
        ]} />
        <div {...painelAba(base, secao, secao)} className="text-meta text-fg-2">Painel de “{secao}”.</div>
      </Bloco>
    </>
  )
}

export function SecaoIndicadores() {
  return (
    <>
      <Amostra rotulo="Contadores, progresso e esqueleto">
        <Bloco titulo="Contador">
          <Linha>
            <Contador valor={12} rotulo="demandas" />
            <Contador valor={6} limite={5} rotulo="demandas" />
            <Contador valor={3} tom="suave" />
            <Contador valor={1255} tom="acento" />
          </Linha>
        </Bloco>
        <Bloco titulo="Barra de progresso">
          <BarraProgresso valor={0} max={5} mostrarRotulo rotulo="Checklist" />
          <BarraProgresso valor={3} max={5} mostrarRotulo rotulo="Checklist" />
          <BarraProgresso valor={5} max={5} mostrarRotulo rotulo="Checklist" />
        </Bloco>
        <Bloco titulo="Esqueleto (nada de spinner na tela toda)">
          <div className="flex items-center gap-3">
            <Esqueleto largura={32} altura={32} raio={999} />
            <div className="flex flex-1 flex-col gap-2"><Esqueleto largura="60%" /><Esqueleto largura="35%" altura={11} /></div>
          </div>
          <EsqueletoLinhas linhas={3} />
        </Bloco>
        <DemoAbas />
      </Amostra>
      <Amostra rotulo="Estado vazio">
        <EstadoVazio icone={Inbox} titulo="Nenhuma demanda ainda." texto="Crie a primeira no rodapé de uma coluna ou com Shift+N."
          acoes={<Botao variante="secundario">Nova demanda</Botao>} />
        <EstadoVazio tamanho="p" icone={Search} titulo="Nada encontrado para “walmart”." texto="Tente a sigla do cliente ou o número." />
      </Amostra>
    </>
  )
}

function DemoDatas() {
  const hoje = hojeLocal()
  const [cor, setCor] = useState<Cor | null>('rosa')
  const [corColuna, setCorColuna] = useState<Cor | null>(null)
  const [prazo, setPrazo] = useState<DataLocal | null>(somarDias(hoje, 2))
  const [hora, setHora] = useState<HoraLocal | null>('18:00')
  const [inicio, setInicio] = useState<DataLocal | null>(null)
  const [soHora, setSoHora] = useState<HoraLocal | null>('09:30')
  const [dia, setDia] = useState<DataLocal | null>(hoje)
  return (
    <>
      <div className="cat-grade">
        <Bloco titulo="Cor da etiqueta">
          <SeletorCor rotulo="Cor da etiqueta" valor={cor} aoMudar={setCor} />
        </Bloco>
        <Bloco titulo="Cor da coluna (com “sem cor”)">
          <SeletorCor rotulo="Cor da coluna" valor={corColuna} aoMudar={setCorColuna} permitirSemCor />
        </Bloco>
      </div>
      <div className="cat-grade">
        <GrupoCampo rotulo="Prazo (com hora)">
          {(aria) => <SeletorData {...aria} rotulo="Prazo" valor={prazo} hora={hora} comHora feriados={FERIADOS} aoMudar={(d, h) => { setPrazo(d); setHora(h) }} />}
        </GrupoCampo>
        <GrupoCampo rotulo="Início" opcional>
          {(aria) => <SeletorData {...aria} rotulo="Início" valor={inicio} feriados={FERIADOS} aoMudar={(d) => setInicio(d)} />}
        </GrupoCampo>
        <GrupoCampo rotulo="Hora">
          {(aria) => <SeletorHora {...aria} valor={soHora} aoMudar={setSoHora} permitirLimpar />}
        </GrupoCampo>
      </div>
      <Bloco titulo="Calendário do mês (←→ dia, ↑↓ semana, PageUp/PageDown mês)">
        <div className="ui-data" style={{ padding: 0 }}>
          <CalendarioMes valor={dia} aoEscolher={setDia} feriados={FERIADOS} rotulo="Escolha um dia" />
        </div>
      </Bloco>
    </>
  )
}

export function SecaoCoresEDatas() {
  return (
    <Amostra rotulo="Seletores de cor e de data">
      <DemoDatas />
    </Amostra>
  )
}
