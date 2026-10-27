<#
.SYNOPSIS
    Install or remove dsh-occlick in a DeepSeek Harness profile.

.DESCRIPTION
    Install:
      * backs up the profile files it touches,
      * links this folder into the profile's node_modules as a junction,
      * adds the package as a profile dependency and as a bundle, so it appears
        under Plugins in DSH,
      * removes the standalone Loader row older versions of this script added
        (a bundle that also inserts the same row would be a duplicate id).

    Uninstall reverses those changes and leaves the backups in place. The script
    is idempotent.

.PARAMETER ProfileName
    Profile under %DSH_HOME%\profiles to patch. Defaults to "desktop".

.PARAMETER DshHome
    DeepSeek Harness home. Defaults to $env:DSH_HOME, then %USERPROFILE%\.dsh.

.PARAMETER Uninstall
    Remove the link, dependency, bundle entry, and legacy Loader row.

.EXAMPLE
    .\install.ps1

.EXAMPLE
    .\install.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [string] $ProfileName = 'desktop',
    [string] $DshHome = '',
    [switch] $Uninstall
)

$ErrorActionPreference = 'Stop'

$packageName = 'dsh-occlick'
$legacyMarker = '# dsh-occlick: click on agent turn end (managed by install.ps1)'
$source = (Resolve-Path -LiteralPath $PSScriptRoot).Path

if ($DshHome -eq '') {
    if ($env:DSH_HOME) { $DshHome = $env:DSH_HOME }
    elseif ($env:USERPROFILE) { $DshHome = Join-Path $env:USERPROFILE '.dsh' }
    else { throw 'Set DSH_HOME or pass -DshHome.' }
}

$profileDir = Join-Path $DshHome (Join-Path 'profiles' $ProfileName)
if (-not (Test-Path -LiteralPath $profileDir -PathType Container)) {
    throw "Profile directory not found: $profileDir"
}

$patchPath = Join-Path $profileDir 'cordis.patch.yml'
$manifestPath = Join-Path $profileDir 'package.json'
$modulesDir = Join-Path $profileDir 'node_modules'
$linkPath = Join-Path $modulesDir $packageName
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Read-Text([string] $path) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return '' }
    return [System.IO.File]::ReadAllText($path)
}

function Write-Text([string] $path, [string] $text) {
    [System.IO.File]::WriteAllText($path, $text, $utf8)
}

function Backup-Profile {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = Join-Path $profileDir ".occlick-backup-$stamp"
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    foreach ($name in @('cordis.patch.yml', 'package.json', 'pnpm-lock.yaml')) {
        $from = Join-Path $profileDir $name
        if (Test-Path -LiteralPath $from -PathType Leaf) {
            Copy-Item -LiteralPath $from -Destination (Join-Path $backup $name)
        }
    }
    return $backup
}

function Remove-LegacyRow {
    $text = Read-Text $patchPath
    if ($text -eq '') { return $false }
    $lines = $text -split "`r?`n"
    $index = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i].Trim() -eq $legacyMarker) { $index = $i; break }
    }
    if ($index -lt 0) { return $false }
    $remove = 1
    if ($index + 1 -lt $lines.Count -and $lines[$index + 1].Trim() -eq '- insert:') { $remove = 2 }
    if ($index + 2 -lt $lines.Count -and $lines[$index + 2].Trim() -eq '- id: occlick') { $remove = 3 }
    if ($index + 3 -lt $lines.Count -and $lines[$index + 3].Trim() -eq "name: $packageName") { $remove = 4 }
    $kept = @()
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($i -ge $index -and $i -lt ($index + $remove)) { continue }
        $kept += $lines[$i]
    }
    Write-Text $patchPath (($kept -join "`n").TrimEnd() + "`n")
    return $true
}

if ($Uninstall) {
    $existing = $null
    if (Test-Path -LiteralPath $linkPath) { $existing = Get-Item -LiteralPath $linkPath -Force }
    if ($existing -ne $null) {
        $isLink = ($existing.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
        if (-not $isLink) { throw "Refusing to remove $linkPath because it is a real directory, not a link." }
        $target = ''
        if ($existing.PSObject.Properties.Name -contains 'Target') { $target = [string]$existing.Target }
        if ($target -ne '' -and $target.TrimEnd('\') -ne $source.TrimEnd('\')) {
            throw "Refusing to remove $linkPath because it points at '$target'."
        }
        [System.IO.Directory]::Delete($linkPath)
        Write-Host "Removed link $linkPath"
    }

    if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        if ($manifest.dependencies.PSObject.Properties.Name -contains $packageName) {
            $manifest.dependencies.PSObject.Properties.Remove($packageName)
            Write-Host "Removed the dependency"
        }
        if ($manifest.dsh.profile.bundles -contains $packageName) {
            $manifest.dsh.profile.bundles = @($manifest.dsh.profile.bundles | Where-Object { $_ -ne $packageName })
            Write-Host "Removed the bundle entry"
        }
        Write-Text $manifestPath (($manifest | ConvertTo-Json -Depth 20) + "`n")
    }

    if (Remove-LegacyRow) { Write-Host "Removed the legacy Loader row" }
    Write-Host ''
    Write-Host 'Restart DeepSeek Harness to unload the plugin.'
    exit 0
}

# --- Install ---------------------------------------------------------------

$backup = Backup-Profile
Write-Host "Backup: $backup"

if (-not (Test-Path -LiteralPath $modulesDir -PathType Container)) {
    New-Item -ItemType Directory -Path $modulesDir -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $linkPath)) {
    New-Item -ItemType Junction -Path $linkPath -Target $source | Out-Null
    Write-Host "Linked $linkPath -> $source"
}
else {
    Write-Host "Link already present: $linkPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($null -eq $manifest.dependencies) {
    $manifest | Add-Member -NotePropertyName dependencies -NotePropertyValue ([pscustomobject]@{})
}
$spec = "link:$source"
if ($manifest.dependencies.PSObject.Properties.Name -contains $packageName) {
    $manifest.dependencies.$packageName = $spec
}
else {
    $manifest.dependencies | Add-Member -NotePropertyName $packageName -NotePropertyValue $spec
}
Write-Host "Dependency: $spec"

$bundles = @()
if ($null -ne $manifest.dsh -and $null -ne $manifest.dsh.profile -and $null -ne $manifest.dsh.profile.bundles) {
    $bundles = @($manifest.dsh.profile.bundles)
}
if ($bundles -notcontains $packageName) {
    $bundles += $packageName
    if ($null -eq $manifest.dsh) {
        $manifest | Add-Member -NotePropertyName dsh -NotePropertyValue ([pscustomobject]@{})
    }
    if ($null -eq $manifest.dsh.profile) {
        $manifest.dsh | Add-Member -NotePropertyName profile -NotePropertyValue ([pscustomobject]@{})
    }
    if ($null -eq $manifest.dsh.profile.bundles) {
        $manifest.dsh.profile | Add-Member -NotePropertyName bundles -NotePropertyValue @()
    }
    $manifest.dsh.profile.bundles = $bundles
}
Write-Text $manifestPath (($manifest | ConvertTo-Json -Depth 20) + "`n")
Write-Host "Bundle: $packageName"

if (Remove-LegacyRow) { Write-Host "Removed the legacy Loader row (the bundle declares it now)" }

Write-Host ''
Write-Host 'Restart DeepSeek Harness, then open Plugins and select dsh-occlick.'
