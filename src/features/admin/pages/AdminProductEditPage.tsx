import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Package, Plus, Trash2 } from 'lucide-react'

import {
  listProductCategoriesAdmin,
  qk,
  saveProduct,
  saveVariant,
} from '@/lib/api'
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Field,
  Input,
  Select,
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  Switch,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
} from '@/components/ui'
import { MediaFrame } from '@/components/shared/MediaFrame'
import {
  AdminShell,
  AsyncSection,
  ConfirmDialog,
  Panel,
  SaveStatus,
  StringListEditor,
  TabPanel,
  Tabs,
  UnsavedChangesDialog,
  useUnsavedChanges,
} from '../components/adminKit'
import type { SaveState } from '../components/adminKit'
import {
  getProductAdmin,
  listVariantsForProducts,
  removeProductVariant,
} from '../components/adminReads'
import type { ProductAdmin } from '../components/adminReads'
import { StockAdjustDialog } from '../components/StockAdjustDialog'
import type { StockAdjustTarget } from '../components/StockAdjustDialog'
import { numberOr, numberOrNull, toInputValue } from '../components/adminFormat'
import { errorMessage } from '@/lib/supabase/errors'
import { formatNaira, slugify } from '@/lib/utils/format'
import type { HairClass, HairTexture, ProductKind, ProductStatus, ProductVariant } from '@/types'

/**
 * Product editor.
 *
 * Reads go through `getProductAdmin`, not the customer-facing
 * `getProductBySlug` — the shop reader resolves the `product_catalog` view,
 * collapses to one purchasable variant per product and cannot see drafts, so it
 * cannot edit anything.
 *
 * Stock is deliberately not editable here for a saved variant. `adjust_stock` is
 * the only path the database accepts, and the ledger it writes is the audit
 * trail; the Variants tab points there instead of offering a field that would be
 * rejected on save.
 */

const KINDS: { value: ProductKind; label: string }[] = [
  { value: 'wig', label: 'Wig' },
  { value: 'extension', label: 'Extensions' },
  { value: 'hair_care', label: 'Hair care' },
  { value: 'styling', label: 'Styling' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'tool', label: 'Tool' },
  { value: 'treatment', label: 'Treatment' },
]

const HAIR_CLASSES: { value: HairClass; label: string }[] = [
  { value: 'human', label: 'Human hair' },
  { value: 'synthetic', label: 'Synthetic' },
  { value: 'blend', label: 'Blend' },
  { value: 'vegan', label: 'Vegan / cruelty free' },
]

const HAIR_TEXTURES: { value: HairTexture; label: string }[] = [
  { value: 'straight', label: 'Straight' },
  { value: 'wavy', label: 'Wavy' },
  { value: 'curly', label: 'Curly' },
  { value: 'coily', label: 'Coily' },
  { value: 'kinky', label: 'Kinky' },
]

const PRODUCT_STATUSES: { value: ProductStatus; label: string }[] = [
  { value: 'draft', label: 'Draft — hidden from the shop' },
  { value: 'active', label: 'Active — on sale' },
  { value: 'archived', label: 'Archived — retired' },
]

interface ProductForm {
  id?: string
  name: string
  slug: string
  slugTouched: boolean
  kind: ProductKind
  categoryId: string
  brand: string
  summary: string
  description: string
  benefits: string[]
  howToUse: string[]
  ingredients: string[]
  careInstructions: string
  basePrice: string
  compareAtPrice: string
  hairClass: string
  hairTexture: string
  lengthCm: string
  weightG: string
  capConstruction: string
  isPreStretched: boolean
  isGlueless: boolean
  imageUrl: string
  galleryUrls: string
  status: ProductStatus
  isFeatured: boolean
  isBestSeller: boolean
  displayOrder: string
  metaTitle: string
  metaDescription: string
}

const EMPTY_FORM: ProductForm = {
  name: '',
  slug: '',
  slugTouched: false,
  kind: 'hair_care',
  categoryId: '',
  brand: '',
  summary: '',
  description: '',
  benefits: [],
  howToUse: [],
  ingredients: [],
  careInstructions: '',
  basePrice: '',
  compareAtPrice: '',
  hairClass: '',
  hairTexture: '',
  lengthCm: '',
  weightG: '',
  capConstruction: '',
  isPreStretched: false,
  isGlueless: false,
  imageUrl: '',
  galleryUrls: '',
  status: 'draft',
  isFeatured: false,
  isBestSeller: false,
  displayOrder: '0',
  metaTitle: '',
  metaDescription: '',
}

