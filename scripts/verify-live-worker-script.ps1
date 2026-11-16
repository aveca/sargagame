# verify-live-worker-script.ps1 - Recupere la source LIVE du Worker sg-payments
# et compare son empreinte a celle du depot. LECTURE SEULE (GET).
#
# SECURITE :
#   - le token Cloudflare est lu depuis Windows Credential Manager (jamais affiché)
#   - aucun secret n'est écrit, affiché ni loggé
#   - la source live est écrite dans un fichier temporaire local (hors dépôt)
#
# Usage :
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-live-worker-script.ps1
#   ... -CompareRepoPath workers/sg-payments/index.js

param(
    [string]$WorkerName = 'sg-payments',
    [string]$AccountId = 'abf2b92cf718313567b4b38eb9dda17f',
    [string]$CompareRepoPath = ''
)

$ErrorActionPreference = 'Stop'

$credType = @'
using System;
using System.Runtime.InteropServices;

public static class WinCredLive {
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
        if ([WinCredLive]::CredRead($Target, 1, 0, [ref]$ptr)) {
            $c = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][WinCredLive+CREDENTIAL])
            $size = [int]$c.CredentialBlobSize
            if ($size -le 0) { return '' }
            $bytes = New-Object byte[] $size
            [Runtime.InteropServices.Marshal]::Copy($c.CredentialBlob, $bytes, 0, $size)
            return [Text.Encoding]::Unicode.GetString($bytes).TrimEnd([char]0)
        }
    } catch {
    } finally {
        if ($ptr -ne [IntPtr]::Zero) { [WinCredLive]::CredFree($ptr) }
    }
    return ''
}

$token = Read-WinCredential -Target 'SARGAGAME_CLOUDFLARE_API_TOKEN'
if ([string]::IsNullOrEmpty($token)) {
    Write-Output 'FAIL      token Cloudflare absent de Windows Credential Manager.'
    exit 2
}

$outFile = Join-Path ([IO.Path]::GetTempPath()) ('sg-live-' + $WorkerName + '-' + [Guid]::NewGuid().ToString('N') + '.multipart')
# curl interprete les antislashs comme des echappements dans son fichier de config :
# on impose des slashes pour les chemins.
$outFileCurl = $outFile.Replace('\', '/')
$url = "https://api.cloudflare.com/client/v4/accounts/$AccountId/workers/scripts/$WorkerName/content/v2"

# Le token passe par un fichier de config curl : jamais en ligne de commande.
$cfgFile = Join-Path ([IO.Path]::GetTempPath()) ('sgcf_' + [Guid]::NewGuid().ToString('N') + '.cfg')
$cfg = @"
url = "$url"
request = "GET"
max-time = 60
silent
show-error
header = "Authorization: Bearer $token"
header = "Accept: multipart/form-data"
output = "$outFileCurl"
write-out = "%{http_code}"
"@
Set-Content -Path $cfgFile -Value $cfg -Encoding ASCII
$code = (& curl.exe --config $cfgFile 2>$null | Select-Object -Last 1)
Remove-Item $cfgFile -Force -ErrorAction SilentlyContinue
$token = $null

Write-Output "=== LIVE Worker '$WorkerName' (GET content/v2, lecture seule) ==="
Write-Output ("HTTP = {0}" -f $code)

if ($code -ne '200') {
    Write-Output 'FAIL      recuperation impossible (verifier le scope du token).'
    exit 1
}

$raw = [IO.File]::ReadAllBytes($outFile)
Write-Output ("multipart total = {0} octets" -f $raw.Length)

# Extraction de la partie "index.js" du multipart.
$marker = [Text.Encoding]::UTF8.GetBytes('filename="index.js"')
$idx = -1
for ($i = 0; $i -le $raw.Length - $marker.Length; $i++) {
    $match = $true
    for ($j = 0; $j -lt $marker.Length; $j++) {
        if ($raw[$i + $j] -ne $marker[$j]) { $match = $false; break }
    }
    if ($match) { $idx = $i; break }
}
if ($idx -lt 0) {
    Write-Output 'FAIL      partie index.js introuvable dans la reponse multipart.'
    exit 1
}

# Corps = apres le separateur de partie (double CRLF) jusqu'au CRLF final.
$start = $idx
while ($start -lt $raw.Length -and -not ($raw[$start] -eq 13 -and $raw[$start + 1] -eq 10 -and $raw[$start + 2] -eq 13 -and $raw[$start + 3] -eq 10)) { $start++ }
$start += 4
$end = $raw.Length - 1
while ($end -gt $start -and -not ($raw[$end] -eq 13 -and $raw[$end - 1] -eq 10)) { $end-- }
$scriptBytes = New-Object byte[] ($end - $start)
[Array]::Copy($raw, $start, $scriptBytes, 0, $scriptBytes.Length)

$sha = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($scriptBytes)).Replace('-', '')
Write-Output ("LIVE index.js = {0} octets" -f $scriptBytes.Length)
Write-Output ("LIVE sha256   = {0}" -f $sha)

$livePath = Join-Path ([IO.Path]::GetTempPath()) ('sg-live-index-' + [Guid]::NewGuid().ToString('N') + '.js')
[IO.File]::WriteAllBytes($livePath, $scriptBytes)
Write-Output ("LIVE copie locale (hors depot) : {0}" -f $livePath)

if ($CompareRepoPath -ne '') {
    $repoFull = Join-Path (Split-Path -Parent $PSScriptRoot) $CompareRepoPath
    if (Test-Path $repoFull) {
        $repoBytes = [IO.File]::ReadAllBytes($repoFull)
        $repoSha = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($repoBytes)).Replace('-', '')
        Write-Output ("REPO {0} = {1} octets sha256={2}" -f $CompareRepoPath, $repoBytes.Length, $repoSha)
        Write-Output ("MATCH REPO/LIVE = {0}" -f ($repoSha -eq $sha))
    } else {
        Write-Output ("REPO absent du worktree : {0}" -f $repoFull)
    }
}
