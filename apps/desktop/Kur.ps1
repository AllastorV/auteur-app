# =============================================================================
#  Auteur — installer (PowerShell)
#
#  WHY NOT AN .EXE INSTALLER
#  Windows Smart App Control blocks unsigned self-extracting executables
#  outright — there is no "run anyway" button, unlike SmartScreen. Both the
#  NSIS installer and the portable build are refused on such machines
#  (measured 2026-08-27). A plain folder plus this script is NOT blocked,
#  so this is the only route that works before a code-signing certificate
#  exists.
#
#  It does exactly what the NSIS script does:
#    * copies the program into %LOCALAPPDATA%\Programs\Auteur
#    * creates Desktop and Start-menu shortcuts
#    * registers .sbp (icon + double-click) under HKCU
#    * writes an entry into Programs and Features
#    * leaves Kaldir.ps1 (uninstaller) next to the program
#
#  No administrator rights are required: everything is per-user.
#  Uninstalling never touches user data (%APPDATA%\Auteur).
#
#  Usage:  right-click -> Run with PowerShell
#      or: powershell -ExecutionPolicy Bypass -File Kur.ps1
# =============================================================================

$ErrorActionPreference = 'Stop'

$Urun    = 'Auteur'
$Surum   = '0.1.0'
$Sinif   = 'Auteur.Proje'
$Hedef   = Join-Path $env:LOCALAPPDATA "Programs\$Urun"
$Kaynak  = Join-Path $PSScriptRoot 'win-unpacked'
$UnKey   = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Auteur'

function Yaz($metin, $renk = 'Gray') { Write-Host $metin -ForegroundColor $renk }

Yaz ''
Yaz "  $Urun $Surum — setup" 'Yellow'
Yaz '  Screenwriting and storyboarding in one program.' 'DarkGray'
Yaz ''

if (-not (Test-Path $Kaynak)) {
  Yaz "  ERROR: 'win-unpacked' folder not found next to this script." 'Red'
  Yaz "  Extract the whole ZIP first, then run Kur.ps1 from inside it." 'Red'
  Read-Host '  Press Enter to close'
  exit 1
}

# --- Is it already running? Copying over a running exe fails silently ----
$calisan = Get-Process -Name 'Auteur' -ErrorAction SilentlyContinue
if ($calisan) {
  Yaz '  Auteur is running. Close it and run setup again.' 'Red'
  Read-Host '  Press Enter to close'
  exit 1
}

Yaz "  Installing to: $Hedef" 'DarkGray'
New-Item -ItemType Directory -Force -Path $Hedef | Out-Null
Copy-Item -Path (Join-Path $Kaynak '*') -Destination $Hedef -Recurse -Force
Yaz '  Files copied.' 'Green'

$Exe  = Join-Path $Hedef 'Auteur.exe'
$Ikon = Join-Path $Hedef 'resources\dosya.ico'

# --- shortcuts -----------------------------------------------------------
$sh = New-Object -ComObject WScript.Shell
$masaustu = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) "$Urun.lnk"))
$masaustu.TargetPath = $Exe
$masaustu.IconLocation = "$Exe,0"
$masaustu.WorkingDirectory = $Hedef
$masaustu.Save()

$baslatDizin = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\$Urun"
New-Item -ItemType Directory -Force -Path $baslatDizin | Out-Null
$baslat = $sh.CreateShortcut((Join-Path $baslatDizin "$Urun.lnk"))
$baslat.TargetPath = $Exe
$baslat.IconLocation = "$Exe,0"
$baslat.WorkingDirectory = $Hedef
$baslat.Save()
Yaz '  Shortcuts created (Desktop + Start menu).' 'Green'

# --- .sbp association ----------------------------------------------------
# The document icon is a SEPARATE drawing from the application icon; using
# the exe's own icon here would blur that distinction.
New-Item -Path "HKCU:\Software\Classes\.sbp" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\.sbp" -Name '(Default)' -Value $Sinif
New-Item -Path "HKCU:\Software\Classes\$Sinif" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\$Sinif" -Name '(Default)' -Value 'Auteur Project'
New-Item -Path "HKCU:\Software\Classes\$Sinif\DefaultIcon" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\$Sinif\DefaultIcon" -Name '(Default)' -Value $Ikon
New-Item -Path "HKCU:\Software\Classes\$Sinif\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\$Sinif\shell\open\command" -Name '(Default)' -Value "`"$Exe`" `"%1`""
Yaz '  .sbp files now use the Auteur icon and open with Auteur.' 'Green'

