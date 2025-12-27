# ZahnerFlow Stability Test Script
# Usage: .\stability-test.ps1 [-DurationHours 4] [-LogFile "stability.log"]

param(
    [int]$DurationHours = 4,
    [string]$LogFile = "stability-test-$(Get-Date -Format 'yyyyMMdd-HHmmss').log",
    [int]$IntervalSeconds = 30
)

# 应用相关端口
$AppPorts = @("8001", "8012", "8013", "3001", "8083")
$PortPattern = "(:8001|:8012|:8013|:3001|:8083)"

$StartTime = Get-Date
$EndTime = $StartTime.AddHours($DurationHours)

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " ZahnerFlow Stability Test" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Start Time: $StartTime"
Write-Host "End Time: $EndTime"
Write-Host "Log File: $LogFile"
Write-Host "Interval: ${IntervalSeconds}s"
Write-Host "Monitored Ports: $($AppPorts -join ', ')" -ForegroundColor Yellow
Write-Host ""

# Init log
$LogHeader = "Timestamp,Elapsed_Min,App_TIME_WAIT,Total_TIME_WAIT,Node_Memory_MB,SQLite_Size_KB"
$LogHeader | Out-File $LogFile -Encoding UTF8

function Get-Metrics {
    $metrics = @{}
    
    # 1. TIME_WAIT - Total
    $allTimeWait = netstat -an 2>$null | Select-String "TIME_WAIT"
    $metrics.TotalTimeWait = $allTimeWait.Count
    
    # 2. TIME_WAIT - App related only (8001, 8012, 8013, 3001, 8083)
    $appTimeWait = $allTimeWait | Where-Object { $_ -match $PortPattern }
    $metrics.AppTimeWait = $appTimeWait.Count
    
    # 3. Node.js memory
    $nodeProcs = Get-Process node -ErrorAction SilentlyContinue
    $totalMem = 0
    if ($nodeProcs) {
        $totalMem = ($nodeProcs | Measure-Object WorkingSet64 -Sum).Sum / 1MB
    }
    $metrics.NodeMemMB = [math]::Round($totalMem, 2)
    
    # 4. SQLite file size
    $dbPath = ".\apps\backend\data\zahnerflow.db"
    $dbSize = 0
    if (Test-Path $dbPath) {
        $dbSize = (Get-Item $dbPath).Length / 1KB
    }
    $metrics.SQLiteSizeKB = [math]::Round($dbSize, 2)
    
    return $metrics
}

function Write-Status {
    param($Metrics, $ElapsedMin, $Initial, $AppConnections)
    
    $status = "OK"
    $color = "Green"
    
    # Check App TIME_WAIT threshold (only care about app ports now)
    if ($Metrics.AppTimeWait -gt 20) {
        $status = "WARN: App TW > 20"
        $color = "Yellow"
    }
    if ($Metrics.AppTimeWait -gt 50) {
        $status = "CRITICAL: App TW > 50"
        $color = "Red"
    }
    if ($Metrics.NodeMemMB -gt ($Initial.NodeMemMB + 200)) {
        $status = "WARN: Memory growth > 200MB"
        $color = "Yellow"
    }
    
    $memDelta = $Metrics.NodeMemMB - $Initial.NodeMemMB
    if ($memDelta -ge 0) {
        $memDeltaStr = "+$([math]::Round($memDelta, 1))"
    }
    else {
        $memDeltaStr = "$([math]::Round($memDelta, 1))"
    }
    
    $timeStr = Get-Date -Format 'HH:mm:ss'
    $line = "[$timeStr] AppTW:$($Metrics.AppTimeWait)/$($Metrics.TotalTimeWait) | Node:$($Metrics.NodeMemMB)MB($memDeltaStr) | DB:$($Metrics.SQLiteSizeKB)KB | "
    Write-Host $line -NoNewline
    Write-Host $status -ForegroundColor $color
    
    # Show App TIME_WAIT details if any
    if ($AppConnections -and $AppConnections.Count -gt 0) {
        # Group by remote port
        $grouped = $AppConnections | Group-Object { 
            $parts = $_.Line.Trim() -split '\s+'
            if ($parts.Length -ge 3) { $parts[2] } else { "Unknown" }
        } | Sort-Object Count -Descending
        
        $details = $grouped | ForEach-Object {
            $port = $_.Name -replace '.*:', ''
            $portName = switch ($port) {
                "8001" { "Zahner" }
                "8012" { "Furnace" }
                "8013" { "MFC" }
                "3001" { "Backend" }
                "8083" { "Frontend" }
                default { $port }
            }
            "$portName`:$($_.Count)"
        }
        Write-Host "    -> $($details -join ', ')" -ForegroundColor DarkGray
    }
}

