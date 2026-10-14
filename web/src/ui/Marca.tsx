/**
 * Marcas da Melt por máscara CSS sobre os PNG oficiais (marca §3): a cor sai exata do token e acompanha o tema
 * (--logo-color: laranja no claro, #EDECEA no escuro e dentro de .chrome-dark).
 *   <Logo altura={20} />       wordmark
 *   <MarcaE altura={22} />     "e" (menu recolhido, celular)
 *   <BarraAssinatura />        arco-íris de 3 px: só login, convite e redefinição
 */
import { cx } from '../lib/classes.ts'
import { useNomeApp } from '../lib/app.ts'

export function Logo({ altura = 20, className, rotulo }: { altura?: number; className?: string; rotulo?: string }) {
  return <span className={cx('marca-logo', className)} style={{ height: altura }} role="img" aria-label={rotulo ?? 'Melt'} />
}

export function MarcaE({ altura = 22, className, rotulo }: { altura?: number; className?: string; rotulo?: string }) {
  return <span className={cx('marca-e', className)} style={{ height: altura }} role="img" aria-label={rotulo ?? 'Melt'} />
}

export function BarraAssinatura({ className }: { className?: string }) {
  return <span className={cx('barra-assinatura', className)} aria-hidden="true" />
}

/** Logo da Melt + nome do produto ("Pauta"), como na barra superior. */
export function MarcaProduto({ altura = 18, compacta, className }: { altura?: number; compacta?: boolean; className?: string }) {
  const nome = useNomeApp()
  return (
    <span className={cx('marca-produto', className)}>
      {compacta ? <MarcaE altura={altura + 4} rotulo={`Melt ${nome}`} /> : <Logo altura={altura} />}
      {!compacta && <span className="marca-produto-nome">{nome}</span>}
    </span>
  )
}
