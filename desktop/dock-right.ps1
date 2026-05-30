# Moves a VS Code window to a given screen rectangle (used to dock it to the right of Snowstorm).
# VS Code can take a moment to create its window, so we poll for a few seconds.
param(
    [int]$X, [int]$Y, [int]$W, [int]$H,
    [string]$TitleMatch = ""
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinDock {
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@

$SWP_SHOWWINDOW = 0x40
$SW_RESTORE = 9

for ($i = 0; $i -lt 28; $i++) {
    Start-Sleep -Milliseconds 250
    $procs = Get-Process -Name Code -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 }
    if (-not $procs) { continue }

    $target = $null
    if ($TitleMatch) {
        $target = $procs | Where-Object { $_.MainWindowTitle -like "*$TitleMatch*" } | Select-Object -First 1
    }
    if (-not $target) {
        # Fall back to the most recently started Code window.
        $target = $procs | Sort-Object StartTime -Descending | Select-Object -First 1
    }
    if ($target) {
        $h = $target.MainWindowHandle
        [WinDock]::ShowWindow($h, $SW_RESTORE) | Out-Null
        [WinDock]::SetWindowPos($h, [IntPtr]::Zero, $X, $Y, $W, $H, $SWP_SHOWWINDOW) | Out-Null
        [WinDock]::SetForegroundWindow($h) | Out-Null
        break
    }
}
