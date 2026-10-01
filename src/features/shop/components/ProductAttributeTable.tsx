import { Table, TBody, TD, TH, THead, TR } from '@/components/ui'
import { humanise } from '@/lib/utils/format'
import type { ProductCatalogEntry, ProductVariant } from '@/types'

/**
 * Specification table.
 *
 * Only rows that mean something are rendered: an empty "Weight" line on a
 * shampoo bottle is noise, not information. Boolean construction flags are
 * shown for hair pieces, where "glueless" and "pre-stretched" are the two
 * questions every client asks before buying.
 */
export function ProductAttributeTable({
  product,
  variant,
  className,
}: {
  product: ProductCatalogEntry
  variant?: ProductVariant | null
  className?: string
}) {
  const rows: { label: string; value: string }[] = []
  const isHair = product.kind === 'wig' || product.kind === 'extension'

  const push = (label: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '') return
    rows.push({ label, value: String(value) })
  }

  push('Hair class', product.hair_class)
  push('Texture', product.hair_texture)
  push('Cap construction', product.cap_construction)
  if (isHair) {
    push('Pre-stretched', product.is_pre_stretched ? 'Yes' : 'No')
    push('Glueless', product.is_glueless ? 'Yes' : 'No')
  }

  const attributes = { ...product.attributes, ...(variant?.attributes ?? {}) }
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === '') continue
    const label = humanise(key)
    if (rows.some((row) => row.label === label)) continue
    rows.push({ label, value: String(value) })
  }

  // Length and weight usually live on the product or the chosen variant.
  push('Length', product.length_cm ? `${product.length_cm} cm` : null)
  const weight = variant?.weight_grams ?? product.weight_g
  push('Weight', weight ? `${weight} g` : null)

  if (rows.length === 0) return null

  return (
    <div className={className}>
      <h2 className="mb-3 font-display text-lg font-semibold text-ink">Details</h2>
      <div className="overflow-hidden rounded-lg border border-line">
        <Table>
          <caption className="sr-only">Product specifications for {product.name}</caption>
          <THead>
            <tr>
              <TH scope="col" className="w-2/5">
                Specification
              </TH>
              <TH scope="col">Detail</TH>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.label}>
                <TH
                  scope="row"
                  className="px-4 py-3 text-[0.8125rem] font-medium text-muted"
                >
                  {row.label}
                </TH>
                <TD className="text-sm text-ink">{row.value}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  )
}
