# verify-mollie-live-key.ps1 - Verifie (lecture seule) la validite de la cle
# Mollie LIVE stockee dans Windows Credential Manager.
#
# SECURITE :
#   - la cle LIVE n'est jamais affichee, jamais loguee, jamais ecrite dans le depot
#   - la config temporaire est creee HORS du depot (temp systeme) et supprimee
#   - aucune transaction, aucun checkout : uniquement des GET de lecture
#
# Usage :
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-mollie-live-key.ps1

param()

$ErrorActionPreference = 'Stop'

$credType = @'
using System;
using System.Runtime.InteropServices;

public static class WinCredLiveKey {
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
        if ([WinCredLiveKey]::CredRead($Target, 1, 0, [ref]$ptr)) {
            $c = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][WinCredLiveKey+CREDENTIAL])
            $size = [int]$c.CredentialBlobSize
            if ($size -le 0) { return '' }
            $bytes = New-Object byte[] $size
            [Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob, $bytes, 0, $size)
            return [Text.Encoding]::Unicode.GetString($bytes).TrimEnd([char]0)
        }
    } catch {
    } finally {
        if ($ptr -ne [IntPtr]::Zero) { [WinCredLiveKey]::CredFree($ptr) }
    }
    return ''
}

function Get-Fingerprint {
    param([string]$Value)
    if ([string]::IsNullOrEmpty($Value)) { return 'none' }
    $sha = [Security.Cryptography.SHA256]::Create()
    $hash = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value))
    return ([BitConverter]::ToString($hash).Replace('-', '').Substring(0, 12).ToLower())
}

$map = [ordered]@{
    'SG_PROV_API_KEY'              = 'SARGAGAME_MOLLIE_LIVE_API_KEY'
    'SG_PROV_WEBHOOK_SECRET'       = 'SARGAGAME_MOLLIE_WEBHOOK_SECRET'
    'SG_PROV_PROFILE_ID'           = 'SARGAGAME_MOLLIE_PROFILE_ID'
    'SG_PROV_SUPABASE_URL'         = 'SARGAGAME_SUPABASE_URL'
    'SG_PROV_SUPABASE_SERVICE_KEY' = 'SARGAGAME_SUPABASE_SERVICE_KEY'
    'SG_PROV_RESEND_KEY'           = 'SARGAGAME_RESEND_API_KEY'
}

foreach ($envName in $map.Keys) {
    $val = Read-WinCredential -Target $map[$envName]
    if ([string]::IsNullOrEmpty($val)) {
        [Environment]::SetEnvironmentVariable($envName, $null)
    } else {
        [Environment]::SetEnvironmentVariable($envName, $val)
    }
    $val = $null
}

$liveKey = [Environment]::GetEnvironmentVariable('SG_PROV_API_KEY')
Write-Output "=== Cle Mollie LIVE (Windows Credential Manager) ==="
if ([string]::IsNullOrEmpty($liveKey)) {
    Write-Output 'FAIL      SARGAGAME_MOLLIE_LIVE_API_KEY absent de Windows Credential Manager.'
    exit 2
}
Write-Output ("OK        presente (len={0}, mode={1}, fp={2})" -f $liveKey.Length, $(if ($liveKey.StartsWith('live_')) { 'live' } else { 'UNKNOWN' }), (Get-Fingerprint $liveKey))

$tmpDir = Join-Path ([IO.Path]::GetTempPath()) ('sg-live-key-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
$tmpConfig = Join-Path $tmpDir 'mollie-config.php'

try {
    & php (Join-Path $PSScriptRoot 'provision-mollie-config.php') --config=$tmpConfig --backup-dir=$tmpDir | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Output 'FAIL      generation de la config temporaire.' ; exit 3 }

    Write-Output ""
    Write-Output "=== Test fournisseur (GET de lecture, aucune transaction) ==="
    & php (Join-Path $PSScriptRoot 'verify-payment-providers.php') --config=$tmpConfig
    $code = $LASTEXITCODE
} finally {
    foreach ($envName in $map.Keys) { [Environment]::SetEnvironmentVariable($envName, $null) }
    Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
    $liveKey = $null
}

Write-Output ""
Write-Output ("EXIT={0}" -f $code)
exit $code
