/**
 * Peças do catálogo /dev/ui: a seção numerada e a amostra desenhada duas vezes, no tema claro e no escuro (cada painel
 * troca de tema com color-scheme). Cada painel tem a própria instância dos componentes (estado independente).
 */
import type { ReactNode } from 'react'
import { Moon, Sun } from 'lucide-react'

export interface DefSecao { id: string; titulo: string }

export function Secao({ secao, numero, descricao, children }: { secao: DefSecao; numero: number; descricao?: ReactNode; children: ReactNode }) {
  return (
    <section id={secao.id} className="cat-secao" aria-labelledby={`${secao.id}-titulo`}>
      <div className="cat-secao-cabeca">
        <span aria-hidden="true">{String(numero).padStart(2, '0')}</span>
        <h2 id={`${secao.id}-titulo`}>{secao.titulo}</h2>
      </div>
      {descricao && <p className="cat-secao-descricao">{descricao}</p>}
      {children}
    </section>
  )
}

/** Amostra nos dois temas. `empilhar`: um painel embaixo do outro (conteúdo largo, como o quadro e o calendário). */
export function Amostra({ children, empilhar, rotulo }: { children: ReactNode; empilhar?: boolean; rotulo?: string }) {
  return (
    <div className="cat-amostra" data-empilhar={empilhar || undefined} role="group" aria-label={rotulo}>
      <div className="cat-painel chrome-light" role="group" aria-label={rotulo ? `${rotulo}, tema claro` : 'Tema claro'}>
        <span className="cat-painel-rotulo" aria-hidden="true"><Sun /> Claro</span>
        <div className="cat-painel-corpo">{children}</div>
      </div>
      <div className="cat-painel chrome-dark" role="group" aria-label={rotulo ? `${rotulo}, tema escuro` : 'Tema escuro'}>
        <span className="cat-painel-rotulo" aria-hidden="true"><Moon /> Escuro</span>
        <div className="cat-painel-corpo">{children}</div>
      </div>
    </div>
  )
}

export function Bloco({ titulo, children, className }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <div className={`cat-bloco ${className ?? ''}`}>
      <h3>{titulo}</h3>
      {children}
    </div>
  )
}

export function Linha({ children }: { children: ReactNode }) {
  return <div className="cat-linha">{children}</div>
}

export function Nota({ children }: { children: ReactNode }) {
  return <p className="cat-nota">{children}</p>
}