# --- Programs and Features ----------------------------------------------
New-Item -Path $UnKey -Force | Out-Null
Set-ItemProperty -Path $UnKey -Name 'DisplayName'     -Value $Urun
Set-ItemProperty -Path $UnKey -Name 'DisplayVersion'  -Value $Surum
Set-ItemProperty -Path $UnKey -Name 'Publisher'       -Value $Urun
Set-ItemProperty -Path $UnKey -Name 'DisplayIcon'     -Value $Exe
Set-ItemProperty -Path $UnKey -Name 'InstallLocation' -Value $Hedef
Set-ItemProperty -Path $UnKey -Name 'UninstallString' `
  -Value "powershell -ExecutionPolicy Bypass -File `"$Hedef\Kaldir.ps1`""
Set-ItemProperty -Path $UnKey -Name 'NoModify' -Value 1 -Type DWord
Set-ItemProperty -Path $UnKey -Name 'NoRepair' -Value 1 -Type DWord

# --- uninstaller ---------------------------------------------------------
# Written from here so the installed copy is self-contained: the user can
# uninstall without keeping the ZIP around.
@"
`$ErrorActionPreference = 'SilentlyContinue'
Write-Host ''
Write-Host '  Auteur — uninstall' -ForegroundColor Yellow
Write-Host ''
if (Get-Process -Name 'Auteur' -ErrorAction SilentlyContinue) {
  Write-Host '  Auteur is running. Close it and try again.' -ForegroundColor Red
  Read-Host '  Press Enter to close'; exit 1
}
Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Auteur.lnk') -Force
Remove-Item (Join-Path `$env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Auteur') -Recurse -Force
Remove-Item 'HKCU:\Software\Classes\.sbp' -Recurse -Force
Remove-Item 'HKCU:\Software\Classes\$Sinif' -Recurse -Force
Remove-Item '$UnKey' -Recurse -Force
# YOUR WORK IS NOT DELETED: %APPDATA%\Auteur keeps autosaves, version
# history and the crash-protection journals. A reinstall finds them.
Write-Host '  Program removed. Your projects and backups were NOT touched.' -ForegroundColor Green
Start-Process powershell -ArgumentList '-NoProfile','-Command',"Start-Sleep 2; Remove-Item -Recurse -Force '$Hedef'" -WindowStyle Hidden
Read-Host '  Press Enter to close'
"@ | Set-Content -Path (Join-Path $Hedef 'Kaldir.ps1') -Encoding UTF8

# --- warm up Defender ------------------------------------------------------
# MEASURED (2026-08-27): the FIRST launch of a freshly copied, unsigned
# 180 MB executable takes ~15 s while Windows Defender scans it end to
# end; every launch after that is ~0.8 s. The delay is not the program.
#
# Scanning it here moves that one-off cost into setup, where the user is
# already waiting and knows why. A signed build would avoid it entirely.
Yaz '  Preparing first launch (antivirus scan)...' 'DarkGray'
try {
  Start-MpScan -ScanType CustomScan -ScanPath $Hedef -ErrorAction Stop
  Yaz '  Ready — the program will start quickly.' 'Green'
} catch {
  # Defender may be absent, disabled, or managed by policy. Not fatal:
  # the only cost is that the first launch is slow.
  Yaz '  (Could not pre-scan; the first launch may take a few seconds.)' 'DarkGray'
}

# Refresh the shell icon cache — without this .sbp files keep the old icon.
Add-Type -Namespace W -Name S -MemberDefinition @'
[DllImport("shell32.dll")] public static extern void SHChangeNotify(int e, uint f, IntPtr a, IntPtr b);
'@
[W.S]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)

Yaz ''
Yaz "  Done. $Urun is installed." 'Green'
Yaz '  Uninstall from Settings > Apps, or run Kaldir.ps1 in the install folder.' 'DarkGray'
Yaz ''
$c = Read-Host '  Launch Auteur now? (Y/n)'
if ($c -ne 'n' -and $c -ne 'N') { Start-Process $Exe }
