# check_versions.ps1 - Vérifie la version v220 sur les 5 domaines

$domains = @(
    "https://sargasses-martinique.com/version.json",
    "https://sargasses-guadeloupe.com/version.json",
    "https://sargassummiami.com/version.json",
    "https://sargassumcancun.com/version.json",
    "https://sargassumpuntacana.com/version.json"
)

foreach ($domain in $domains) {
    try {
        $response = Invoke-RestMethod -Uri $domain -Method Get
        $version = $response.v
        $ageHours = [math]::Round((New-TimeSpan -Start $response.date -End (Get-Date)).TotalHours, 1)
        
        $status = if ($version -eq "v220") { "✅" } else { "❌" }
        Write-Host "$($domain.PadRight(40)) : $version (data $ageHours h) $status"
    }
    catch {
        Write-Host "$($domain.PadRight(40)) : ❌ ERREUR - $_" -ForegroundColor Red
    }
}