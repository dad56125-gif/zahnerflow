# TIME_WAIT Analysis Script
# Shows detailed breakdown of TIME_WAIT connections

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " TIME_WAIT Connection Analysis" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Get all TIME_WAIT connections
$connections = netstat -an | Select-String "TIME_WAIT"

Write-Host "Total TIME_WAIT: $($connections.Count)" -ForegroundColor Yellow
Write-Host ""

# Parse and group by local port
$portGroups = @{}
$remoteGroups = @{}

foreach ($line in $connections) {
    $parts = $line.ToString().Trim() -split '\s+'
    if ($parts.Length -ge 3) {
        $local = $parts[1]
        $remote = $parts[2]
        
        # Extract local port
        if ($local -match ':(\d+)$') {
            $localPort = $Matches[1]
            if (-not $portGroups.ContainsKey($localPort)) {
                $portGroups[$localPort] = 0
            }
            $portGroups[$localPort]++
        }
        
        # Extract remote address:port
        if (-not $remoteGroups.ContainsKey($remote)) {
            $remoteGroups[$remote] = 0
        }
        $remoteGroups[$remote]++
    }
}

Write-Host "=== Top Remote Endpoints ===" -ForegroundColor Green
$remoteGroups.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 15 | ForEach-Object {
    $port = $_.Key -replace '.*:', ''
    $portName = switch ($port) {
        "8001" { "Zahner Simulator" }
        "8012" { "Furnace Simulator" }
        "8013" { "MFC Simulator" }
        "3001" { "Backend" }
        "8083" { "Frontend" }
        default { "" }
    }
    Write-Host ("  {0,-25} : {1,4} connections  {2}" -f $_.Key, $_.Value, $portName)
}

Write-Host ""
Write-Host "=== Sample Connections ===" -ForegroundColor Green
$connections | Select-Object -First 20 | ForEach-Object {
    Write-Host "  $_"
}

Write-Host ""
Write-Host "=== Port Legend ===" -ForegroundColor Magenta
Write-Host "  8001 = Zahner Simulator"
Write-Host "  8012 = Furnace Simulator"
Write-Host "  8013 = MFC Simulator"
Write-Host "  3001 = Backend"
Write-Host "  8083 = Frontend"
