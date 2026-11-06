param([string]$ArchivePath)

$ErrorActionPreference = 'Stop'
function Get-LocalSha256([string]$FilePath) {
    $stream = [IO.File]::OpenRead($FilePath)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
    finally { $sha.Dispose(); $stream.Dispose() }
}
if ($env:OS -ne 'Windows_NT') { throw 'This verification command is for Windows x64.' }
$repository = Split-Path -Parent $PSScriptRoot
$package = Get-Content -LiteralPath (Join-Path $repository 'package.json') -Raw | ConvertFrom-Json
$installed = Get-Content -LiteralPath (Join-Path $repository 'node_modules\electron\package.json') -Raw | ConvertFrom-Json
$runtimeVersion = [string]$installed.version
if ($runtimeVersion -notmatch '^\d+\.\d+\.\d+$' -or $package.devDependencies.electron -ne $runtimeVersion) {
    throw 'The installed Electron version must match the exact version pinned in package.json. Run npm ci first.'
}
$archiveName = "electron-v$runtimeVersion-win32-x64.zip"
if (-not $ArchivePath) {
    $ArchivePath = Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'electron\Cache') -Recurse -File |
        Where-Object Name -eq $archiveName | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $ArchivePath -or -not (Test-Path -LiteralPath $ArchivePath -PathType Leaf)) {
    throw 'Electron archive not found. Run node node_modules/electron/install.js, or pass -ArchivePath with the official Windows x64 ZIP.'
}
$releaseUrl = "https://github.com/electron/electron/releases/download/v$runtimeVersion"
$response = Invoke-WebRequest -UseBasicParsing -Uri "$releaseUrl/SHASUMS256.txt"
$manifest = if ($response.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($response.Content) } else { [string]$response.Content }
$checksumLines = @($manifest -split "`n" | Where-Object { $_ -match ('\s+\*?' + [regex]::Escape($archiveName) + '\s*$') })
if ($checksumLines.Count -ne 1) { throw 'Expected exactly one checksum in the official release manifest.' }
$expectedHash = ($checksumLines[0] -split '\s+')[0]
$archiveHash = Get-LocalSha256 $ArchivePath
if ($archiveHash -ne $expectedHash) { throw 'The archive does not match the official release checksum. Verification stopped.' }
Write-Output "Verified official archive: $archiveName ($archiveHash)"

Add-Type -AssemblyName System.IO.Compression.FileSystem
$runtime = Join-Path $repository 'node_modules\electron\dist'
function Confirm-RuntimeFiles {
    $zip = [IO.Compression.ZipFile]::OpenRead($ArchivePath)
    try {
        $expectedFiles = @{}
        foreach ($entry in $zip.Entries) {
            if (-not $entry.Name) { continue }
            $relative = $entry.FullName.Replace('/', '\')
            if ($relative -eq 'electron.d.ts') { continue } # Installer moves declarations outside dist.
            $expectedFiles[$relative] = $true
            $installedPath = [IO.Path]::GetFullPath((Join-Path $runtime $relative))
            if (-not $installedPath.StartsWith($runtime + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid archive path.' }
            $stream = $entry.Open()
            $sha = [Security.Cryptography.SHA256]::Create()
            try { $referenceHash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
            finally { $sha.Dispose(); $stream.Dispose() }
            $localHash = Get-LocalSha256 $installedPath
            if ($localHash -ne $referenceHash) { throw "Installed file differs from the verified official archive: $relative" }
        }
        foreach ($file in Get-ChildItem -LiteralPath $runtime -Recurse -File) {
            $relative = $file.FullName.Substring($runtime.Length + 1)
            if (-not $expectedFiles.ContainsKey($relative)) { throw "Unexpected file in the installed runtime: $relative" }
        }
        return $expectedFiles.Count
    } finally { $zip.Dispose() }
}
$fileCount = Confirm-RuntimeFiles
Write-Output "Verified $fileCount installed runtime files against the official archive."

$protection = Get-MpComputerStatus
if (-not $protection.AntivirusEnabled -or -not $protection.RealTimeProtectionEnabled) {
    throw 'Defender antivirus and real-time protection must be enabled for this verification.'
}
$platformRoot = Join-Path $env:ProgramData 'Microsoft\Windows Defender\Platform'
$scanTool = Get-ChildItem -LiteralPath $platformRoot -Directory | Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName 'MpCmdRun.exe' } |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $scanTool) { $scanTool = Join-Path $env:ProgramFiles 'Windows Defender\MpCmdRun.exe' }
& $scanTool -Scan -ScanType 3 -File $runtime
if ($LASTEXITCODE -ne 0) { throw 'Defender did not complete the scan successfully. Inspect Protection history; do not run this runtime.' }
# Defender can return zero after remediation too. Recheck every runtime file so
# a quarantined or modified file cannot turn that exit code into a verification pass.
$null = Confirm-RuntimeFiles
$dllHash = Get-LocalSha256 (Join-Path $runtime 'ffmpeg.dll')
$report = [ordered]@{
    checkedAtUtc = [DateTime]::UtcNow.ToString('o')
    version = $runtimeVersion
    source = "$releaseUrl/$archiveName"
    archiveSha256 = $archiveHash
    runtimeFilesMatched = $fileCount
    ffmpegSha256 = $dllHash
    defenderSignatureVersion = $protection.AntivirusSignatureVersion
    realTimeProtectionEnabled = $protection.RealTimeProtectionEnabled
    scanExitCode = 0
    note = 'Point-in-time integrity and Defender checks; not a guarantee against malware or future detections.'
}
$reportDirectory = Join-Path $repository 'test-results'
New-Item -ItemType Directory -Path $reportDirectory -Force | Out-Null
$reportPath = Join-Path $reportDirectory 'runtime-verification.json'
$report | ConvertTo-Json | Set-Content -LiteralPath $reportPath -Encoding UTF8
Write-Output "Verification complete. Report: $reportPath"