# Get initial metrics
Write-Host "Getting initial metrics..." -ForegroundColor Yellow
$InitialMetrics = Get-Metrics
Write-Host "Initial App TIME_WAIT: $($InitialMetrics.AppTimeWait) (Total: $($InitialMetrics.TotalTimeWait))"
Write-Host "Initial Node Memory: $($InitialMetrics.NodeMemMB) MB"
Write-Host "Initial SQLite: $($InitialMetrics.SQLiteSizeKB) KB"
Write-Host ""
Write-Host "Monitoring started..." -ForegroundColor Green
Write-Host "(AppTW = App TIME_WAIT on ports 8001,8012,8013,3001,8083)"
Write-Host ""

# Main loop
while ((Get-Date) -lt $EndTime) {
    $Now = Get-Date
    $Elapsed = ($Now - $StartTime).TotalMinutes
    
    # Get all TIME_WAIT and filter app-related
    $allTimeWait = netstat -an 2>$null | Select-String "TIME_WAIT"
    $appConnections = $allTimeWait | Where-Object { $_ -match $PortPattern }
    
    $Metrics = @{
        TotalTimeWait = $allTimeWait.Count
        AppTimeWait   = $appConnections.Count
        NodeMemMB     = 0
        SQLiteSizeKB  = 0
    }
    
    # Node.js memory
    $nodeProcs = Get-Process node -ErrorAction SilentlyContinue
    if ($nodeProcs) {
        $Metrics.NodeMemMB = [math]::Round(($nodeProcs | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 2)
    }
    
    # SQLite size
    $dbPath = ".\apps\backend\data\zahnerflow.db"
    if (Test-Path $dbPath) {
        $Metrics.SQLiteSizeKB = [math]::Round((Get-Item $dbPath).Length / 1KB, 2)
    }
    
    # Write to log
    $LogLine = "$($Now.ToString('yyyy-MM-dd HH:mm:ss')),$([math]::Round($Elapsed, 1)),$($Metrics.AppTimeWait),$($Metrics.TotalTimeWait),$($Metrics.NodeMemMB),$($Metrics.SQLiteSizeKB)"
    $LogLine | Out-File $LogFile -Append -Encoding UTF8
    
    # Console output with details
    Write-Status -Metrics $Metrics -ElapsedMin $Elapsed -Initial $InitialMetrics -AppConnections $appConnections
    
    # Wait
    Start-Sleep -Seconds $IntervalSeconds
}

# Summary report
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Test Complete" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

$FinalMetrics = Get-Metrics
$TotalElapsed = ((Get-Date) - $StartTime).TotalHours

Write-Host ""
Write-Host "Duration: $([math]::Round($TotalElapsed, 2)) hours"
Write-Host ""
Write-Host "Metric Changes:"
Write-Host "  App TIME_WAIT: $($InitialMetrics.AppTimeWait) -> $($FinalMetrics.AppTimeWait)"
Write-Host "  Total TIME_WAIT: $($InitialMetrics.TotalTimeWait) -> $($FinalMetrics.TotalTimeWait)"
$memChange = [math]::Round($FinalMetrics.NodeMemMB - $InitialMetrics.NodeMemMB, 2)
Write-Host "  Node Memory: $($InitialMetrics.NodeMemMB) MB -> $($FinalMetrics.NodeMemMB) MB (Delta: $memChange MB)"
Write-Host "  SQLite: $($InitialMetrics.SQLiteSizeKB) KB -> $($FinalMetrics.SQLiteSizeKB) KB"
Write-Host ""
Write-Host "Log saved to: $LogFile" -ForegroundColor Green
