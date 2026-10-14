/** Rota desconhecida (PLANO §1.2): "Página não encontrada", com o caminho de volta. */
import { Compass } from 'lucide-react'
import { Link } from 'react-router'
import { useTituloAba } from '../lib/app.ts'
import { propsBotao } from '../ui/Botao.tsx'
import { EstadoVazio } from '../ui/Indicadores.tsx'

export function NaoEncontrada() {
  useTituloAba('Página não encontrada')
  return (
    <div className="grid flex-1 place-items-center p-6">
      <EstadoVazio
        icone={Compass}
        titulo="Página não encontrada."
        texto="O endereço pode ter mudado ou a página saiu do ar. Volte para o Início ou procure pelo menu."
        acoes={<Link to="/" {...propsBotao({ variante: 'secundario' })}>Ir para o Início</Link>}
      />
    </div>
  )
}
