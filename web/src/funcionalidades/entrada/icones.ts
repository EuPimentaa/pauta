/**
 * Ícones dos modelos de demanda (ModeloDemanda.icone guarda o nome lucide em kebab-case). Uma lista curta e
 * escolhida: importar o lucide inteiro poria centenas de ícones no pacote. Nome desconhecido cai no FileText.
 */
import {
  BookOpen, Briefcase, Brush, Calendar, Camera, ChartColumn, Clapperboard, FileText, GalleryHorizontal, Gift, Globe, Heart,
  Image, LayoutTemplate, Mail, Megaphone, Mic, Monitor, Music, Newspaper, Package, Palette, PenTool, Presentation, Printer,
  ShoppingBag, Smartphone, Sparkles, SquarePlay, Star, Store, Ticket, Type, Video, Wrench,
} from 'lucide-react'
import type { Icone } from '../../extensoes/tipos.ts'

export const ICONES_MODELO: readonly { nome: string; rotulo: string; Icone: Icone }[] = [
  { nome: 'image', rotulo: 'Imagem', Icone: Image },
  { nome: 'gallery-horizontal', rotulo: 'Carrossel', Icone: GalleryHorizontal },
  { nome: 'clapperboard', rotulo: 'Claquete', Icone: Clapperboard },
  { nome: 'smartphone', rotulo: 'Celular', Icone: Smartphone },
  { nome: 'video', rotulo: 'Vídeo', Icone: Video },
  { nome: 'square-play', rotulo: 'Play', Icone: SquarePlay },
  { nome: 'camera', rotulo: 'Câmera', Icone: Camera },
  { nome: 'mic', rotulo: 'Microfone', Icone: Mic },
  { nome: 'music', rotulo: 'Música', Icone: Music },
  { nome: 'globe', rotulo: 'Site', Icone: Globe },
  { nome: 'monitor', rotulo: 'Tela', Icone: Monitor },
  { nome: 'layout-template', rotulo: 'Layout', Icone: LayoutTemplate },
  { nome: 'wrench', rotulo: 'Ajuste', Icone: Wrench },
  { nome: 'chart-column', rotulo: 'Relatório', Icone: ChartColumn },
  { nome: 'presentation', rotulo: 'Apresentação', Icone: Presentation },
  { nome: 'megaphone', rotulo: 'Anúncio', Icone: Megaphone },
  { nome: 'newspaper', rotulo: 'Notícia', Icone: Newspaper },
  { nome: 'mail', rotulo: 'E-mail', Icone: Mail },
  { nome: 'printer', rotulo: 'Impresso', Icone: Printer },
  { nome: 'pen-tool', rotulo: 'Vetor', Icone: PenTool },
  { nome: 'palette', rotulo: 'Paleta', Icone: Palette },
  { nome: 'brush', rotulo: 'Pincel', Icone: Brush },
  { nome: 'type', rotulo: 'Texto', Icone: Type },
  { nome: 'book-open', rotulo: 'Livro', Icone: BookOpen },
  { nome: 'calendar', rotulo: 'Agenda', Icone: Calendar },
  { nome: 'ticket', rotulo: 'Evento', Icone: Ticket },
  { nome: 'gift', rotulo: 'Data comemorativa', Icone: Gift },
  { nome: 'shopping-bag', rotulo: 'Loja', Icone: ShoppingBag },
  { nome: 'store', rotulo: 'Ponto de venda', Icone: Store },
  { nome: 'package', rotulo: 'Embalagem', Icone: Package },
  { nome: 'briefcase', rotulo: 'Institucional', Icone: Briefcase },
  { nome: 'sparkles', rotulo: 'Destaque', Icone: Sparkles },
  { nome: 'star', rotulo: 'Estrela', Icone: Star },
  { nome: 'heart', rotulo: 'Coração', Icone: Heart },
  { nome: 'file-text', rotulo: 'Documento', Icone: FileText },
]

const POR_NOME = new Map(ICONES_MODELO.map((i) => [i.nome, i.Icone]))

export function iconeDoModelo(nome: string | null | undefined): Icone {
  return (nome && POR_NOME.get(nome)) || FileText
}
