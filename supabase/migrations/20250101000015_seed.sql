-- =============================================================================
-- 0015 · Seed data
-- Reference content for local development and first deploy. Idempotent.
--
-- The administrator account is intentionally NOT created here: auth.users is
-- owned by Supabase GoTrue. See docs/05-authentication.md → "Bootstrapping the
-- first administrator".
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------
insert into public.roles (key, name, description, capabilities, rank, is_system)
values
  ('customer', 'Customer', 'Browses the catalogue, books appointments, shops and applies to roles.', array[]::text[], 10, true),
  ('staff',    'Stylist / Staff', 'Works assigned appointments and reviews client requirements.',
    array['appointments.read_assigned','appointments.update_assigned','requirements.read_assigned','orders.fulfil','inventory.read','applications.review'], 50, true),
  ('supervisor','Salon Supervisor', 'Staff permissions plus diary oversight and review moderation.',
    array['appointments.read_assigned','appointments.update_assigned','appointments.read_all','requirements.read_assigned','requirements.read_all','orders.fulfil','inventory.read','inventory.adjust','applications.review','reviews.moderate'], 70, true),
  ('admin',    'Administrator', 'Full administrative control of the platform.',
    array['*'], 100, true)
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      capabilities = excluded.capabilities,
      rank = excluded.rank;

-- ---------------------------------------------------------------------------
-- Location + opening hours (Mon–Sat 09:00–19:00, Sunday closed)
-- ---------------------------------------------------------------------------
insert into public.salon_locations (
  name, slug, address_line1, city, state, country, phone, whatsapp,
  email, timezone, is_primary, display_order
)
values (
  'Unisex Hair Studio — Victoria Island', 'victoria-island',
  '12 Adeola Odeku Street', 'Victoria Island', 'Lagos', 'NG',
  '+2348000000000', '2348000000000', 'hello@unisexhairstudio.com',
  'Africa/Lagos', true, 1
)
on conflict (slug) do nothing;

insert into public.location_hours (location_id, weekday, opens_at, closes_at, is_closed)
select
  l.id,
  d.weekday,
  d.opens_at,
  d.closes_at,
  (d.weekday = 0)
from public.salon_locations l
cross join (values
  (0, time '00:00', time '00:00'),
  (1, time '09:00', time '19:00'),
  (2, time '09:00', time '19:00'),
  (3, time '09:00', time '19:00'),
  (4, time '09:00', time '19:00'),
  (5, time '09:00', time '20:00'),
  (6, time '10:00', time '20:00')
) as d(weekday, opens_at, closes_at)
where l.slug = 'victoria-island'
on conflict (location_id, weekday) do nothing;

update public.business_settings
set business_name = 'Unisex Hair Studio',
    tagline        = 'Premium hair, braids, locs and colour for everyone.',
    support_email  = 'hello@unisexhairstudio.com',
    support_phone  = '+2348000000000',
    whatsapp_number= '2348000000000',
    instagram      = 'unisexhairstudio',
    facebook       = 'unitexhairstudio',
    free_delivery_threshold = 75000,
    standard_delivery_fee   = 2500
where id;

-- ---------------------------------------------------------------------------
-- Service taxonomy
-- ---------------------------------------------------------------------------
insert into public.service_categories (slug, name, description, icon, display_order)
values
  ('braids',   'Braids',   'Knotless, box, stitch, cornrow and beadwork across every length.',      'scissors', 1),
  ('locs',     'Locs',     'Starter locs, retwisting, sculpting, colouring and repairs.',            'sparkles', 2),
  ('haircuts', 'Haircuts', 'Precision cuts, fades, layers and restyling for every texture.',          'scissors', 3),
  ('colour',   'Colour',   'Balayage, highlights, gloss, colour correction and creative colour.',  'palette', 4),
  ('styling',  'Styling',  'Silk press, blowouts, updos, styling and event looks.',                  'wind', 5),
  ('treatments','Treatments','Repair, protein, hydration and scalp therapy for healthy hair.',       'droplet', 6),
  ('wig',      'Wig Services', 'Fitting, customisation, cutting and installation of wigs.',        'crown', 7)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Services
