/**
 * Design system (componentes leves). Importe daqui: `import { Botao, Modal, avisar } from '../ui/index.ts'`.
 * Os pesados ficam fora do barril para não irem ao chunk de quem não usa:
 *   ui/Markdown.tsx (markdown-it + DOMPurify) e ui/GradeCalendario.tsx (dnd-kit).
 * O EditorMarkdown está aqui porque é só a casca: o TipTap baixa sob demanda quando ele aparece.
 * Catálogo vivo com todos os estados nos dois temas: /dev/ui (só em desenvolvimento).
 */
export { Abas, painelAba, type Aba } from './Abas.tsx'
export { Avatar, PilhaAvatares, type PessoaAvatar } from './Avatar.tsx'
export { avisar, fecharAviso, Avisos, type OpcoesAviso, type TipoAviso } from './avisos.tsx'
export { Botao, BotaoIcone, propsBotao, type VarianteBotao, type TamanhoBotao } from './Botao.tsx'
export { AreaTexto, Campo, GrupoCampo, Rotulo, Selecao, type AriaCampo, type OpcaoSelecao } from './Campo.tsx'
export { Checkbox, Interruptor } from './Checkbox.tsx'
export { ChipCliente, ChipEtiqueta } from './Chips.tsx'
export { Combobox, normalizarBusca } from './Combobox.tsx'
export { EditorMarkdown, type PessoaMencao, type PropsEditorMarkdown } from './EditorMarkdown.tsx'
export { BarraProgresso, Carregando, Contador, Esqueleto, EsqueletoLinhas, EstadoVazio } from './Indicadores.tsx'
export { Kbd } from './Kbd.tsx'
export { BarraAssinatura, Logo, MarcaE, MarcaProduto } from './Marca.tsx'
export { Menu, MenuFlutuante, type ItemMenuUi, type ItemAcaoMenu, type PropsGatilhoMenu } from './Menu.tsx'
export { Folha, Modal } from './Modal.tsx'
export { Popover } from './Popover.tsx'
export { CalendarioMes, SeletorData, SeletorHora, type FeriadoUi } from './SeletorData.tsx'
export { SeletorCor } from './SeletorCor.tsx'
export { CopiarTexto, TextoPuro, copiarParaAreaDeTransferencia } from './Texto.tsx'
export { Tooltip } from './Tooltip.tsx'
