param(
 [Parameter(Mandatory=$true)][string]$SitesPluginRoot,
 [string]$Project = (Join-Path $PSScriptRoot '..')
)
$ErrorActionPreference = 'Stop'
$Project = (Resolve-Path -LiteralPath $Project).Path
$artifactRoot = [IO.Path]::GetFullPath((Join-Path $Project '.artifacts'))
if (-not $artifactRoot.StartsWith($Project + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe artifact path' }
New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
$stage = Join-Path $artifactRoot ('stage-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
$destination = Join-Path $stage 'dist'
if (Test-Path -LiteralPath $destination) { throw 'Expected an empty staging destination' }
$helper = Join-Path $SitesPluginRoot 'skills/sites-hosting/scripts/prepare-site-build.cjs'
$kind = & node $helper $Project $destination
if ($LASTEXITCODE -ne 0 -or $kind -ne 'worker') { throw 'Sites build validation failed' }
New-Item -ItemType Directory -Path (Join-Path $destination '.openai') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $Project '.openai/hosting.json') -Destination (Join-Path $destination '.openai/hosting.json')
Copy-Item -LiteralPath (Join-Path $Project 'drizzle') -Destination (Join-Path $destination '.openai/drizzle') -Recurse
$archive = Join-Path $artifactRoot 'pokelib.tar.gz'
& tar -C $stage -czf $archive dist
if ($LASTEXITCODE -ne 0) { throw 'Archive creation failed' }
$entries = & tar -tzf $archive
if ($LASTEXITCODE -ne 0 -or -not ($entries -contains 'dist/.openai/hosting.json') -or -not ($entries -contains 'dist/server/index.js') -or -not ($entries -contains 'dist/.openai/drizzle/0001_version_guards.sql')) { throw 'Archive validation failed' }
Write-Output $archive