export default function AdminProductEditPage() {
  const { id = '' } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState('details')
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM)
  const [dirty, setDirty] = useState(false)
  const [state, setState] = useState<SaveState>('idle')

  const [variantSheet, setVariantSheet] = useState<ProductVariant | null>(null)
  const [variantDelete, setVariantDelete] = useState<ProductVariant | null>(null)
  const [stockTarget, setStockTarget] = useState<StockAdjustTarget | null>(null)

  const blocker = useUnsavedChanges(dirty)

  const productQuery = useQuery({
    queryKey: qk.adminProduct(id),
    enabled: !isNew,
    queryFn: () => getProductAdmin(id),
    staleTime: 60_000,
  })

  const categoriesQuery = useQuery({
    queryKey: qk.productCategories(),
    queryFn: listProductCategoriesAdmin,
    staleTime: 10 * 60_000,
  })

  useEffect(() => {
    const product = productQuery.data
    if (!product) return
    setForm({
      id: product.id,
      name: product.name,
      slug: product.slug,
      slugTouched: true,
      kind: product.kind,
      categoryId: product.category_id ?? '',
      brand: product.brand ?? '',
      summary: product.summary,
      description: product.description ?? '',
      benefits: product.benefits ?? [],
      howToUse: product.how_to_use ?? [],
      ingredients: product.ingredients ?? [],
      careInstructions: product.care_instructions ?? '',
      basePrice: toInputValue(product.base_price),
      compareAtPrice: toInputValue(product.compare_at_price),
      hairClass: product.hair_class ?? '',
      hairTexture: product.hair_texture ?? '',
      lengthCm: toInputValue(product.length_cm),
      weightG: toInputValue(product.weight_g),
      capConstruction: product.cap_construction ?? '',
      isPreStretched: product.is_pre_stretched,
      isGlueless: product.is_glueless,
      imageUrl: product.image_url ?? '',
      galleryUrls: (product.gallery_urls ?? []).join('\n'),
      status: product.status,
      isFeatured: product.is_featured,
      isBestSeller: product.is_best_seller,
      displayOrder: String(product.display_order),
      metaTitle: product.meta_title ?? '',
      metaDescription: product.meta_description ?? '',
    })
    setDirty(false)
  }, [productQuery.data])

  // Slug tracks the name until the editor overrides it.
  useEffect(() => {
    setForm((current) =>
      current.slugTouched ? current : { ...current, slug: slugify(current.name) },
    )
  }, [form.name])

  const set = <K extends keyof ProductForm>(key: K, value: ProductForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setState('idle')
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      // `meta_title` / `meta_description` exist in the schema but not in the shared
      // `Product` type, so the payload is typed against the local admin row.
      const payload: Partial<ProductAdmin> & { id?: string } = {
        ...(form.id ? { id: form.id } : {}),
        slug: form.slug || slugify(form.name),
        name: form.name.trim(),
        kind: form.kind,
        category_id: form.categoryId || null,
        brand: form.brand.trim() || null,
        summary: form.summary.trim(),
        description: form.description.trim() || null,
        ingredients: form.ingredients,
        benefits: form.benefits,
        how_to_use: form.howToUse,
        care_instructions: form.careInstructions.trim() || null,
        base_price: numberOr(form.basePrice, 0),
        compare_at_price: numberOrNull(form.compareAtPrice),
        hair_class: (form.hairClass || null) as HairClass | null,
        hair_texture: (form.hairTexture || null) as HairTexture | null,
        length_cm: numberOrNull(form.lengthCm),
        weight_g: numberOrNull(form.weightG),
        cap_construction: form.capConstruction.trim() || null,
        is_pre_stretched: form.isPreStretched,
        is_glueless: form.isGlueless,
        image_url: form.imageUrl.trim() || null,
        gallery_urls: form.galleryUrls
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        status: form.status,
        is_featured: form.isFeatured,
        is_best_seller: form.isBestSeller,
        display_order: numberOr(form.displayOrder, 0),
        meta_title: form.metaTitle.trim() || null,
        meta_description: form.metaDescription.trim() || null,
      }
      return saveProduct(payload)
    },
    onSuccess: (product) => {
      setState('saved')
      setDirty(false)
      toast.success(`${product.name} saved.`)
      void queryClient.invalidateQueries({ queryKey: qk.adminProduct(product.id) })
      void queryClient.invalidateQueries({ queryKey: qk.adminProducts() })
      void queryClient.invalidateQueries({ queryKey: qk.products() })
      if (isNew) navigate(`/admin/products/${product.id}`, { replace: true })
    },
    onError: (error) => {
      setState('error')
      toast.error(errorMessage(error))
    },
  })

  const deleteVariantMutation = useMutation({
    mutationFn: (variant: ProductVariant) => removeProductVariant(variant.id),
    onSuccess: () => {
      toast.success('Variant deleted.')
      setVariantDelete(null)
      void queryClient.invalidateQueries({ queryKey: qk.adminVariants(id) })
      void queryClient.invalidateQueries({ queryKey: qk.adminProducts() })
    },
    onError: (error) => {
      setVariantDelete(null)
      toast.error(errorMessage(error))
    },
  })

  const compareAt = numberOrNull(form.compareAtPrice)
  const base = numberOr(form.basePrice, 0)
  const compareTooLow = compareAt !== null && compareAt <= base
  const invalid = !form.name.trim() || !form.summary.trim() || !form.slug.trim()

  return (
    <>
      <AdminShell
        eyebrow="Administration"
        title={form.name.trim() || (isNew ? 'New product' : 'Product')}
        breadcrumb={[
          { label: 'Admin', to: '/admin' },
          { label: 'Products', to: '/admin/products' },
          ...(isNew ? [] : [{ label: form.name || 'Edit', to: `/admin/products/${id}` }]),
        ]}
        description={
          isNew
            ? 'Create the product record first, then add its variants. Variants carry the price and the stock.'
            : 'Everything on the shop comes from this record and its variants.'
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/admin/products">
                <ArrowLeft aria-hidden />
                Back
              </Link>
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              loadingText="Saving…"
              disabled={invalid || compareTooLow}
            >
              {isNew ? 'Create product' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-4">
          <SaveStatus
            state={state}
            message={
              state === 'saved'
                ? 'All changes saved.'
                : state === 'error'
                  ? 'Nothing was saved. Fix the error and try again.'
                  : undefined
            }
          />
          {dirty && state !== 'error' && (
            <p className="text-xs text-clay">Unsaved changes on this page.</p>
          )}
        </div>

        <AsyncSection
          isLoading={productQuery.isLoading && !isNew}
          isError={productQuery.isError}
          error={productQuery.error}
          onRetry={() => void productQuery.refetch()}
          isEmpty={!isNew && productQuery.data === null && !productQuery.isLoading}
          empty={
            <Panel title="Product not found">
              <p className="text-sm text-muted">
                That product does not exist any more, or the link is out of date.
              </p>
              <Button asChild className="mt-4">
                <Link to="/admin/products">Back to products</Link>
              </Button>
            </Panel>
          }
          skeleton={<div className="h-96 animate-pulse rounded-lg bg-sand/60" />}
        >
          <>
            <Tabs
              className="mt-4"
              label="Product sections"
              value={tab}
              onChange={setTab}
              items={[
                { id: 'details', label: 'Details' },
                { id: 'variants', label: 'Variants' },
                { id: 'media', label: 'Media' },
                { id: 'seo', label: 'SEO' },
              ]}
            />

            <TabPanel id="details" value={tab}>
              <div className="space-y-5">
                <Panel title="Basics">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Name" htmlFor="p-name" required>
                      <Input
                        id="p-name"
                        value={form.name}
                        onChange={(event) => set('name', event.target.value)}
                        placeholder="Raw Bundles · 18 inch"
                      />
                    </Field>
                    <Field
                      label="Slug"
                      htmlFor="p-slug"
                      required
                      hint="Used in the shop URL."
                    >
                      <Input
                        id="p-slug"
                        value={form.slug}
                        onChange={(event) =>
                          setForm((current) => {
                            setDirty(true)
                            return {
                              ...current,
                              slug: slugify(event.target.value),
                              slugTouched: true,
                            }
                          })
                        }
                      />
                    </Field>

                    <Field label="Kind" htmlFor="p-kind">
                      <Select
                        id="p-kind"
                        value={form.kind}
                        onChange={(event) => set('kind', event.target.value as ProductKind)}
                        options={KINDS.map((kind) => ({ ...kind }))}
                      />
                    </Field>
                    <Field label="Category" htmlFor="p-category">
                      <Select
                        id="p-category"
                        value={form.categoryId}
                        onChange={(event) => set('categoryId', event.target.value)}
                        placeholder="Uncategorised"
                        options={(categoriesQuery.data ?? []).map((category) => ({
                          value: category.id,
                          label: category.name,
                        }))}
                      />
                    </Field>

                    <Field label="Brand" htmlFor="p-brand">
                      <Input
                        id="p-brand"
                        value={form.brand}
                        onChange={(event) => set('brand', event.target.value)}
                      />
                    </Field>
                    <Field
                      label="Summary"
                      htmlFor="p-summary"
                      required
                      hint="One or two sentences. Shown on the product card."
                    >
                      <Input
                        id="p-summary"
                        value={form.summary}
                        onChange={(event) => set('summary', event.target.value)}
                      />
                    </Field>
                  </div>

                  <div className="mt-4">
                    <Field label="Description" htmlFor="p-description" hint="Markdown is supported.">
                      <Textarea
                        id="p-description"
                        rows={8}
                        value={form.description}
                        onChange={(event) => set('description', event.target.value)}
                      />
                    </Field>
                  </div>
                </Panel>

                <Panel
                  title="Content"
                  description="Short bullet points. Press Enter to add, and remove with the × on each one."
                >
                  <div className="space-y-5">
                    <StringListEditor
                      legend="Benefits"
                      values={form.benefits}
                      onChange={(next) => set('benefits', next)}
                      placeholder="Holds curl without shedding"
                      max={10}
                    />
                    <StringListEditor
                      legend="How to use"
                      values={form.howToUse}
                      onChange={(next) => set('howToUse', next)}
                      placeholder="Apply to dry hair and brush out"
                      max={10}
                    />
                    <StringListEditor
                      legend="Ingredients"
                      values={form.ingredients}
                      onChange={(next) => set('ingredients', next)}
                      placeholder="Argan oil"
                      max={30}
                    />
                    <Field label="Care instructions" htmlFor="p-care">
                      <Textarea
                        id="p-care"
                        rows={4}
                        value={form.careInstructions}
                        onChange={(event) => set('careInstructions', event.target.value)}
                        placeholder="Wash on cool, condition twice, dry on low."
                      />
                    </Field>
                  </div>
                </Panel>

                <Panel title="Pricing & attributes">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field
                      label="Base price"
                      htmlFor="p-base-price"
                      required
                      hint="Fallback when a variant has no price."
                    >
                      <Input
                        id="p-base-price"
                        type="number"
                        min={0}
                        step={500}
                        value={form.basePrice}
                        onChange={(event) => set('basePrice', event.target.value)}
                      />
                    </Field>
                    <Field
                      label="Compare-at price"
                      htmlFor="p-compare-price"
                      error={
                        compareTooLow ? 'Must be higher than the base price.' : undefined
                      }
                      hint="Shows the strikethrough. Must exceed the base price."
                    >
                      <Input
                        id="p-compare-price"
                        type="number"
                        min={0}
                        step={500}
                        value={form.compareAtPrice}
                        invalid={compareTooLow}
                        onChange={(event) => set('compareAtPrice', event.target.value)}
                      />
                    </Field>
                    <Field label="Hair class" htmlFor="p-hair-class">
                      <Select
                        id="p-hair-class"
                        value={form.hairClass}
                        onChange={(event) => set('hairClass', event.target.value)}
                        placeholder="Not specified"
                        options={HAIR_CLASSES.map((option) => ({ ...option }))}
                      />
                    </Field>
                    <Field label="Texture" htmlFor="p-hair-texture">
                      <Select
                        id="p-hair-texture"
                        value={form.hairTexture}
                        onChange={(event) => set('hairTexture', event.target.value)}
                        placeholder="Not specified"
                        options={HAIR_TEXTURES.map((option) => ({ ...option }))}
                      />
                    </Field>

                    <Field label="Length (cm)" htmlFor="p-length">
                      <Input
                        id="p-length"
                        type="number"
                        min={0}
                        value={form.lengthCm}
                        onChange={(event) => set('lengthCm', event.target.value)}
                      />
                    </Field>
                    <Field label="Weight (g)" htmlFor="p-weight">
                      <Input
                        id="p-weight"
                        type="number"
                        min={0}
                        value={form.weightG}
                        onChange={(event) => set('weightG', event.target.value)}
                      />
                    </Field>
                    <Field
                      label="Cap construction"
                      htmlFor="p-cap"
                      className="sm:col-span-2"
                      hint="e.g. 13×4 lace, full lace, i-top"
                    >
                      <Input
                        id="p-cap"
                        value={form.capConstruction}
                        onChange={(event) => set('capConstruction', event.target.value)}
                      />
                    </Field>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-6 border-t border-line pt-4">
                    <Checkbox
                      id="p-prestretched"
                      checked={form.isPreStretched}
                      onChange={(event) => set('isPreStretched', event.target.checked)}
                      label="Pre-stretched"
                    />
                    <Checkbox
                      id="p-glueless"
                      checked={form.isGlueless}
                      onChange={(event) => set('isGlueless', event.target.checked)}
                      label="Glueless"
                    />
                  </div>
                </Panel>

                <Panel title="Merchandising">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Status" htmlFor="p-status">
                      <Select
                        id="p-status"
                        value={form.status}
                        onChange={(event) =>
                          set('status', event.target.value as ProductStatus)
                        }
                        options={PRODUCT_STATUSES.map((option) => ({ ...option }))}
                      />
                    </Field>
                    <Field label="Display order" htmlFor="p-order" hint="Lower numbers appear first.">
                      <Input
                        id="p-order"
                        type="number"
                        value={form.displayOrder}
                        onChange={(event) => set('displayOrder', event.target.value)}
                      />
                    </Field>
                  </div>

                  <div className="mt-4 grid gap-3 rounded-md border border-line px-4 py-3.5 sm:grid-cols-2">
                    <Switch
                      checked={form.isFeatured}
                      onCheckedChange={(value) => set('isFeatured', value)}
                      label="Featured"
                      aria-label="Feature this product on the home page"
                    />
                    <Switch
                      checked={form.isBestSeller}
                      onCheckedChange={(value) => set('isBestSeller', value)}
                      label="Best seller"
                      aria-label="Show the best seller badge"
                    />
                  </div>
                </Panel>
              </div>
            </TabPanel>

            <TabPanel id="variants" value={tab}>
              {isNew ? (
                <Alert variant="info" title="Save the product first">
                  Variants belong to a saved product, because the database stores them against its
                  id. Create the product, then come back to this tab.
                </Alert>
              ) : (
                <VariantsTab
                  productId={id}
                  productName={form.name || 'Product'}
                  onAdd={() =>
                    setVariantSheet({
                      id: '',
                      product_id: id,
                      sku: '',
                      slug: '',
                      name: '',
                      attributes: {},
                      price: base,
                      compare_at_price: null,
                      stock_on_hand: 0,
                      stock_reserved: 0,
                      safety_stock: 0,
                      low_stock_threshold: 3,
                      backorder_allowed: false,
                      weight_grams: null,
                      image_url: null,
                      is_default: false,
                      is_active: true,
                    })
                  }
                  onEdit={(variant) => setVariantSheet(variant)}
                  onAdjust={(variant) =>
                    setStockTarget({
                      variantId: variant.id,
                      sku: variant.sku,
                      name: variant.name,
                      productName: form.name || 'Product',
                      stockOnHand: variant.stock_on_hand,
                    })
                  }
                  onDelete={(variant) => setVariantDelete(variant)}
                />
              )}
            </TabPanel>

            <TabPanel id="media" value={tab}>
              <div className="space-y-5">
                <Alert variant="info" title="Photography is entered as URLs">
                  There is no product-image upload endpoint yet, so paste the hosted image address
                  here. Until photography is shot, the shop renders a deterministic on-brand
                  placeholder instead of a broken image.
                </Alert>

                <Panel title="Primary image" description="Used on the product card and at the top of the detail page.">
                  <div className="grid gap-5 sm:grid-cols-[1fr_auto]">
                    <Field label="Image URL" htmlFor="p-image">
                      <Input
                        id="p-image"
                        type="url"
                        value={form.imageUrl}
                        placeholder="https://cdn.example.com/products/bundles-18.jpg"
                        onChange={(event) => set('imageUrl', event.target.value)}
                      />
                    </Field>
                    <MediaFrame
                      src={form.imageUrl || null}
                      alt={
                        form.name.trim()
                          ? `${form.name} — product photograph`
                          : 'Product photograph preview'
                      }
                      seed={form.slug || 'new-product'}
                      aspect="square"
                      rounded
                      className="w-40"
                    />
                  </div>
                </Panel>

                <Panel
                  title="Gallery"
                  description="One image address per line. The first line is the second image on the detail page."
                >
                  <Field label="Gallery image URLs" htmlFor="p-gallery">
                    <Textarea
                      id="p-gallery"
                      rows={6}
                      value={form.galleryUrls}
                      placeholder={'https://cdn.example.com/products/bundles-18-1.jpg\nhttps://cdn.example.com/products/bundles-18-2.jpg'}
                      onChange={(event) => set('galleryUrls', event.target.value)}
                    />
                  </Field>
                </Panel>
              </div>
            </TabPanel>

            <TabPanel id="seo" value={tab}>
              <div className="space-y-5">
                <Panel
                  title="Search appearance"
                  description="Falls back to the product name and summary when these are empty."
                >
                  <div className="space-y-4">
                    <Field
                      label="Meta title"
                      htmlFor="p-meta-title"
                      hint={`${form.metaTitle.length} characters. Around 60 reads best.`}
                    >
                      <Input
                        id="p-meta-title"
                        value={form.metaTitle}
                        placeholder={form.name || 'Product name'}
                        onChange={(event) => set('metaTitle', event.target.value)}
                      />
                    </Field>
                    <Field
                      label="Meta description"
                      htmlFor="p-meta-description"
                      hint={`${form.metaDescription.length} characters. Around 155 reads best.`}
                    >
                      <Textarea
                        id="p-meta-description"
                        rows={3}
                        value={form.metaDescription}
                        placeholder={form.summary || 'Product summary'}
                        onChange={(event) => set('metaDescription', event.target.value)}
                      />
                    </Field>
                  </div>
                </Panel>

                <Panel title="Preview">
                  <SerpPreview
                    slug={form.slug}
                    title={form.metaTitle || form.name}
                    description={form.metaDescription || form.summary}
                  />
                </Panel>
              </div>
            </TabPanel>
          </>
        </AsyncSection>
      </AdminShell>

      {/* Variant editor */}
      {variantSheet && (
        <VariantSheet
          variant={variantSheet}
          productId={id}
          onClose={() => setVariantSheet(null)}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: qk.adminVariants(id) })
            void queryClient.invalidateQueries({ queryKey: qk.adminProducts() })
            void queryClient.invalidateQueries({ queryKey: qk.products() })
          }}
        />
      )}

      <ConfirmDialog
        open={variantDelete !== null}
        onOpenChange={(open) => !open && setVariantDelete(null)}
        title={variantDelete ? `Delete variant ${variantDelete.sku}?` : 'Delete variant'}
        description="This cannot be undone."
        consequence={
          variantDelete ? (
            <span className="block space-y-1.5">
              <span className="block">
                {formatNaira(variantDelete.price)} and{' '}
                {variantDelete.stock_on_hand} unit{variantDelete.stock_on_hand === 1 ? '' : 's'} of
                stock leave the catalogue.
              </span>
              <span className="block">
                Past orders keep their snapshotted line items, so nothing already sold changes.
              </span>
              <span className="block font-medium">
                Deactivating instead keeps the SKU and its history while removing it from sale.
              </span>
            </span>
          ) : (
            ''
          )
        }
        confirmLabel="Delete variant"
        pending={deleteVariantMutation.isPending}
        onConfirm={() => {
          if (variantDelete) deleteVariantMutation.mutate(variantDelete)
        }}
      />

      <StockAdjustDialog
        open={stockTarget !== null}
        onOpenChange={(open) => !open && setStockTarget(null)}
        target={stockTarget}
        onAdjusted={() => {
          void queryClient.invalidateQueries({ queryKey: qk.adminVariants(id) })
          void queryClient.invalidateQueries({ queryKey: qk.adminProducts() })
        }}
      />

      <UnsavedChangesDialog blocker={blocker} />
    </>
  )
}

