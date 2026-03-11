$env:DATABASE_URL = "postgresql://drofit_user:drofit_password@127.0.0.1:5432/drofit_metrics_db?schema=public"
$env:JWT_SECRET = "super-secret-key-change-in-prod"
$env:PORT = "4000"
Start-Process npx -ArgumentList "tsx src/index.ts" -WorkingDirectory "c:\Proyectos\Metria\Backend" -WindowStyle Hidden
Start-Sleep -s 12
try {
    $loginBody = @{ email = "admin@metria.com"; password = "metria2025" } | ConvertTo-Json
    $res = Invoke-RestMethod -Uri "http://127.0.0.1:4000/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $res.token
    $metrics = Invoke-RestMethod -Uri "http://127.0.0.1:4000/api/metrics/daily" -Headers @{ Authorization = "Bearer $token" }
    $metrics | ConvertTo-Json | Out-File -FilePath "c:\Proyectos\Metria\Backend\verify_result.json"
    Write-Host "VERIFY_SUCCESS"
}
catch {
    Write-Error $_.Exception.Message
}