-- ---------------------------------------------------------------------------
insert into public.services (
  slug, name, category_id, summary, description, includes, aftercare,
  duration_minutes, buffer_minutes, price_from, price_to, price_unit,
  requires_consultation, requires_requirement, gender_restriction,
  is_featured, is_popular, display_order, status, badge
)
select
  v.slug, v.name, c.id, v.summary, v.description, v.includes, v.aftercare,
  v.duration_minutes, v.buffer_minutes, v.price_from, v.price_to, 'per_session',
  v.requires_consultation, true, null,
  v.is_featured, v.is_popular, v.display_order, 'active', v.badge
from (values
  ('knotless-braids', 'Knotless Braids', 'braids',
   'Long-lasting knotless braids with a seamless, natural finish.',
   'Our signature knotless technique keeps the parting clean and the hair light. We include a full wash, install, cut and style.',
   array['Shampoo and conditioning','Install with custom parting','Trim and custom-shape','Styling and finish'],
   array['Use a silk or satin bonnet nightly for the first 3 weeks','Avoid heavy oils at the roots for 2 weeks','Arrive with hair clean and detangled'],
   300, 30, 45000::numeric, 140000::numeric, false, true, true, 1, 'Most booked'),

  ('box-braids', 'Box Braids', 'braids',
   'Classic box braids for a bold, protective and durable look.',
   'Neat square partings finished with our signature edge treatment and styled to suit your face shape.',
   array['Shampoo and conditioning','Box braid install','Cut to length','Style and edge'],
   array['Keep the scalp clean and moisturised daily','Sleep in a bonnet','Reapply edge control roughly weekly'],
   270, 30, 38000::numeric, 120000::numeric, false, true, true, 2, null),

  ('stitch-braids', 'Stitch Braids', 'braids',
   'Fine, understated stitch braids for a refined everyday look.',
   'A refined stitch pattern for clients who want braids without the weight of full box braids.',
   array['Shampoo and conditioning','Stitch braid install','Neat finishing','Style'],
   array['Avoid water for the first 48 hours','Keep in a bonnet at night'],
   240, 30, 35000::numeric, 95000::numeric, false, false, false, 3, null),

  ('cornrows', 'Cornrow Braids', 'braids',
   'Clean, detailed cornrows from simple to statement patterns.',
   'Scalp-care focused cornrows, perfect for a protective style you can maintain at home.',
   array['Scalp treatment','Cornrow install','Style and finish'],
   array['Keep the parting line moisturised','Wear a bonnet at night'],
   180, 20, 20000::numeric, 60000::numeric, false, false, true, 4, null),

  ('starter-locs', 'Starter Locs', 'locs',
   'Begin your loc journey with an assessment and a considered starting point.',
   'We assess your hair, explain the commitment involved, and install starter locs with a maintenance plan.',
   array['Hair and scalp assessment','Loc consultation','Starter install','Maintenance plan'],
   array['Keep locs dry at the roots','Avoid tight manipulation'],
   240, 30, 35000::numeric, 80000::numeric, true, false, false, 5, null),

  ('retwist-locs', 'Retwist & Sculpt', 'locs',
   'Routine retwisting and sculpting to keep your locs neat and healthy.',
   'A tidy-up of every loc with deep conditioning and a shape that suits your loc pattern.',
   array['Deep cleanse','Retwist and sculpt','Hydration and finish'],
   array['Retouch every 6–8 weeks','Use a light oil on the lengths'],
   180, 20, 25000::numeric, 65000::numeric, false, false, false, 6, null),

  ('loc-colour', 'Loc Colour', 'locs',
   'Smooth, even colour on locs without disturbing the loc pattern.',
   'Colour formulated for locked hair, applied section by section for even saturation and depth.',
   array['Colour consultation','Gentle colour application','Wash and style'],
   array['Wait 72 hours before washing','Use colour-safe products'],
   210, 30, 30000::numeric, 90000::numeric, true, false, false, 7, null),

  ('silk-press', 'Silk Press', 'styling',
   'A smooth, glossy finish that respects the integrity of your hair.',
   'A heat-protected press that smooths texture while protecting strands. Includes treatment.',
   array['Deep conditioning','Heat protection','Press and blow-dry','Finish'],
   array['Avoid heat for 2 weeks','Sleep in a bonnet'],
   150, 15, 20000::numeric, 55000::numeric, false, true, true, 8, null),

  ('blowout', 'Blowout', 'styling',
   'A smooth, bouncy blowout for any occasion.',
   'Washed, treated and finished with heat protectant for a polished result that holds for days.',
   array['Shampoo and treatment','Heat protectant','Blow-dry and style'],
   array['Sleep in a bonnet to preserve the style'],
   120, 15, 15000::numeric, 35000::numeric, false, false, false, 9, null),

  ('bridal-look', 'Bridal & Event Styling', 'styling',
   'Bespoke styling for weddings, shoots and milestone events.',
   'We build the look around your outfit, venue and photographs — including a trial and on-the-day touch-up.',
   array['Style consultation','Trial session','On-the-day styling','Lash application on request'],
   array['Arrive with clean, dry hair','Bring your outfit and shoes for the trial'],
   240, 30, 60000::numeric, 250000::numeric, true, false, false, 10, 'Signature'),

  ('haircut', 'Signature Haircut', 'haircuts',
   'A cut tailored to your texture, hairline and how you actually wear your hair.',
   'We cut for the real shape of your hair, then show you how to maintain it at home.',
   array['Consultation','Wash and cut','Style','Take-home guidance'],
   array['Trim every 8–10 weeks to maintain shape'],
   60, 10, 8000::numeric, 20000::numeric, false, false, false, 11, null),

  ('balayage', 'Balayage', 'colour',
   'Hand-painted, lived-in colour with no harsh regrowth line.',
   'Freehand placement of lightener and toner for a gradient that grows out softly.',
   array['Colour consultation','Balayage placement','Toner','Wash and style'],
   array['Wait 72 hours before washing','Book a gloss every 6–8 weeks'],
   300, 30, 75000::numeric, 250000::numeric, true, false, false, 12, null),

  ('gloss-treatment', 'Gloss & Tone', 'colour',
   'Refresh faded colour and add shine between full colour sessions.',
   'A demi-permanent gloss that revives tone, corrects brassiness and adds mirror shine.',
   array['Shampoo and clarify','Gloss application','Processing','Style'],
   array['Wait 72 hours before washing'],
   120, 15, 25000::numeric, 55000::numeric, false, false, false, 13, null),

  ('protein-therapy', 'Protein & Repair Therapy', 'treatments',
   'Deep, targeted repair for damaged or over-processed hair.',
   'We bond and rebuild the hair structure, then seal it with moisture. Includes a home-care plan.',
   array['Diagnosis','Bond repair','Moisture seal','Take-home routine'],
   array['Avoid heat and chemical processing for 2 weeks'],
   150, 15, 20000::numeric, 55000::numeric, true, false, false, 14, null),

  ('scalp-therapy', 'Scalp Therapy', 'treatments',
   'A treatment for a flaky, itchy or irritated scalp.',
   'Exfoliation, steam and treatment to rebalance the scalp and support healthy growth.',
   array['Scalp analysis','Exfoliation and steam','Targeted treatment'],
   array['Wash your hair weekly'],
   90, 10, 12000::numeric, 30000::numeric, false, false, false, 15, null),

  ('wig-installation', 'Wig Installation', 'wig',
   'A secure, natural install with a custom hairline.',
   'We prepare your natural hair, build a secure foundation and blend the wig for a natural hairline.',
   array['Natural hair prep','Wig prep','Secure install','Blend and style'],
   array['Remove the wig nightly and re-wrap','Avoid adhesive on the hairline for 2 weeks'],
   180, 30, 25000::numeric, 60000::numeric, false, false, false, 16, null),

  ('wig-customisation', 'Wig Customisation', 'wig',
   'Cut, coloured and customised to suit your face and style.',
   'Layering, plucking, dyeing and styling to make a purchased or client-supplied wig your own.',
   array['Wig consultation','Cutting and plucking','Custom colour','Style'],
   array['Store on a wig stand'],
   150, 20, 25000::numeric, 90000::numeric, false, false, false, 17, null)
) as v(slug, name, category_slug, summary, description, includes, aftercare,
       duration_minutes, buffer_minutes, price_from, price_to,
       requires_consultation, is_popular, is_featured, display_order, badge)
