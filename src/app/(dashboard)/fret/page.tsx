import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * La sección /fret ya no existe: todas las tiendas y todos los pedidos se ven
 * desde /recepciones. Se deja solo este redirect porque hay enlaces y
 * favoritos apuntando acá.
 */
export default function FretRedirect() {
  redirect('/recepciones')
}
