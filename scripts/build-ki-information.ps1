param(
  [Parameter(Mandatory = $true)]
  [string]$SourceCsv,
  [string]$OutputJson = ''
)

$ErrorActionPreference = 'Stop'
if (-not $OutputJson) {
  $OutputJson = Join-Path $PSScriptRoot '..\assets\data\ki-informationsraum.json'
}
$rows = Import-Csv -LiteralPath $SourceCsv -Encoding utf8
$columns = @($rows[0].PSObject.Properties.Name)
$columnTopic = $columns[0]
$columnFilter = $columns[1]
$columnEntity = $columns[2]
$columnType = $columns[3]
$columnDescription = $columns[4]
$columnImportance = $columns[5]
$columnSource = $columns[6]
$columnUrl = $columns[7]
$columnRelated = $columns[8]
$columnUpdated = $columns[10]

# Offizielle Nachfolgeziele für Quellen, deren ursprüngliche URL nicht mehr existiert.
$urlOverrides = @{
  'Bundesnetzagentur' = 'https://www.bundesnetzagentur.de/DE/Home/home_node.htm'
  'TDDDG' = 'https://www.gesetze-im-internet.de/ttdsg/BJNR198210021.html'
  'CNIL AI Guidance' = 'https://www.cnil.fr/en/topics/artificial-intelligence-ai'
  'Redaktionelle Assistenz' = 'https://www.coe.int/en/web/freedom-expression/-/guidelines-on-the-responsible-implementation-of-artificial-intelligence-ai-systems-in-journalism'
}

function ConvertTo-Slug([string]$Value) {
  $normalized = $Value.Normalize([Text.NormalizationForm]::FormD)
  $builder = [Text.StringBuilder]::new()
  foreach ($character in $normalized.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($character) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      [void]$builder.Append($character)
    }
  }
  $slug = $builder.ToString().ToLowerInvariant() -replace '[^a-z0-9]+', '-'
  return $slug.Trim('-')
}

$topics = [System.Collections.Generic.List[object]]::new()
$topicGroups = $rows | Group-Object -Property $columnTopic

foreach ($topicGroup in $topicGroups) {
  $topicText = $topicGroup.Name
  $title = [regex]::Replace($topicText, '^[^\p{L}\p{N}]+', '').Trim()
  $topicId = ConvertTo-Slug $title
  $filters = [System.Collections.Generic.List[object]]::new()

  foreach ($filterGroup in ($topicGroup.Group | Group-Object -Property $columnFilter)) {
    $filterTitle = $filterGroup.Name.Trim()
    $entities = [System.Collections.Generic.List[object]]::new()
    $usedIds = @{}

    foreach ($row in $filterGroup.Group) {
      $baseId = ConvertTo-Slug $row.($columnEntity)
      $entityName = $row.($columnEntity)
      $entityId = $baseId
      $suffix = 2
      while ($usedIds.ContainsKey($entityId)) {
        $entityId = "$baseId-$suffix"
        $suffix += 1
      }
      $usedIds[$entityId] = $true

      $related = @($row.($columnRelated) -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
      $entities.Add([ordered]@{
        id = $entityId
        name = $entityName
        type = $row.($columnType)
        description = $row.($columnDescription)
        importance = $row.($columnImportance)
        source = $row.($columnSource)
        url = if ($urlOverrides.ContainsKey($entityName)) { $urlOverrides[$entityName] } else { $row.($columnUrl) }
        relatedTopics = $related
        updated = $row.($columnUpdated)
      })
    }

    $filters.Add([ordered]@{
      id = ConvertTo-Slug $filterTitle
      title = $filterTitle
      entities = $entities
    })
  }

  $topics.Add([ordered]@{
    id = $topicId
    title = $title
    filters = $filters
  })
}

$result = [ordered]@{
  title = 'KI-Informationsraum'
  topics = $topics
}

$json = $result | ConvertTo-Json -Depth 10
[IO.File]::WriteAllText((Resolve-Path (Split-Path $OutputJson -Parent)).Path + '\' + (Split-Path $OutputJson -Leaf), $json, [Text.UTF8Encoding]::new($false))
Write-Output "$($rows.Count) Datensätze nach $OutputJson übertragen."