join public.service_categories c on c.slug = v.category_slug
where not exists (select 1 from public.services s where s.slug = v.slug);

-- ---------------------------------------------------------------------------
-- Service price/duration variants (keyed on hair length)
-- ---------------------------------------------------------------------------
insert into public.service_variants (service_id, slug, label, price, duration_minutes, display_order)
select s.id, v.slug, v.label, v.price, v.duration_minutes, v.display_order
from (values
  ('knotless-braids', 'shoulder',  'Shoulder length',  45000::numeric, 240, 1),
  ('knotless-braids', 'bra-back',  'Bra-back',         95000::numeric, 420, 2),
  ('knotless-braids', 'waist',     'Waist length',     140000::numeric, 480, 3),
  ('box-braids',      'shoulder',  'Shoulder length',  38000::numeric, 210, 1),
  ('box-braids',      'bra-back',  'Bra-back',         82000::numeric, 390, 2),
  ('box-braids',      'waist',     'Waist length',     120000::numeric, 450, 3),
  ('balayage',        'partial',   'Partial highlights',  75000::numeric, 240, 1),
  ('balayage',        'full',      'Full head',            140000::numeric, 330, 2),
  ('balayage',        'full-plus', 'Full head + gloss',    195000::numeric, 420, 3),
  ('blowout',         'straight',  'Straight',        15000::numeric, 120, 1),
  ('blowout',         'curl',      'Curls',            25000::numeric, 150, 2),
  ('haircut',         'short',     'Short',           8000::numeric, 45, 1),
  ('haircut',         'medium',    'Medium',          12000::numeric, 60, 2),
  ('haircut',         'long',      'Long / layered',  20000::numeric, 75, 3)
) as v(service_slug, slug, label, price, duration_minutes, display_order)
join public.services s on s.slug = v.service_slug
on conflict (service_id, slug) do nothing;

