# Agmay 3D Converter - Zero Dependency Local Server
# Run this script in PowerShell to host the website locally on port 8000.

$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "  AGMAY 3D CONVERTER DEVELOPMENT SERVER  " -ForegroundColor Magenta
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "Local URL: http://localhost:$port/" -ForegroundColor Green
    Write-Host "Press [Ctrl+C] to terminate the server." -ForegroundColor Yellow
    Write-Host ""

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $url = $request.Url.LocalPath
        if ($url -eq "/") { $url = "/index.html" }

        # Resolve local file path
        # Replace forward slashes with backslashes for Windows path resolver
        $sanitizedUrl = $url.Replace("/", "\")
        $filePath = Join-Path (Get-Location).Path $sanitizedUrl

        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            # Resolve Content-Type header
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = "text/plain"
            if ($ext -eq ".html") { $mime = "text/html; charset=utf-8" }
            elseif ($ext -eq ".css") { $mime = "text/css; charset=utf-8" }
            elseif ($ext -eq ".js") { $mime = "application/javascript; charset=utf-8" }
            elseif ($ext -eq ".png") { $mime = "image/png" }
            elseif ($ext -eq ".jpg" -or $ext -eq ".jpeg") { $mime = "image/jpeg" }
            elseif ($ext -eq ".ico") { $mime = "image/x-icon" }
            elseif ($ext -eq ".svg") { $mime = "image/svg+xml" }

            # Disable caching to force fresh updates
            $response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
            $response.Headers.Add("Pragma", "no-cache")
            $response.Headers.Add("Expires", "0")

            $response.ContentType = $mime
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "[200] Serving: $url" -ForegroundColor DarkGreen
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 File Not Found")
            $response.ContentType = "text/plain"
            $response.ContentLength64 = $errBytes.Length
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            Write-Host "[404] Not Found: $url" -ForegroundColor Red
        }
        $response.OutputStream.Close()
    }
}
catch {
    Write-Host "Server error: $_" -ForegroundColor Red
}
finally {
    $listener.Stop()
    Write-Host "`nServer stopped." -ForegroundColor Red
}
