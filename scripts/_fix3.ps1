$ErrorActionPreference = 'Stop'
$enc = New-Object System.Text.UTF8Encoding($false)
$NL = "`n"

function Patch([string]$file, [string]$old, [string]$new, [string]$label) {
  $p = (Resolve-Path $file).Path
  $t = [System.IO.File]::ReadAllText($p, [System.Text.Encoding]::UTF8)
  if (-not $t.Contains($old)) { throw "not found in ${file}: $label" }
  [System.IO.File]::WriteAllText($p, $t.Replace($old, $new), $script:enc)
  Write-Output "  [$file] $label"
}

# --- 1. Repair the mangled comment block in 0014 ---------------------------
$m = (Resolve-Path 'supabase\migrations\20250101000014_triggers_storage.sql').Path
$lines = [System.IO.File]::ReadAllLines($m, [System.Text.Encoding]::UTF8)
$start = -1
for ($i = 0; $i -lt $lines.Count; $i++) {
  if ($lines[$i].Trim() -eq '-- The') { $start = $i; break }
}
if ($start -lt 0) { throw 'mangled comment start not found' }
if ($lines[$start + 1].Trim() -ne 'equirements bucket is deliberately PRIVATE: reference images are personal') {
  throw "unexpected line after start: $($lines[$start+1])"
}
$replacement = [string[]]@(
  '-- The "requirements" bucket is deliberately PRIVATE. Reference images are',
  '-- personal data, reachable only through signed URLs issued to the owning',
  '-- customer and the stylist assigned to their appointment (see policies below).'
)
$lines = $lines[0..($start - 1)] + $replacement + $lines[($start + 4)..($lines.Count - 1)]
[System.IO.File]::WriteAllLines($m, $lines, $enc)
Write-Output '  [0014] repaired mangled comment block'

# --- 2. service_catalog referenced sc.name; the column is `label` -----------
Patch 'supabase\migrations\20250101000012_rls.sql' @'
  sc.name as variant_name,
'@ @'
  sc.label as variant_name,
'@ 'service_catalog: service_variants.label, not .name'

# --- 3. Stub auth.uid() in the validator preamble --------------------------
Patch 'scripts\validate-sql.mjs' @'
-- storage.objects subset used by the bucket policies
'@ @'
-- Supabase exposes the caller's id as auth.uid() from the JWT claim.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(
    current_setting('request.jwt.claim.sub', true), ''
  )::uuid;
$$;

-- storage.objects subset used by the bucket policies
'@ 'stub auth.uid()'

# --- 4. Exclusion-constraint strip regex was too fragile -------------------
Patch 'scripts\validate-sql.mjs' @'
  out = out.replace(
    /alter table public\.appointments\s+add constraint appointments_no_overlap\s+exclude using gist \([\s\S]*?\)\s*where \([^)]*\);/,
    () => {
      skipped.push(`${file}: appointments_no_overlap exclusion constraint (btree_gist)`)
      return ''
    },
  )
'@ @'
  out = out.replace(
    /alter table public\.appointments\s+add constraint appointments_no_overlap[\s\S]*?'no_show'\);/,
    () => {
      skipped.push(`${file}: appointments_no_overlap exclusion constraint (btree_gist)`)
      return ''
    },
  )
'@ 'exclusion-constraint strip regex'

Write-Output 'PATCHES OK'