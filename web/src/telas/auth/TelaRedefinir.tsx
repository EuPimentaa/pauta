/** /redefinir#<token>: senha nova pelo link que o admin gerou (vale 1 hora). */
import { TelaDefinirSenha } from './TelaDefinirSenha.tsx'

export default function TelaRedefinir() {
  return <TelaDefinirSenha finalidade="redefinicao" />
}
