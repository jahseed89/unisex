import { RotateCcw, Truck } from 'lucide-react'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui'
import { Markdown } from '@/features/shop/components/Markdown'
import type { ProductCatalogEntry } from '@/types'

/**
 * Long-form product copy.
 *
 * An accordion rather than a tab strip: the sections differ in length and
 * several are often empty, and an accordion keeps the buy box visible on a
 * phone instead of pushing the Add-to-bag button off-screen.
 */
export function ProductSections({ product, className }: { product: ProductCatalogEntry; className?: string }) {
  const hasBenefits = product.benefits.length > 0
  const hasHowTo = product.how_to_use.length > 0
  const hasIngredients = product.ingredients.length > 0
  const hasDescription = Boolean(product.description?.trim())

  return (
    <Accordion type="multiple" defaultValue={['description']} className={className}>
      {hasDescription && (
        <AccordionItem value="description">
          <AccordionTrigger>Description</AccordionTrigger>
          <AccordionContent>
            <Markdown source={product.description ?? ''} />
          </AccordionContent>
        </AccordionItem>
      )}

      {hasBenefits && (
        <AccordionItem value="benefits">
          <AccordionTrigger>Why our clients buy it</AccordionTrigger>
          <AccordionContent>
            <BulletList items={product.benefits} />
          </AccordionContent>
        </AccordionItem>
      )}

      {hasHowTo && (
        <AccordionItem value="how-to-use">
          <AccordionTrigger>How to use</AccordionTrigger>
          <AccordionContent>
            <BulletList items={product.how_to_use} ordered />
          </AccordionContent>
        </AccordionItem>
      )}

      {hasIngredients && (
        <AccordionItem value="ingredients">
          <AccordionTrigger>Ingredients</AccordionTrigger>
          <AccordionContent>
            <BulletList items={product.ingredients} />
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Patch test on a small area first, and stop if you feel any irritation. Keep out of
              reach of children.
            </p>
          </AccordionContent>
        </AccordionItem>
      )}

      {product.care_instructions && (
        <AccordionItem value="care">
          <AccordionTrigger>Care instructions</AccordionTrigger>
          <AccordionContent>
            <Markdown source={product.care_instructions} />
          </AccordionContent>
        </AccordionItem>
      )}

      <AccordionItem value="shipping">
        <AccordionTrigger>Shipping &amp; returns</AccordionTrigger>
        <AccordionContent>
          <div className="space-y-4">
            <div>
              <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Truck className="size-4 text-bronze" aria-hidden />
                Getting it to you
              </h4>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted">
                <li>
                  <strong className="font-medium text-ink">Pickup in Lagos.</strong> Free, and ready
                  the same working day for orders placed before 4pm. We will message you the moment
                  it is bagged.
                </li>
                <li>
                  <strong className="font-medium text-ink">Delivery.</strong> Lagos only, next
                  working day, with the fee waived on larger baskets. We send the rider&apos;s
                  number and tracking on WhatsApp.
                </li>
                <li>
                  <strong className="font-medium text-ink">Nationwide.</strong> We do not courier
                  outside Lagos yet — the WhatsApp team will help you arrange a pickup point.
                </li>
              </ul>
            </div>

            <div>
              <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <RotateCcw className="size-4 text-bronze" aria-hidden />
                Returns
              </h4>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted">
                <li>
                  Unopened, unused pieces with the tags and packaging intact can be returned within
                  7 days of collection, less a 15% restocking fee.
                </li>
                <li>
                  Once a piece has been installed — lace cut, sewn in, bleached, coloured or
                  heat-styled — it cannot be returned, because it can no longer be resold as new.
                </li>
                <li>
                  If something arrives faulty or is not the grade you ordered, bring it back or send
                  us a photo on WhatsApp within 48 hours and we will swap it or refund you in full.
                </li>
              </ul>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

function BulletList({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  const Tag = ordered ? 'ol' : 'ul'
  return (
    <Tag className="space-y-2 text-sm leading-relaxed text-ink-soft">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2.5">
          <span className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-bronze" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </Tag>
  )
}
