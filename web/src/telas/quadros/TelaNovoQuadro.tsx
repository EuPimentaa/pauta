/**
 * /quadros/novo (sobreposta, admin; F5): o "Novo quadro" ou, com ?equipes=1, "Criar os quadros das equipes" dos
 * Primeiros passos. ?equipe=<id> já escolhe a equipe no Novo quadro. Fechar volta para a tela de baixo.
 */
import { useSearchParams } from 'react-router'
import FormNovoQuadro from '../../funcionalidades/cadastros/FormNovoQuadro.tsx'
import QuadrosDasEquipes from '../../funcionalidades/cadastros/QuadrosDasEquipes.tsx'
import { useTituloAba } from '../../lib/app.ts'
import { useFecharSobreposta } from '../../sessao/sobreposta.tsx'

export default function TelaNovoQuadro() {
  const [busca] = useSearchParams()
  const fechar = useFecharSobreposta()
  const equipes = busca.get('equipes') === '1'
  useTituloAba(equipes ? 'Criar os quadros das equipes' : 'Novo quadro')
  if (equipes) return <QuadrosDasEquipes fechar={fechar} />
  return <FormNovoQuadro key={busca.get('equipe') ?? ''} fechar={fechar} equipeInicial={busca.get('equipe')} />
}