-- ---------------------------------------------------------------------------
-- Product taxonomy
-- ---------------------------------------------------------------------------
insert into public.product_categories (slug, name, description, display_order)
values
  ('wigs',        'Wigs',        'Ready-to-wear, glueless and custom unit wigs.', 1),
  ('extensions',  'Extensions',  'Bulk hair, closures, frontals and pre-stretched hair.', 2),
  ('hair-care',   'Hair Care',   'Shampoos, conditioners, oils, masks and treatments.', 3),
  ('styling-tools','Styling Tools','Heat protectant, edges, brushes and accessories.', 4)
on conflict (slug) do nothing;

insert into public.products (
  slug, name, kind, category_id, brand, summary, description,
  benefits, hair_class, hair_texture, length_cm, cap_construction,
  is_glueless, is_pre_stretched, base_price, compare_at_price,
  status, is_featured, is_best_seller, display_order
)
select
  v.slug, v.name, v.kind::public.product_kind, c.id, v.brand, v.summary, v.description,
  v.benefits, v.hair_class::public.hair_class, null,
  v.length_cm, v.cap_construction, v.is_glueless, v.is_pre_stretched,
  v.base_price, v.compare_at_price,
  'active', v.is_featured, v.is_best_seller, v.display_order
from (values
  ('glueless-bob-wig', 'Glueless Bob Wig', 'wig', 'wigs', 'Maison Luxe',
   'A ready-to-wear bob with a seamless hairline and adjustable elastic band.',
   'Designed for everyday wear: pre-plucked hairline, bleached knots and an adjustable band for a secure, comfortable fit. No glue required.',
   array['Installs in under 10 minutes','Adjustable fit for all head sizes','Pre-plucked natural hairline'],
   'human', 500, '13x4 lace', true, false,
   185000::numeric, 240000::numeric, true, true, 1),

  ('full-lace-body-wave', 'Full Lace Body Wave Wig', 'wig', 'wigs', 'Maison Luxe',
   'A full-lace wig with a deep body wave and an undetectable hairline.',
   'Hand-tied full lace with baby hairs for the most natural hairline possible. Heat-stylable to 350°C.',
   array['Fully hand-tied lace','Undetectable hairline','Heat-stylable to 350°C'],
   'human', 500, 'Full lace', true, false,
   320000::numeric, null, true, false, 2),

  ('bone-straight-bundle', 'Bone Straight Bundle', 'extension', 'extensions', 'Maison Luxe',
   'Double-drawn, bone-straight bundles that stay smooth through multiple washes.',
   'Unprocessed 100% human hair, double-drawn for consistent density and minimal shedding.',
   array['Double-drawn for low shedding','Lasts several installs with care','Minimal tangling'],
   'human', 500, null, false, false,
   125000::numeric, 150000::numeric, false, true, 3),

  ('curly-bundle', 'Deep Curly Bundle', 'extension', 'extensions', 'Maison Luxe',
   'Rich, defined curls with a soft, weightless feel.',
   'Curl-pattern matched so every bundle blends seamlessly with the rest of the set.',
   array['Defined curl pattern','Soft, weightless feel','Colour-matched for seamless blending'],
   'human', 500, null, false, false,
   130000::numeric, null, false, true, 4),

  ('frontal-hd', 'HD Lace Frontal', 'extension', 'extensions', 'Maison Luxe',
   'A 13x4 HD lace frontal with pre-plucked hairline for seamless installs.',
   '13x4 HD lace with adjustable elasticity and a natural-density hairline.',
   array['13x4 HD lace','Pre-plucked hairline','Bleached knots'],
   'human', 500, '13x4 HD lace', false, false,
   85000::numeric, null, false, true, 5),

  ('growth-oil', 'Edge & Growth Oil', 'hair_care', 'hair-care', 'Maison Luxe',
   'A lightweight, non-greasy oil for the scalp and edges.',
   'Blends castor, jojoba and peppermint to nourish the scalp and lay edges without build-up.',
   array['Non-greasy finish','Promotes scalp circulation','Safe on protective styles'],
   null, null, null, false, false,
   8500::numeric, 11000::numeric, true, true, 6),

  ('protein-mask', 'Bond Repair Protein Mask', 'hair_care', 'hair-care', 'Maison Luxe',
   'An intensive weekly mask that rebuilds damaged bonds.',
   'Formulated for bleached, heat-treated and over-processed hair. Visible repair after the first use.',
   array['Rebuilds broken bonds','Restores elasticity','Safe on extensions and locs'],
   null, null, null, false, false,
   12500::numeric, null, true, true, 7),

  ('clarifying-shampoo', 'Clarifying Shampoo', 'hair_care', 'hair-care', 'Maison Luxe',
   'A deep-cleansing shampoo that lifts product build-up without stripping.',
   'Removes heavy oils, gels and silicone build-up while keeping the hair balanced. Suitable for locs and braids.',
   array['Removes product build-up','pH balanced','Safe for locs and braids'],
   null, null, null, false, false,
   9500::numeric, null, false, true, 8),

  ('heat-protectant', 'Heat Protectant Spray', 'styling', 'styling-tools', 'Maison Luxe',
   'A lightweight shield against heat damage up to 230°C.',
   'Protects against both flat-iron and blow-dryer damage without weighing the hair down.',
   array['Protects to 230°C','Non-greasy','Leaves hair soft'],
   null, null, null, false, false,
   7500::numeric, 9000::numeric, true, true, 9),

  ('silk-bonnet', 'Mulberry Silk Bonnet', 'accessory', 'styling-tools', 'Maison Luxe',
   'A 22-momme mulberry silk bonnet that protects styles overnight.',
   'Reduces friction and moisture loss overnight. Protects braids, locs, curls and installs.',
   array['22-momme mulberry silk','Reduces friction and frizz','Protects styles overnight'],
   null, null, null, false, false,
   15000::numeric, 19000::numeric, false, true, 10)
) as v(slug, name, kind, category_slug, brand, summary, description, benefits,
       hair_class, length_cm, cap_construction, is_glueless, is_pre_stretched,
       base_price, compare_at_price, is_featured, is_best_seller, display_order)
