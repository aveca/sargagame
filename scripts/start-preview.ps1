$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
Set-Location "C:\Users\user\Documents\Backup\sargagame"
$proc = Start-Process -FilePath "npx.cmd" -ArgumentList "vite","preview","--port","8799","--strictPort" -PassThru -RedirectStandardOutput "C:\Users\user\Documents\Backup\sargagame\preview.log" -RedirectStandardError "C:\Users\user\Documents\Backup\sargagame\preview.err.log" -WorkingDirectory "C:\Users\user\Documents\Backup\sargagame"
Write-Host "PID: $($proc.Id)"
Start-Sleep -Seconds 3
Write-Host "Done"
