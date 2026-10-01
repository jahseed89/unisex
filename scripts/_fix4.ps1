$ErrorActionPreference = 'Stop'
$enc = New-Object System.Text.UTF8Encoding($false)
$NL = "`n"

# ---------------------------------------------------------------------------
# Fix 1: fn_cart_totals mixed a comma join with LEFT JOIN, which is invalid,
# and grouped over an already-aggregated CTE unnecessarily.
# ---------------------------------------------------------------------------
$f = (Resolve-Path 'supabase\migrations\20250101000010_commerce_engine.sql').Path
$lines = [System.IO.File]::ReadAllLines($f, [System.Text.Encoding]::UTF8)

$start = ($lines | Select-String -Pattern '^create or replace function public\.fn_cart_totals' | Select-Object -First 1).LineNumber
$end = ($start..$lines.Count | Where-Object { $lines[$_ - 1] -eq '$$;' } | Select-Object -First 1)
Write-Output "  [0010] rewriting fn_cart_totals (lines $start..$end)"
if (-not $start -or -not $end) { throw 'fn_cart_totals bounds not found' }

$body = [string[]]@(
  'create or replace function public.fn_cart_totals(p_cart_id uuid)',
  'returns table (',
  '  subtotal      numeric,',
  '  discount      numeric,',
  '  shipping      numeric,',
  '  tax           numeric,',
  '  total         numeric,',
  '  item_count    integer,',
  '  free_shipping_threshold numeric,',
  '  coupon_code   text,',
  '  coupon_message text',
  ')',
  'language sql',
  'stable',
  'security definer',
  'set search_path = public, pg_temp',
  'as $$',
  'with cfg as (',
  '  select * from public.business_settings where id',
  '),',
  'lines as (',
  '  select',
  '    coalesce(sum(ci.unit_price * ci.quantity), 0)::numeric as subtotal,',
  '    coalesce(sum(ci.quantity), 0)::int as item_count,',
  "    coalesce(array_agg(ci.product_id) filter (where ci.product_id is not null), '{}') as product_ids",
  '  from public.cart_items ci',
  '  where ci.cart_id = p_cart_id',
  '),',
  'cart as (',
  '  select c.coupon_code from public.carts c where c.id = p_cart_id',
  '),',
  'coupon as (',
  '  select * from public.fn_coupon_preview(cart.coupon_code, lines.subtotal, lines.product_ids)',
  '),',
  'priced as (',
  '  select',
  '    lines.subtotal,',
  '    lines.item_count,',
  '    lines.product_ids,',
  '    cart.coupon_code,',
  '    coalesce(coupon.discount_amount, 0) as discount_amount,',
  '    coupon.message                 as coupon_message,',
  '    -- Delivery is charged only when it is offered, enabled and below threshold.',
  '    case',
  '      when cfg.free_delivery_threshold is null or cfg.free_delivery_threshold <= 0',
  '        then 0',
  '      when lines.subtotal >= cfg.free_delivery_threshold',
  '        then 0',
  '      else cfg.standard_delivery_fee',
  '    end as shipping,',
  '    -- Prices are tax-inclusive by default: the tax shown is the portion',
  '    -- already contained in the line totals, not an additional charge.',
  '    case',
  '      when cfg.tax_inclusive',
  '        then round((lines.subtotal - coalesce(coupon.discount_amount, 0))',
  '                    * cfg.tax_pct / (100 + cfg.tax_pct), 2)',
  '      else round((lines.subtotal - coalesce(coupon.discount_amount, 0))',
  '                 * cfg.tax_pct / 100, 2)',
  '    end as tax',
  '  from lines',
  '  cross join cfg',
  '  cross join cart',
  '  left join coupon on true',
  ')',
  'select',
  '  p.subtotal,',
  '  p.discount_amount,',
  '  case when cfg.accepts_delivery then p.shipping else 0 end,',
  '  p.tax,',
  '  greatest(p.subtotal - p.discount_amount + p.tax, 0)',
  '    + case when cfg.accepts_delivery then p.shipping else 0 end,',
  '  p.item_count,',
  '  cfg.free_delivery_threshold,',
  '  p.coupon_code,',
  '  p.coupon_message',
  'from priced p',
  'cross join cfg;',
  '$$;'
)

$lines = $lines[0..($start - 2)] + $body + $lines[$end..($lines.Count - 1)]
[System.IO.File]::WriteAllLines($f, $lines, $enc)

# ---------------------------------------------------------------------------
# Fix 2: `select a.*, s.name into v_appt, v_service` is invalid — a row variable
# cannot share an INTO list with a scalar column.
# ---------------------------------------------------------------------------
$f2 = (Resolve-Path 'supabase\migrations\20250101000011_notifications.sql').Path
$t2 = [System.IO.File]::ReadAllText($f2, [System.Text.Encoding]::UTF8)
$old = @'
  select a.*, s.name into v_appt, v_service
  from public.appointments a
  join public.services s on s.id = a.service_id
  where a.id = p_appointment_id;
'@
$new = @'
  select a.* into v_appt
  from public.appointments a
  where a.id = p_appointment_id;

  if v_appt.id is not null then
    select s.name into v_service from public.services s where s.id = v_appt.service_id;
  end if;
'@
if (-not $t2.Contains($old)) { throw 'fn_appointment_created select not found' }
$t2 = $t2.Replace($old, $new)
[System.IO.File]::WriteAllText($f2, $t2, $enc)
Write-Output '  [0011] split multi-item INTO in fn_appointment_created'

# ---------------------------------------------------------------------------
# Fix 3: an aggregate cannot appear inside coalesce() in a scalar argument
# position. Hoist it into its own statement.
# ---------------------------------------------------------------------------
$f3 = (Resolve-Path 'supabase\migrations\20250101000013_public_rpcs.sql').Path
$t3 = [System.IO.File]::ReadAllText($f3, [System.Text.Encoding]::UTF8)
$old3 = @'
  select * into v_result
  from public.fn_coupon_preview(
    upper(trim(p_code)),
    v_subtotal,
    coalesce(array_agg(product_id) from public.cart_items where cart_id = v_cart.id), '{}')
  );
'@
$new3 = @'
  select coalesce(array_agg(ci.product_id) filter (where ci.product_id is not null), '{}')
    into v_product_ids
  from public.cart_items ci
  where ci.cart_id = v_cart.id;

  select * into v_result
  from public.fn_coupon_preview(
    upper(trim(p_code)),
    v_subtotal,
    v_product_ids
  );
'@
if (-not $t3.Contains($old3)) { throw 'fn_apply_cart_coupon preview not found' }
$t3 = $t3.Replace($old3, $new3)

$oldDecl = @'
  v_subtotal numeric;
  v_result record;
'@
$newDecl = @'
  v_subtotal numeric;
  v_product_ids uuid[] := '{}';
  v_result record;
'@
if (-not $t3.Contains($oldDecl)) { throw 'fn_apply_cart_coupon declarations not found' }
$t3 = $t3.Replace($oldDecl, $newDecl)
[System.IO.File]::WriteAllText($f3, $t3, $enc)
Write-Output '  [0013] hoisted aggregate out of scalar argument in fn_apply_cart_coupon'

Write-Output 'PATCHES OK'