// ---------------------------------------------------------------------------
// SERP preview
// ---------------------------------------------------------------------------

function SerpPreview({
  slug,
  title,
  description,
}: {
  slug: string
  title: string
  description: string
}) {
  const shownTitle = title.trim() || 'Untitled Hair Studio product'
  const shownDescription =
    description.trim() || 'No meta description set — search engines will use the product summary.'

  return (
    <div className="rounded-md border border-line bg-white p-5">
      <p className="text-xs text-[#202124]">
        <span className="text-[#5f6368]">https://</span>
        blackcheryunisexstudio.com
        <span className="text-[#5f6368]">/shop/{slug || 'product-slug'}</span>
      </p>
      <p className="mt-1 truncate text-lg leading-snug text-[#1a0dab]">{shownTitle}</p>
      <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-[#4d5156]">
        {shownDescription}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Variants tab
// ---------------------------------------------------------------------------

function VariantsTab({
  productId,
  productName,
  onAdd,
  onEdit,
  onAdjust,
  onDelete,
}: {
  productId: string
  productName: string
  onAdd: () => void
  onEdit: (variant: ProductVariant) => void
  onAdjust: (variant: ProductVariant) => void
  onDelete: (variant: ProductVariant) => void
}) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)

  const variantsQuery = useQuery({
    queryKey: qk.adminVariants(productId),
    queryFn: () => listVariantsForProducts([productId]),
    staleTime: 30_000,
  })

  const defaultMutation = useMutation({
    mutationFn: async (variant: ProductVariant) => {
      setError(null)
      // One default per product is a unique partial index, so the others must be
      // cleared first or the second write fails.
      for (const other of variantsQuery.data ?? []) {
        if (other.id !== variant.id && other.is_default) {
          await saveVariant({ id: other.id, is_default: false })
        }
      }
      return saveVariant({ id: variant.id, is_default: true })
    },
    onSuccess: () => {
      toast.success('Default variant updated.')
      void queryClient.invalidateQueries({ queryKey: qk.adminVariants(productId) })
      void queryClient.invalidateQueries({ queryKey: qk.adminProducts() })
      void queryClient.invalidateQueries({ queryKey: qk.products() })
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  })

  const variants = variantsQuery.data ?? []

  return (
    <div className="space-y-4">
      <Alert variant="info" title="Stock is changed through the ledger, not here">
        Every movement in and out of stock is recorded against{' '}
        <code className="text-xs">inventory_movements</code>, which is what makes stock
        discrepancies explainable. The database rejects a direct write to the stock figure, so use{' '}
        <strong className="font-semibold">Adjust stock</strong> below. Initial stock for a brand
        new variant can be set once, when the variant is first created.
      </Alert>

      {error && (
        <Alert variant="danger" title="That change was rejected">
          {error}
        </Alert>
      )}

      <Panel
        title="Variants"
        description={`${variants.length} variant${variants.length === 1 ? '' : 's'} on ${productName}.`}
        action={
          <Button variant="outline" size="sm" onClick={onAdd}>
            <Plus aria-hidden />
            Add variant
          </Button>
        }
        bodyClassName="p-0"
      >
        <AsyncSection
          isLoading={variantsQuery.isLoading}
          isError={variantsQuery.isError}
          error={variantsQuery.error}
          onRetry={() => void variantsQuery.refetch()}
          isEmpty={variants.length === 0}
          empty={
            <div className="p-8 text-center">
              <Package className="mx-auto mb-3 size-6 text-bronze" aria-hidden />
              <p className="text-sm text-muted">
                No variants yet. A product without a variant cannot be bought — add one with its
                SKU, price and starting stock.
              </p>
              <Button variant="outline" className="mt-4" onClick={onAdd}>
                <Plus aria-hidden />
                Add the first variant
              </Button>
            </div>
          }
          skeleton={<div className="h-64 animate-pulse bg-sand/60" />}
          className="p-5"
        >
          <>
            <Table>
              <caption className="sr-only">Variants of {productName}</caption>
              <THead>
                <tr>
                  <TH scope="col">SKU</TH>
                  <TH scope="col">Variant</TH>
                  <TH scope="col">Price</TH>
                  <TH scope="col">On hand</TH>
                  <TH scope="col">Reorder at</TH>
                  <TH scope="col">Default</TH>
                  <TH scope="col">Active</TH>
                  <TH scope="col" className="text-right">Actions</TH>
                </tr>
              </THead>
              <TBody>
                {variants.map((variant) => (
                  <TR key={variant.id}>
                    <TD className="font-medium tabular-nums text-ink">{variant.sku}</TD>
                    <TD className="max-w-[14rem] truncate text-sm">
                      {variant.name}
                      {variant.attributes &&
                        Object.keys(variant.attributes).length > 0 && (
                          <span className="ml-1.5 text-xs text-muted">
                            {Object.entries(variant.attributes)
                              .map(([key, value]) => `${key}: ${String(value)}`)
                              .join(' · ')}
                          </span>
                        )}
                    </TD>
                    <TD className="whitespace-nowrap text-sm font-medium tabular-nums text-ink">
                      {formatNaira(variant.price)}
                    </TD>
                    <TD>
                      <StockCell
                        stock={variant.stock_on_hand}
                        threshold={variant.low_stock_threshold}
                      />
                    </TD>
                    <TD className="text-sm tabular-nums text-muted">
                      {variant.low_stock_threshold}
                    </TD>
                    <TD>
                      {variant.is_default ? (
                        <Badge variant="accent" size="sm">
                          Default
                        </Badge>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => defaultMutation.mutate(variant)}
                          disabled={defaultMutation.isPending}
                        >
                          Make default
                        </Button>
                      )}
                    </TD>
                    <TD>
                      <Badge variant={variant.is_active ? 'success' : 'default'} size="sm" dot>
                        {variant.is_active ? 'Active' : 'Hidden'}
                      </Badge>
                    </TD>
                    <TD>
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => onAdjust(variant)}>
                          Adjust stock
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => onEdit(variant)}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="iconSm"
                          aria-label={`Delete variant ${variant.sku}`}
                          onClick={() => onDelete(variant)}
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </>
        </AsyncSection>
      </Panel>
    </div>
  )
}

function StockCell({ stock, threshold }: { stock: number; threshold: number }) {
  if (stock <= 0) {
    return (
      <Badge variant="danger" size="sm">
        Out of stock
      </Badge>
    )
  }
  if (stock <= threshold) {
    return (
      <Badge variant="warning" size="sm">
        {stock} left
      </Badge>
    )
  }
  return <span className="text-sm tabular-nums text-ink">{stock}</span>
}

// ---------------------------------------------------------------------------
// Variant sheet
// ---------------------------------------------------------------------------

function VariantSheet({
  variant: initial,
  productId,
  onClose,
  onSaved,
}: {
  variant: ProductVariant
  productId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [variant, setVariant] = useState(initial)
  const [state, setState] = useState<SaveState>('idle')
  const isNew = !initial.id

  const set = <K extends keyof ProductVariant>(key: K, value: ProductVariant[K]) =>
    setVariant((current) => ({ ...current, [key]: value }))

  const mutation = useMutation({
    mutationFn: () =>
      saveVariant({
        ...(variant.id ? { id: variant.id } : { product_id: productId }),
        sku: variant.sku.trim(),
        slug: variant.slug || slugify(variant.name),
        name: variant.name.trim(),
        attributes: variant.attributes,
        price: variant.price,
        compare_at_price: variant.compare_at_price,
        // Only written on create: the guard trigger rejects a stock change on an
        // existing variant, which has to go through adjustStock instead.
        ...(isNew ? { stock_on_hand: variant.stock_on_hand } : {}),
        safety_stock: variant.safety_stock,
        low_stock_threshold: variant.low_stock_threshold,
        backorder_allowed: variant.backorder_allowed,
        is_active: variant.is_active,
      }),
    onSuccess: () => {
      setState('saved')
      toast.success(isNew ? 'Variant created.' : 'Variant saved.')
      onSaved()
      onClose()
    },
    onError: (error) => {
      setState('error')
      toast.error(errorMessage(error))
    },
  })

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" title={isNew ? 'New variant' : 'Edit variant'}>
        <SheetHeader className="flex-col items-start gap-1">
          <h2 className="font-display text-lg font-semibold text-ink">
            {isNew ? 'New variant' : 'Edit variant'}
          </h2>
          <p className="text-sm text-muted">
            A variant is one buyable option — a length, a size, a weight.
          </p>
        </SheetHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            if (variant.sku.trim() && variant.name.trim()) mutation.mutate()
          }}
        >
          <SheetBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SKU" htmlFor="v-sku" required hint="Unique across the shop.">
                <Input
                  id="v-sku"
                  value={variant.sku}
                  onChange={(event) => set('sku', event.target.value)}
                  placeholder="BUN-18-200"
                />
              </Field>
              <Field label="Name" htmlFor="v-name" required>
                <Input
                  id="v-name"
                  value={variant.name}
                  onChange={(event) =>
                    setVariant((current) => ({
                      ...current,
                      name: event.target.value,
                      slug: current.id ? current.slug : slugify(event.target.value),
                    }))
                  }
                  placeholder="18 inch · 200g"
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Price" htmlFor="v-price" required>
                <Input
                  id="v-price"
                  type="number"
                  min={0}
                  step={500}
                  value={String(variant.price)}
                  onChange={(event) => set('price', numberOr(event.target.value, 0))}
                />
              </Field>
              <Field
                label="Compare-at price"
                htmlFor="v-compare"
                hint="Optional. Must exceed the price."
              >
                <Input
                  id="v-compare"
                  type="number"
                  min={0}
                  step={500}
                  value={toInputValue(variant.compare_at_price)}
                  onChange={(event) => set('compare_at_price', numberOrNull(event.target.value))}
                />
              </Field>
            </div>

            {isNew ? (
              <Field
                label="Opening stock"
                htmlFor="v-stock"
                hint="Set once, here. After this the stock figure moves only through Adjust stock."
              >
                <Input
                  id="v-stock"
                  type="number"
                  min={0}
                  value={String(variant.stock_on_hand)}
                  onChange={(event) => set('stock_on_hand', numberOr(event.target.value, 0))}
                />
              </Field>
            ) : (
              <Alert variant="warning" title={`Current stock: ${variant.stock_on_hand}`}>
                Stock is not editable here. Close this panel and use{' '}
                <strong className="font-semibold">Adjust stock</strong> in the variants table so
                the movement is written to the inventory ledger.
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Safety stock"
                htmlFor="v-safety"
                hint="Held back so the SKU is never oversold online."
              >
                <Input
                  id="v-safety"
                  type="number"
                  min={0}
                  value={String(variant.safety_stock)}
                  onChange={(event) => set('safety_stock', numberOr(event.target.value, 0))}
                />
              </Field>
              <Field
                label="Reorder threshold"
                htmlFor="v-threshold"
                hint="Flags the SKU as low stock at or below this figure."
              >
                <Input
                  id="v-threshold"
                  type="number"
                  min={0}
                  value={String(variant.low_stock_threshold)}
                  onChange={(event) =>
                    set('low_stock_threshold', numberOr(event.target.value, 0))
                  }
                />
              </Field>
            </div>

            <div className="space-y-3 rounded-md border border-line px-4 py-3.5">
              <Switch
                checked={variant.is_active}
                onCheckedChange={(value) => set('is_active', value)}
                label="Active"
                aria-label="Show this variant on the product page"
              />
              <Checkbox
                id="v-backorder"
                checked={variant.backorder_allowed}
                onChange={(event) => set('backorder_allowed', event.target.checked)}
                label="Allow backorders"
                description="Customers can buy it while stock is zero."
              />
              <Checkbox
                id="v-default"
                checked={variant.is_default}
                onChange={(event) => set('is_default', event.target.checked)}
                label="Default variant"
                description="Preselected on the product page. Only one variant per product can be the default."
              />
            </div>

            <SaveStatus state={state} />
          </SheetBody>

          <SheetFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="ml-auto"
              loading={mutation.isPending}
              loadingText="Saving…"
              disabled={!variant.sku.trim() || !variant.name.trim()}
            >
              {isNew ? 'Create variant' : 'Save variant'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
