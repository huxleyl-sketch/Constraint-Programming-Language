$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'sync-operator-lexing.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Operator lexer synchronization failed.' }
& node (Join-Path $PSScriptRoot 'sync-tokens.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Token synchronization failed.' }
& node (Join-Path $PSScriptRoot 'sync-standard-snippets.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Standard snippet synchronization failed.' }
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json
$output = Join-Path $PSScriptRoot "$($manifest.name)-$($manifest.version).vsix"
$stream = [System.IO.File]::Open($output, [System.IO.FileMode]::Create)
$archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)

function Add-TextEntry([string]$Name, [string]$Text) {
    $entry = $archive.CreateEntry($Name)
    $writer = [System.IO.StreamWriter]::new($entry.Open())
    try { $writer.Write($Text) } finally { $writer.Dispose() }
}

try {
    Add-TextEntry '[Content_Types].xml' @'
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="js" ContentType="application/javascript" />
  <Default Extension="vsixmanifest" ContentType="text/xml" />
</Types>
'@
    Add-TextEntry 'extension.vsixmanifest' @"
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="$($manifest.name)" Version="$($manifest.version)" Publisher="$($manifest.publisher)" />
    <DisplayName>$($manifest.displayName)</DisplayName>
    <Description xml:space="preserve">$($manifest.description)</Description>
    <Categories>Programming Languages</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="$($manifest.engines.vscode)" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="ui" />
    </Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
  <Dependencies />
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" /></Assets>
</PackageManifest>
"@
    foreach ($relative in @('package.json', 'language-configuration.json', 'README.md', 'syntaxes/csp.tmLanguage.json', 'snippets/csp.json', 'snippets/standard.json', 'extension.js', 'analysis.js', 'operator-lexing.js', 'tokens.json')) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $PSScriptRoot $relative), "extension/$relative") | Out-Null
    }
} finally {
    $archive.Dispose()
    $stream.Dispose()
}
Write-Output "Created $output"
