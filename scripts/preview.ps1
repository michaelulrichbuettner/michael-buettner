param(
  [int]$Port = 8765
)

$siteRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()

Write-Host "Lokale Vorschau: http://localhost:$Port/experimente.html"
Write-Host "Zum Beenden Strg+C drücken."

$mimeTypes = @{
  ".css"  = "text/css; charset=utf-8"
  ".html" = "text/html; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".mp4"  = "video/mp4"
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $stream = $client.GetStream()
    $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
    $requestLine = $reader.ReadLine()

    while (-not [string]::IsNullOrEmpty($reader.ReadLine())) {
      # Read and discard the remaining HTTP request headers.
    }

    $status = "200 OK"
    $contentType = "text/plain; charset=utf-8"
    $content = [byte[]]::new(0)

    if ($requestLine -match "^GET\s+([^\s]+)\s+HTTP/") {
      $requestPath = ([Uri]("http://localhost" + $matches[1])).AbsolutePath
      $relativePath = [Uri]::UnescapeDataString($requestPath.TrimStart("/"))

      if ([string]::IsNullOrWhiteSpace($relativePath)) {
        $relativePath = "index.html"
      }

      $requestedPath = [System.IO.Path]::GetFullPath((Join-Path $siteRoot $relativePath))

      if (-not $requestedPath.StartsWith($siteRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        $status = "403 Forbidden"
      } elseif (-not [System.IO.File]::Exists($requestedPath)) {
        $status = "404 Not Found"
      } else {
        $extension = [System.IO.Path]::GetExtension($requestedPath).ToLowerInvariant()
        $contentType = if ($mimeTypes.ContainsKey($extension)) {
          $mimeTypes[$extension]
        } else {
          "application/octet-stream"
        }
        $content = [System.IO.File]::ReadAllBytes($requestedPath)
      }
    } else {
      $status = "405 Method Not Allowed"
    }

    $headers = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($content.Length)`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
    $stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($content.Length -gt 0) {
      $stream.Write($content, 0, $content.Length)
    }
    $stream.Dispose()
    $client.Dispose()
  }
}
finally {
  $listener.Stop()
}
