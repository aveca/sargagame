# verify-windows-secrets.ps1 - Verification de presence et de recuperabilite des secrets
# Windows Credential Manager SARGAGAME_* - SARGAGAME UNIQUEMENT.
#
# SECURITY:
#   - NEVER display a secret value.
#   - NEVER log a secret value.
#   - NEVER transmit a secret value.
#   - Output = presence, length, mode (test/live/n/a) and a truncated,
#     non-reversible SHA-256 fingerprint (used to detect key rotation).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-windows-secrets.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-windows-secrets.ps1 -CompareConfig

param(
    [switch]$CompareConfig
)

$ErrorActionPreference = 'Stop'

# ---- Windows CredRead P/Invoke ---------------------------------------------
$credType = @'
using System;
using System.Runtime.InteropServices;

public static class WinCred {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public uint Flags;
        public uint Type;
        public IntPtr TargetName;
        public IntPtr Comment;
        public long LastWritten;
        public uint CredentialBlobSize;
        public IntPtr CredentialBlob;
        public uint Persist;
        public uint AttributeCount;
        public IntPtr Attributes;
        public IntPtr TargetAlias;
        public IntPtr UserName;
    }

    [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, uint type, int reserved, out IntPtr credentialPtr);

    [DllImport("advapi32.dll", SetLastError = true)]
    public static extern void CredFree(IntPtr credentialPtr);
}
'@

Add-Type -TypeDefinition $credType -ErrorAction SilentlyContinue

function Read-WinCredential {
    param([string]$Target)
    $ptr = [IntPtr]::Zero
    try {
        if ([WinCred]::CredRead($Target, 1, 0, [ref]$ptr)) {
            $c = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][WinCred+CREDENTIAL])
            $size = [int]$c.CredentialBlobSize
            if ($size -le 0) { return [pscustomobject]@{ Found = $true; Value = '' } }
            $bytes = New-Object byte[] $size
            [Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob, $bytes, 0, $size)
            $str = [Text.Encoding]::Unicode.GetString($bytes)
            # Le blob Generic stocke un octet nul terminal : le retirer pour un fingerprint comparable.
            return [pscustomobject]@{ Found = $true; Value = $str.TrimEnd([char]0) }
        }
    } catch {
        # silent: secret stays absent
    } finally {
        if ($ptr -ne [IntPtr]::Zero) { [WinCred]::CredFree($ptr) }
    }
    return [pscustomobject]@{ Found = $false; Value = '' }
}

function Get-Fingerprint {
    param([string]$Value)
    if ([string]::IsNullOrEmpty($Value)) { return 'none' }
    $sha = [Security.Cryptography.SHA256]::Create()
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    $hash = $sha.ComputeHash($bytes)
    return ([BitConverter]::ToString($hash).Replace('-', '').Substring(0, 12).ToLower())
}

function Get-Mode {
    param([string]$Value)
    if ([string]::IsNullOrEmpty($Value)) { return 'n/a' }
    if ($Value.StartsWith('live_')) { return 'live' }
    if ($Value.StartsWith('test_')) { return 'test' }
    if ($Value.StartsWith('sk_live')) { return 'live' }
    if ($Value.StartsWith('sk_test')) { return 'test' }
    if ($Value.StartsWith('whsec_')) { return 'webhook' }
    return 'unknown'
}

# ---- SARGAGAME secrets required on the hotel payment path -------------------
$targets = @(
    @{ Target = 'SARGAGAME_MOLLIE_TEST_API_KEY';   Role = 'Mollie API key (test mode)' },
    @{ Target = 'SARGAGAME_MOLLIE_LIVE_API_KEY';   Role = 'Mollie API key (live mode)' },
    @{ Target = 'SARGAGAME_MOLLIE_WEBHOOK_SECRET'; Role = 'Mollie webhook signature' },
    @{ Target = 'SARGAGAME_MOLLIE_PROFILE_ID';     Role = 'Mollie payment profile' },
    @{ Target = 'SARGAGAME_SUPABASE_URL';          Role = 'Supabase project URL' },
    @{ Target = 'SARGAGAME_SUPABASE_SERVICE_KEY';  Role = 'Supabase service_role key' },
    @{ Target = 'SARGAGAME_RESEND_API_KEY';        Role = 'Resend transactional email' },
    @{ Target = 'SARGAGAME_CLOUDFLARE_API_TOKEN';  Role = 'Cloudflare API (workers/routes)' },
    @{ Target = 'SARGAGAME_GITHUB_TOKEN';          Role = 'GitHub token (PR/CI)' }
)

