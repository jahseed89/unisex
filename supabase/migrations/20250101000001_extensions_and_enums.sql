-- =============================================================================
-- 0001 · Extensions & Enumerated Types
-- Black Chery Unisex Studio — Salon & Commerce Platform
-- =============================================================================

-- pgcrypto is deliberately NOT required: gen_random_uuid() is core since
-- PostgreSQL 13, and fn_next_reference() derives randomness from it. Keeping
-- the dependency surface small makes local/emulated runs possible.
create extension if not exists "pg_trgm" with schema extensions;

-- --- Identity -----------------------------------------------------------------
create type public.user_gender as enum (
  'female',
  'male',
  'non_binary',
  'other',
  'prefer_not_to_say'
);

-- --- Booking ------------------------------------------------------------------
create type public.appointment_status as enum (
  'draft',
  'pending',
  'confirmed',
  'checked_in',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
  'rescheduled'
);

create type public.booking_source as enum (
  'web',
  'phone',
  'whatsapp',
  'walk_in',
  'admin',
  'recurring'
);

create type public.requirement_status as enum (
  'draft',
  'submitted',
  'under_review',
  'approved',
  'changes_requested',
  'closed'
);

-- --- Availability -------------------------------------------------------------
create type public.time_off_kind as enum (
  'personal',
  'sick',
  'annual',
  'training',
  'blocked'
);

-- --- Commerce -----------------------------------------------------------------
create type public.product_status as enum ('draft', 'active', 'archived');
create type public.product_kind as enum (
  'wig',
  'extension',
  'hair_care',
  'styling',
  'accessory',
  'tool',
  'treatment'
);
create type public.order_status as enum (
  'pending',
  'confirmed',
  'processing',
  'ready_for_pickup',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned',
  'refunded'
);
create type public.fulfilment_type as enum ('pickup', 'delivery');
create type public.payment_status as enum (
  'unpaid',
  'awaiting_payment',
  'partially_paid',
  'paid',
  'refunded',
  'partially_refunded',
  'failed',
  'voided'
);
create type public.payment_provider as enum (
  'paystack',
  'flutterwave',
  'moniepoint',
  'bank_transfer',
  'cash',
  'pos',
  'waived'
);
create type public.inventory_reason as enum (
  'sale',
  'restock',
  'return',
  'adjustment',
  'wastage',
  'damage',
  'transfer'
);

-- --- Hair domain --------------------------------------------------------------
create type public.hair_texture as enum (
  'straight',
  'wavy',
  'curly',
  'coily',
  'kinky'
);
create type public.hair_class as enum ('human', 'synthetic', 'blend', 'vegan');

-- --- Recruitment --------------------------------------------------------------
create type public.job_status as enum ('draft', 'open', 'on_hold', 'closed', 'archived');
create type public.employment_type as enum (
  'full_time',
  'part_time',
  'contract',
  'internship',
  'apprenticeship',
  'freelance'
);
create type public.application_status as enum (
  'submitted',
  'screening',
  'shortlisted',
  'interview_scheduled',
  'interviewed',
  'offer',
  'hired',
  'rejected',
  'withdrawn'
);

-- --- Reviews & notifications --------------------------------------------------
create type public.review_status as enum ('pending', 'published', 'rejected', 'flagged');
create type public.notification_channel as enum ('in_app', 'email', 'sms', 'whatsapp', 'push');
create type public.delivery_status as enum (
  'queued',
  'processing',
  'sent',
  'delivered',
  'read',
  'failed',
  'suppressed'
);
create type public.notification_priority as enum ('low', 'normal', 'high', 'critical');

-- --- Shared money/quantity ----------------------------------------------------
create type public.discount_type as enum ('percentage', 'fixed_amount', 'free_shipping');

-- --- Domains ------------------------------------------------------------------
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

comment on schema app_private is
  'Server-only helpers. No client exposure. Reserved for Edge Functions and cron.';