join public.product_categories c on c.slug = v.category_slug
where not exists (select 1 from public.products p where p.slug = v.slug);

-- Variants for products that need size/length choice
insert into public.product_variants (product_id, sku, slug, name, price, stock_on_hand, is_default, display_order)
select p.id,
       'UHS-' || upper(left(replace(p.slug, '-', ''), 8)) || '-' || upper(v.slug),
       v.slug, v.label, v.price, v.stock, (v.display_order = 1), v.display_order
from (values
  ('bone-straight-bundle', 'single', 'Single bundle (18")', 125000::numeric, 14, 1),
  ('bone-straight-bundle', 'three',  '3 bundles (18")',     350000::numeric, 6, 2),
  ('curly-bundle',         'single', 'Single bundle (16")', 130000::numeric, 11, 1),
  ('curly-bundle',         'three',  '3 bundles (16")',     365000::numeric, 4, 2),
  ('frontal-hd',           '14x4',   '13x4 HD lace',         85000::numeric, 8, 1),
  ('glueless-bob-wig',     'std',    'Standard fit',        185000::numeric, 5, 1),
  ('full-lace-body-wave',  '20in',   '20 inch',             320000::numeric, 3, 1)
) as v(product_slug, slug, label, price, stock, display_order)
join public.products p on p.slug = v.product_slug
on conflict (product_id, slug) do nothing;

