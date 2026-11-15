param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("monitors", "capture", "click")]
    [string]$Action,
    [int]$MonitorId = 0,
    [int]$X = 0,
    [int]$Y = 0
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

function Get-Monitors {
    $index = 0
    $items = @()
    foreach ($screen in [System.Windows.Forms.Screen]::AllScreens) {
        $index += 1
        $items += @{
            id = $index
            left = $screen.Bounds.Left
            top = $screen.Bounds.Top
            width = $screen.Bounds.Width
            height = $screen.Bounds.Height
            primary = $screen.Primary
            name = $screen.DeviceName
        }
    }
    return $items
}

function Get-TargetMonitor([int]$Id) {
    $monitors = Get-Monitors
    $target = $monitors | Where-Object { $_.id -eq $Id }
    if ($null -eq $target) {
        throw "The requested monitor no longer exists."
    }
    return $target
}

if ($Action -eq "monitors") {
    ConvertTo-Json -Compress -InputObject @(Get-Monitors)
    exit 0
}

$monitor = Get-TargetMonitor $MonitorId

if ($Action -eq "capture") {
    $bounds = New-Object System.Drawing.Rectangle($monitor.left, $monitor.top, $monitor.width, $monitor.height)
    $bitmap = New-Object System.Drawing.Bitmap($monitor.width, $monitor.height)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $graphics.Dispose()

    $scale = [Math]::Min(1.0, 1600.0 / $monitor.width)
    $imageWidth = [Math]::Max(1, [int][Math]::Round($monitor.width * $scale))
    $imageHeight = [Math]::Max(1, [int][Math]::Round($monitor.height * $scale))
    $resized = New-Object System.Drawing.Bitmap($imageWidth, $imageHeight)
    $resizeGraphics = [System.Drawing.Graphics]::FromImage($resized)
    $resizeGraphics.DrawImage($bitmap, 0, 0, $imageWidth, $imageHeight)
    $resizeGraphics.Dispose()
    $bitmap.Dispose()

    $stream = New-Object System.IO.MemoryStream
    $resized.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
    $resized.Dispose()
    $base64 = [Convert]::ToBase64String($stream.ToArray())
    $stream.Dispose()
    Write-Output $base64
    exit 0
}

if ($X -lt $monitor.left -or $Y -lt $monitor.top -or $X -ge ($monitor.left + $monitor.width) -or $Y -ge ($monitor.top + $monitor.height)) {
    throw "The approved coordinate is outside the current monitor bounds."
}

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class NexusMouse {
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")]
    public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
}
"@
[NexusMouse]::SetCursorPos($X, $Y) | Out-Null
Start-Sleep -Milliseconds 250
[NexusMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
[NexusMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
Write-Output "clicked"
