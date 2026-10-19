/**
 * Diálogo `agenda-evento` (F9): os detalhes de um evento das agendas externas, só leitura. Popover ancorado no item no
 * desktop, folha no celular (a moldura decide). Título, dia e horário, a agenda, local, [Entrar na reunião] (só https:
 * em Meet, Zoom e Teams, conferido de novo aqui) e a descrição em texto puro com as quebras. Evento privado: "Ocupado"
 * e nada disso (toda a equipe vê a Agenda).
 */
import { ExternalLink, Lock, MapPin, Video } from 'lucide-react'
import { linkReuniaoValido } from '@shared/logica/agenda-endereco.ts'
import type { PropsDialogo } from '../../extensoes/tipos.ts'
import { MolduraDialogo } from '../../dialogos/index.ts'
import { propsBotao } from '../../ui/Botao.tsx'
import { TextoPuro } from '../../ui/Texto.tsx'
import { horarioDoEvento } from './logica.ts'
import './agenda.css'

export default function DialogoEvento({ params }: PropsDialogo<'agenda-evento'>) {
  const { evento: e, agenda } = params
  const link = e.privado ? null : linkReuniaoValido(e.linkReuniao)
  const marcas = [e.livre ? 'Livre' : null, e.tentativo ? 'Talvez' : null].filter(Boolean)
  return (
    <MolduraDialogo titulo={e.titulo} largura={360}>
      <div className="agd-evento">
        <p className="agd-evento-quando">{horarioDoEvento(e)}</p>
        <p className="agd-evento-agenda" data-cor={agenda.cor}>
          <span className="agd-chip-ponto" aria-hidden="true" />
          <span>{agenda.nome}</span>
          {marcas.length > 0 && <span className="agd-evento-marca">{marcas.join(' · ')}</span>}
        </p>
        {e.privado ? (
          <p className="agd-evento-privado"><Lock aria-hidden="true" />Evento particular: os detalhes ficam só no Google Agenda.</p>
        ) : (
          <>
            {e.local && (
              <div className="agd-evento-linha">
                <MapPin aria-hidden="true" />
                <TextoPuro texto={e.local} className="agd-evento-local" />
              </div>
            )}
            {link && (
              <a href={link} target="_blank" rel="noopener noreferrer" {...propsBotao({ variante: 'primario', tamanho: 'p', className: 'agd-evento-entrar' })}>
                <Video aria-hidden="true" />Entrar na reunião<ExternalLink aria-hidden="true" className="agd-evento-externo" />
              </a>
            )}
            {e.descricao && <TextoPuro texto={e.descricao} className="agd-evento-descricao" />}
          </>
        )}
      </div>
    </MolduraDialogo>
  )
}
