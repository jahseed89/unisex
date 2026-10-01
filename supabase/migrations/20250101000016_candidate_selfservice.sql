-- =============================================================================
-- 0016 · Candidate self-service
-- Small, separately deployable additions that the UI needs after the initial
-- schema was written. Kept in their own migration so an existing database can
-- pick them up without a full reset.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Withdraw an application
--
-- A candidate may withdraw their own application at any point before it is
-- hired. Withdrawn rows drop out of the partial unique index, which means the
-- same person may legitimately re-apply for the same vacancy later.
-- ---------------------------------------------------------------------------
create or replace function public.fn_withdraw_application(
  p_application_id uuid
)
returns public.job_applications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_app        public.job_applications%rowtype;
  v_updated    public.job_applications%rowtype;
  v_is_owner   boolean;
  v_is_staff   boolean := app_private.is_staff_or_admin(auth.uid());
begin
  select * into v_app
  from public.job_applications
  where id = p_application_id
  for update;

  if v_app.id is null then
    raise exception 'Application not found' using errcode = 'no_data_found';
  end if;

  -- Ownership is established either by applicant_id or by matching the email on
  -- the signed-in profile: applicants often apply before creating an account.
  v_is_owner :=
    (v_app.applicant_id is not null and v_app.applicant_id = auth.uid())
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and lower(p.email) = lower(v_app.email)
    );

  if not (v_is_owner or v_is_staff) then
    raise exception 'You can only withdraw your own application'
      using errcode = 'insufficient_privilege';
  end if;

  if v_app.status in ('withdrawn', 'rejected') then
    raise exception 'This application is already closed' using errcode = 'check_violation';
  end if;

  update public.job_applications
  set status       = 'withdrawn',
      stage_notes  = coalesce(stage_notes, 'Withdrawn by the candidate'),
      reviewed_at  = now(),
      reviewed_by  = coalesce(reviewed_by, auth.uid()),
      updated_at   = now()
  where id = p_application_id
  returning * into v_updated;

  -- Notify the hiring team so withdrawn candidates do not linger in the pipeline.
  perform public.fn_notify_admins(
    'application.withdrawn',
    'Application withdrawn',
    format('%s withdrew their application for %s',
           v_app.full_name,
           (select title from public.jobs where id = v_app.job_id)),
    format('/admin/careers/applications/%s', v_app.id),
    jsonb_build_object('application_id', v_app.id)
  );

  return v_updated;
end;
$$;

comment on function public.fn_withdraw_application is
  'Candidate self-service. Ownership is verified against applicant_id or the signed-in profile email.';

grant execute on function public.fn_withdraw_application(uuid) to authenticated;
