try {
    $body = @{
        model = 'qwen3.5:latest'
        prompt = 'say hi'
        stream = $false
        options = @{ temperature = 0.1 }
    } | ConvertTo-Json -Compress
    $r = Invoke-WebRequest -Uri 'http://localhost:11434/api/generate' -Method POST -Body $body -ContentType 'application/json' -TimeoutSec 30
    Write-Host 'STATUS:' $r.StatusCode
    Write-Host 'BODY:' $r.Content
} catch {
    Write-Host 'ERR:' $_.Exception.Message
}
