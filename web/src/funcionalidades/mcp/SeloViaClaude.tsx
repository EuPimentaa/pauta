/** O selo "via Claude" (F7, API.md §F.6): na linha do histórico e no cabeçalho do comentário feitos por uma ferramenta do MCP. */
import { Sparkles } from 'lucide-react'
import './mcp.css'

export function SeloViaClaude() {
  return (
    <span className="mcp-selo-claude" title="Feito pelo Claude, com o acesso desta pessoa">
      <Sparkles aria-hidden="true" />via Claude
    </span>
  )
}
