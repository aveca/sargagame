# provision-local-mollie-config.ps1 - Provisionne la config Mollie LOCALE (developpement)
# a partir de Windows Credential Manager (targets SARGAGAME_*).
#
# SECURITY:
#   - Les valeurs ne sont JAMAIS affichees, JAMAIS loguees, JAMAIS passees en argument CLI.
#   - Elles transitent par variables d'environnement, puis sont purgees immediatement.
#   - Mode LOCAL = cle MOLLIE TEST uniquement. La cle LIVE n'est jamais injectee ici.
#
# Usage :
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/provision-local-mollie-config.ps1 [-DryRun]

param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$credType = @'
using System;
using System.Runtime.InteropServices;

public static class WinCred2 {
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
        if ([WinCred2]::CredRead($Target, 1, 0, [ref]$ptr)) {
            $c = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][WinCred2+CREDENTIAL])
            $size = [int]$c.CredentialBlobSize
            if ($size -le 0) { return '' }
            $bytes = New-Object byte[] $size
            [Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob, $bytes, 0, $size)
            $str = [Text.Encoding]::Unicode.GetString($bytes)
            # Le blob Generic stocke un octet nul terminal : le retirer avant injection.
            return $str.TrimEnd([char]0)
        }
    } catch {
    } finally {
        if ($ptr -ne [IntPtr]::Zero) { [WinCred2]::CredFree($ptr) }
    }
    return ''
}

# Mapping env var -> target Windows. LOCAL = TEST key only (jamais la LIVE).
$map = [ordered]@{
    'SG_PROV_API_KEY'              = 'SARGAGAME_MOLLIE_TEST_API_KEY'
    'SG_PROV_WEBHOOK_SECRET'       = 'SARGAGAME_MOLLIE_WEBHOOK_SECRET'
    'SG_PROV_PROFILE_ID'           = 'SARGAGAME_MOLLIE_PROFILE_ID'
    'SG_PROV_SUPABASE_URL'         = 'SARGAGAME_SUPABASE_URL'
    'SG_PROV_SUPABASE_SERVICE_KEY' = 'SARGAGAME_SUPABASE_SERVICE_KEY'
    'SG_PROV_RESEND_KEY'           = 'SARGAGAME_RESEND_API_KEY'
}

$missing = @()
foreach ($envName in $map.Keys) {
    $val = Read-WinCredential -Target $map[$envName]
    if ([string]::IsNullOrEmpty($val)) {
        $missing += $map[$envName]
        [Environment]::SetEnvironmentVariable($envName, $null)
    } else {
        [Environment]::SetEnvironmentVariable($envName, $val)
    }
    $val = $null
}

if ($missing.Count -gt 0) {
    Write-Output ("MISSING dans Windows Credential Manager : {0}" -f ($missing -join ', '))
}

$phpScript = Join-Path $PSScriptRoot 'provision-mollie-config.php'
$argsList = @($phpScript)
if ($DryRun) { $argsList += '--dry-run' }

$output = & php @argsList 2>&1
$exit = $LASTEXITCODE

# Purge immediate des secrets de l'environnement du processus
foreach ($envName in $map.Keys) { [Environment]::SetEnvironmentVariable($envName, $null) }

Write-Output $output
Write-Output ("EXIT={0}" -f $exit)
exit $exit