-- Single-variant products
insert into public.product_variants (product_id, sku, slug, name, price, stock_on_hand, is_default)
select p.id,
       'UHS-' || upper(left(replace(p.slug, '-', ''), 8)),
       'default',
       'Standard',
       p.base_price,
       case when p.kind = 'hair_care' then 40 else 25 end,
       true
from public.products p
where p.kind in ('hair_care', 'accessory', 'styling', 'tool')
  and not exists (select 1 from public.product_variants v where v.product_id = p.id);

-- ---------------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------------
insert into public.coupons (code, description, discount_type, value, min_subtotal, max_discount, starts_at, ends_at, is_active)
values
  ('WELCOME10',  'First order: 10% off up to ₦20,000', 'percentage',   10,  25000, 20000, now() - interval '1 day', now() + interval '6 months', true),
  ('FREESHIP',   'Free delivery on orders over ₦25,000', 'free_shipping', 1, 25000, null,    now() - interval '1 day', now() + interval '3 months',  true)
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Open vacancies
-- ---------------------------------------------------------------------------
insert into public.jobs (
  slug, title, department, employment_type, summary, description,
  responsibilities, requirements, nice_to_have, benefits,
  salary_min, salary_max, openings, min_experience_years,
  status, is_featured, published_at, screening_questions
)
-- Enum columns are cast explicitly: VALUES infers text, which will not coerce.
select
  v.slug, v.title, v.department, v.employment_type::public.employment_type,
  v.summary, v.description,
  v.responsibilities, v.requirements, v.nice_to_have, v.benefits,
  v.salary_min, v.salary_max, v.openings, v.min_experience_years,
  v.status::public.job_status, v.is_featured, v.published_at, v.screening_questions