Write-Output "=== SARGAGAME secrets in Windows Credential Manager ==="
Write-Output "(presence, length, mode, truncated SHA-256 fingerprint -- VALUES ARE NEVER DISPLAYED)"
Write-Output ""

$results = @{}
foreach ($t in $targets) {
    $cred = Read-WinCredential -Target $t.Target
    if ($cred.Found -and $cred.Value.Length -gt 0) {
        $len = $cred.Value.Length
        $mode = Get-Mode $cred.Value
        $fp = Get-Fingerprint $cred.Value
        Write-Output ("OK       {0,-34} role={1,-38} len={2,-4} mode={3,-8} fp={4}" -f $t.Target, $t.Role, $len, $mode, $fp)
        $results[$t.Target] = @{ Found = $true; Length = $len; Mode = $mode; Fingerprint = $fp; Value = $cred.Value }
    } else {
        Write-Output ("ABSENT   {0,-34} role={1}" -f $t.Target, $t.Role)
        $results[$t.Target] = @{ Found = $false; Length = 0; Mode = 'n/a'; Fingerprint = 'none'; Value = '' }
    }
}

# ---- Compare with local config (rotation detection) -------------------------
if ($CompareConfig) {
    Write-Output ""
    Write-Output "=== Compare local public/api/mollie-config.php vs Windows (rotation detection) ==="
    $configPath = Join-Path $PSScriptRoot '..\public\api\mollie-config.php'
    if (-not (Test-Path $configPath)) {
        Write-Output "ABSENT   local config file not found: public/api/mollie-config.php"
    } else {
        # PHP probe: absolute path injected, returns ONLY fingerprints (never values).
        $probe = @'
<?php
$__p = $argv[1] ?? '';
$__c = @include $__p;
if (!is_array($__c)) { echo json_encode([]); exit; }
$__out = [];
foreach (['api_key','webhook_secret','profile_id','supabase_url','supabase_service_key','resend_key'] as $__k) {
    $__v = (string)($__c[$__k] ?? '');
    if ($__v === '') { $__out[$__k] = null; continue; }
    $__mode = 'unknown';
    if (strpos($__v, 'live_') === 0 || strpos($__v, 'sk_live') === 0) { $__mode = 'live'; }
    elseif (strpos($__v, 'test_') === 0 || strpos($__v, 'sk_test') === 0) { $__mode = 'test'; }
    elseif (strpos($__v, 'whsec_') === 0) { $__mode = 'webhook'; }
    $__out[$__k] = ['fp' => substr(hash('sha256', $__v), 0, 12), 'len' => strlen($__v), 'mode' => $__mode];
}
echo json_encode($__out);
'@
        $tmp = Join-Path ([IO.Path]::GetTempPath()) ('sg_cfg_probe_' + [Guid]::NewGuid().ToString('N') + '.php')
        Set-Content -Path $tmp -Value $probe -Encoding ASCII
        $json = & php $tmp $configPath 2>$null
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        $local = @{}
        if ($json) {
            try { $parsed = $json | ConvertFrom-Json; $local = $parsed } catch { }
        }
        $map = [ordered]@{
            'api_key'              = 'SARGAGAME_MOLLIE_TEST_API_KEY'
            'webhook_secret'       = 'SARGAGAME_MOLLIE_WEBHOOK_SECRET'
            'profile_id'           = 'SARGAGAME_MOLLIE_PROFILE_ID'
            'supabase_url'         = 'SARGAGAME_SUPABASE_URL'
            'supabase_service_key' = 'SARGAGAME_SUPABASE_SERVICE_KEY'
            'resend_key'           = 'SARGAGAME_RESEND_API_KEY'
        }
        foreach ($k in $map.Keys) {
            $winTarget = $map[$k]
            $entry = $local.$k
            $win = $results[$winTarget]
            if ($null -eq $entry) {
                Write-Output ("CONFIG-EMPTY  key='{0}' : absent or empty in local config" -f $k)
            } elseif ($win.Found) {
                $same = if ($entry.fp -eq $win.Fingerprint) { 'IDENTICAL' } else { 'DIFFERENT' }
                Write-Output ("CONFIG        key='{0}' vs Windows '{1}' : {2} (config_mode={3}, config_fp={4}, win_fp={5})" -f $k, $winTarget, $same, $entry.mode, $entry.fp, $win.Fingerprint)
            } else {
                Write-Output ("NO-WIN       key='{0}' : present in local config but absent from Windows" -f $k)
            }
        }
    }
}

Write-Output ""
$found = @($results.Values | Where-Object { $_.Found }).Count
$total = $results.Count
Write-Output ("RESULT: {0}/{1} SARGAGAME secrets present and recoverable from Windows Credential Manager." -f $found, $total)
