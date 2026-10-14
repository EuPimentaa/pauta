/** Junta nomes de classe, ignorando falsos. `cx('a', cond && 'b')` → 'a b'. */
export function cx(...partes: (string | false | null | undefined | 0)[]): string {
  let saida = ''
  for (const p of partes) if (p) saida = saida ? `${saida} ${p}` : p
  return saida
}