from (values
  ('senior-braids-artist', 'Senior Braids Artist', 'Braids', 'full_time',
   'Lead our braids book across knotless, box and stitch work.',
   'We are looking for an experienced braids artist to lead a chair and mentor junior artists. You will own your client relationships end to end, from consultation through aftercare advice.',
   array['Consult with clients and translate their references into a plan','Deliver knotless, box and stitch braids to our finish standard','Maintain accurate client notes and aftercare guidance','Support and coach junior artists','Contribute to our retail product recommendations'],
   array['At least 5 years of professional braiding experience','A verifiable portfolio of your work','Confident in client consultation and upselling','Comfortable working to a target diary'],
   array['Locs experience','Colouring experience','Training or mentoring experience'],
   array['Monthly performance bonus','Product commission on recommendations','Paid continuing education','Staff salon and product discounts'],
   120000::numeric, 220000::numeric, 2, 5,
   'open', true, now() - interval '3 days',
   '[{"key":"portfolio","label":"Share a portfolio link","type":"url","required":true},{"key":"speciality","label":"Which styles are you strongest at?","type":"text","required":true},{"key":"start","label":"Earliest start date","type":"date","required":true}]'::jsonb),

  ('colourist', 'Colourist', 'Colour', 'full_time',
   'Join our colour bar working across balayage, correction and gloss.',
   'Our colourist handles everything from lived-in balayage to complex colour correction. You will have access to our full colour library and a dedicated colour room.',
   array['Consult and formulate colour plans','Perform balayage, highlights, gloss and colour correction','Maintain detailed formula records','Advise clients on home colour-safe routines'],
   array['At least 4 years in a salon colour role','Strong colour theory knowledge','Able to read and correct previous colour work'],
   array['Balayage certification','Curly or textured hair specialist'],
   array['Product commission','Paid colour training','Flexible roster'],
   100000::numeric, 200000::numeric, 1, 4,
   'open', false, now() - interval '10 days',
   '[{"key":"portfolio","label":"Colour portfolio link","type":"url","required":true},{"key":"start","label":"Earliest start date","type":"date","required":true}]'::jsonb),

  ('front-desk-associate', 'Front Desk Associate', 'Front of House', 'full_time',
   'Be the first warm voice clients hear.',
   'You will manage bookings, welcome clients and keep the studio running smoothly. Prior experience in hospitality is a plus, not a requirement.',
   array['Manage the booking diary and walk-in flow','Welcome and check in every client','Handle payments and orders','Support retail sales'],
   array['Warm, professional manner','Comfortable with phones and apps','Organised and calm under pressure'],
   array['Spa or salon front-desk experience','Bilingual (English plus a Nigerian language)'],
   array['Monthly bonus','Meal allowance','Staff salon and product discounts'],
   70000::numeric, 100000::numeric, 1, 1,
   'open', false, now() - interval '1 day',
   '[{"key":"experience","label":"Relevant experience","type":"textarea","required":true},{"key":"start","label":"Earliest start date","type":"date","required":true}]'::jsonb)
) as v(slug, title, department, employment_type, summary, description,
       responsibilities, requirements, nice_to_have, benefits,
       salary_min, salary_max, openings, min_experience_years,
       status, is_featured, published_at, screening_questions)
where not exists (select 1 from public.jobs j where j.slug = v.slug);

-- ---------------------------------------------------------------------------
-- FAQs
-- ---------------------------------------------------------------------------
insert into public.faqs (question, answer, category, display_order)
select * from (values
  ('Do I need an account to book an appointment?',
   'You can browse services, hairstyles and our gallery without an account. Creating a free account lets you complete your requirement form, submit reference images, manage your bookings and check out faster.', 'booking', 1),
  ('How far in advance can I book?',
   'Bookings open 60 days ahead and we ask for at least 4 hours notice so we can prepare your slot properly. Same-day and walk-in availability depends on the diary.', 'booking', 2),
  ('What is your cancellation policy?',
   'You can cancel or reschedule free of charge up to 24 hours before your appointment. Inside 24 hours, 50% of any deposit paid is forfeited because the chair is held for you.', 'booking', 3),
  ('Why do you ask for my requirements before the appointment?',
   'It means your stylist knows exactly what you want before you arrive — your hair history, allergies, scalp condition and the look you are after. Most of our clients say it is the difference between a good result and their best one.', 'booking', 4),
  ('Do you sell the hair used in your services?',
   'Yes. Every extension and wig we install is available in our shop, and your stylist will recommend exactly what suits your hair and your budget.', 'shop', 5),
  ('How do I pay?',
   'We accept card, bank transfer and USSD through Paystack, which works with all major Nigerian banks. You can pay a deposit when booking and settle the balance at the salon.', 'shop', 6),
  ('Do you deliver products?',
   'Yes, within Lagos. Delivery is free on orders over ₦75,000 and ₦2,500 otherwise. You can also collect from any of our branches at no charge.', 'shop', 7),
  ('Can I reschedule my appointment?',
   'Yes, from your account under Appointments. Pick a new time from the live diary and it is confirmed instantly, subject to availability.', 'booking', 8),
  ('Do you train or take on apprentices?',
   'We do. Post openings on our Careers page and watch for apprenticeship and internship roles, or send a portfolio to hello@unisexhairstudio.com.', 'careers', 9)
) as v(question, answer, category, display_order)
where not exists (select 1 from public.faqs f where f.question = v.question);

-- ---------------------------------------------------------------------------
-- Message templates
-- ---------------------------------------------------------------------------
insert into public.message_templates (key, channel, subject, body, variables)
values
  ('appointment.confirmation', 'email', 'Your booking at Unisex Hair Studio is confirmed ({{reference}})',
   'Hi {{first_name}}, your {{service_name}} appointment is confirmed for {{starts_at}} with {{staff_name}}. Reference {{reference}}. Address: {{location_address}}. Please arrive 10 minutes early and bring any reference images you have saved.', array['first_name','reference','service_name','starts_at','staff_name','location_address']),
  ('appointment.reminder_24h', 'email', 'See you tomorrow, {{first_name}}',
   'A quick reminder that your {{service_name}} appointment is on {{starts_at}} with {{staff_name}}. Reply or WhatsApp us if anything has changed.', array['first_name','service_name','starts_at','staff_name']),
  ('appointment.reminder_2h', 'sms', NULL,
   'Unisex Hair Studio: your {{service_name}} appointment is at {{starts_at}}. Ref {{reference}}.', array['service_name','starts_at','reference']),
  ('order.confirmation', 'email', 'Order {{order_number}} received',
   'Hi {{first_name}}, thanks for your order of {{item_count}} item(s) totalling {{total}}. We will let you know as soon as it is ready for {{fulfilment}}.', array['first_name','order_number','item_count','total','fulfilment']),
  ('order.ready', 'whatsapp', NULL,
   'Hi {{first_name}}, your order {{order_number}} is ready for pickup at Unisex Hair Studio, {{location_name}}. Bring your reference.', array['first_name','order_number','location_name']),
  ('application.received', 'email', 'We received your application for {{job_title}}',
   'Hi {{full_name}}, thanks for applying to Unisex Hair Studio for {{job_title}}. Your reference is {{reference}}. Our team reviews every application and will be in touch.', array['full_name','job_title','reference'])
on conflict (key) do nothing;