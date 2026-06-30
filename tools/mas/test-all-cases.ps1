param(
    [string]$RepoRoot = (Resolve-Path "$PSScriptRoot\..\.."),
    [string]$JasonJar = "",
    [string]$Mas2j = "cardiac_traceability.mas2j"
)

$CoordinatorAsl = Join-Path $RepoRoot "agents\runtime_coordinator.asl"
$LogProps = Join-Path $RepoRoot "logging.properties"

function Resolve-RuntimeClasspath {
    if ($JasonJar -and (Test-Path -LiteralPath $JasonJar)) {
        return $JasonJar
    }

    $gradleWrapper = Join-Path $RepoRoot "gradlew.bat"
    if (-not (Test-Path -LiteralPath $gradleWrapper)) {
        $gradleWrapper = Join-Path $RepoRoot "gradlew"
    }

    if (-not (Test-Path -LiteralPath $gradleWrapper)) {
        throw "Gradle wrapper not found. Pass -JasonJar <path> or add gradlew/gradlew.bat."
    }

    Push-Location $RepoRoot
    try {
        $classpath = & $gradleWrapper -q printRuntimeClasspath
        if ($LASTEXITCODE -ne 0) {
            throw "Gradle failed while resolving Jason runtime classpath."
        }
    } finally {
        Pop-Location
    }

    $classpath = ($classpath | Where-Object { $_ } | Select-Object -Last 1).Trim()
    if (-not $classpath) {
        throw "Resolved Jason runtime classpath is empty."
    }

    return $classpath
}

$cases = @(
    @{ Name = "gc04"; ExpectedFile = "gc04.expected.json" },
    @{ Name = "gc00"; ExpectedFile = "gc00.expected.json" },
    @{ Name = "gc_gray_zone"; ExpectedFile = "gc_gray_zone.expected.json" }
)

$allPassed = $true

function Load-Expected {
    param([string]$Filename)
    $json = Get-Content (Join-Path $RepoRoot "expected\traces\$Filename") -Raw | ConvertFrom-Json
    $json
}

function Set-CaseGoal {
    param([string]$CaseName)
    $content = Get-Content $CoordinatorAsl -Raw
    $content = $content -replace '!evaluate_and_export\(\w+\)\.', "!evaluate_and_export($CaseName)."
    Set-Content $CoordinatorAsl $content -NoNewline
}

function Backup-Coordinator {
    Get-Content $CoordinatorAsl -Raw
}

function To-Array {
    param($Value)
    if ($null -eq $Value) { return @() }
    if ($Value -is [System.Array]) { return $Value }
    return @($Value)
}

function Split-ListValue {
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return @() }
    $items = @()
    $current = ""
    $depth = 0
    for ($i = 0; $i -lt $Text.Length; $i++) {
        $c = $Text[$i]
        if ($c -eq '(' -or $c -eq '[' -or $c -eq '{') { $depth++ }
        elseif ($c -eq ')' -or $c -eq ']' -or $c -eq '}') { $depth-- }
        elseif ($c -eq ',' -and $depth -eq 0) {
            $items += $current.Trim().Trim('"')
            $current = ""
            continue
        }
        $current += $c
    }
    $remaining = $current.Trim().Trim('"')
    if ($remaining) { $items += $remaining }
    $items
}

function Parse-Trace {
    param([string[]]$Lines)
    $trace = @{}
    $keyMap = @{
        'CASE' = 'caseId'
        'RISK' = 'risk'
        'DECISION' = 'decision'
        'ACTIVATED_RULES' = 'activatedRules'
        'USED_EVIDENCE' = 'usedEvidence'
        'MISSING_DATA' = 'missingData'
        'SOURCES' = 'sources'
        'NEXT_STEPS' = 'nextSteps'
        'HUMAN_REVIEW' = 'humanReview'
        'PLANNING_GOAL' = 'planningGoal'
    }
    foreach ($line in $Lines) {
        if ($line -match '^TRACE_(\w+)=(.+)$') {
            $rawKey = $matches[1].ToUpper()
            $value = $matches[2]
            $key = if ($keyMap.ContainsKey($rawKey)) { $keyMap[$rawKey] } else { $rawKey.ToLower() }
            if ($value -match '^\[.*\]$') {
                $inner = $value.TrimStart('[').TrimEnd(']')
                $value = Split-ListValue $inner
            }
            $trace[$key] = $value
        }
    }
    $trace
}

function Normalize {
    param([string]$s)
    $s -replace '\s+', ''
}

function Compare-Trace {
    param([hashtable]$Actual, [PSCustomObject]$Expected)
    $errors = @()
    $fields = @("risk", "decision", "activatedRules", "usedEvidence", "missingData", "sources", "nextSteps", "humanReview")
    foreach ($f in $fields) {
        $exp = $Expected.$f
        if ($exp -is [System.Array]) {
            $rawAct = $Actual[$f]
            if ($null -eq $rawAct) { $rawAct = @() }
            $expList = @($exp | ForEach-Object { "$_" })
            $actList = @($rawAct | ForEach-Object { "$_" })
            $missing = @()
            $extra = @()
            foreach ($e in $expList) {
                $eNorm = Normalize $e
                $found = $false
                foreach ($a in $actList) {
                    if ((Normalize $a) -eq $eNorm) { $found = $true; break }
                }
                if (-not $found) { $missing += $e }
            }
            foreach ($a in $actList) {
                $aNorm = Normalize $a
                $found = $false
                foreach ($e in $expList) {
                    if ((Normalize $e) -eq $aNorm) { $found = $true; break }
                }
                if (-not $found) { $extra += $a }
            }
            if ($missing -or $extra) {
                $msg = "${f}:"
                if ($missing) { $msg += " missing=[$($missing -join ',')]" }
                if ($extra) { $msg += " unexpected=[$($extra -join ',')]" }
                $errors += $msg
            }
        } else {
            $actValue = if ($Actual.ContainsKey($f)) { $Actual[$f] } else { $null }
            $actStr = if ($null -eq $actValue) { '' } else { "$actValue" }
            $expStr = if ($null -eq $exp) { '' } else { "$exp" }
            if ($actStr -ne $expStr) { $errors += "${f}: expected '$expStr', got '$actStr'" }
        }
    }
    $errors
}

$backup = Backup-Coordinator
$runtimeClasspath = Resolve-RuntimeClasspath

try {
    foreach ($case in $cases) {
        $name = $case.Name
        $expected = Load-Expected -Filename $case.ExpectedFile
        Write-Host "=== Testing $name ===" -ForegroundColor Cyan

        Set-CaseGoal -CaseName $name

        $stdoutFile = [System.IO.Path]::GetTempFileName()
        $stderrFile = [System.IO.Path]::GetTempFileName()

        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "java"
        $psi.Arguments = "-Djava.util.logging.config.file=`"$LogProps`" -cp `"$runtimeClasspath`" jason.infra.local.RunLocalMAS `"$Mas2j`""
        $psi.WorkingDirectory = $RepoRoot
        $psi.UseShellExecute = $false
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true

        $proc = [System.Diagnostics.Process]::Start($psi)
        $timedOut = !$proc.WaitForExit(60000)
        if ($timedOut) { $proc.Kill(); Start-Sleep -Seconds 1 }

        $stdout = $proc.StandardOutput.ReadToEnd()
        $stderr = $proc.StandardError.ReadToEnd().Trim() -split "`r`n" | Where-Object { $_ }
        $proc.Close()

        $traceLines = $stderr | Where-Object { $_ -match '^TRACE_' }
        $trace = Parse-Trace -Lines $traceLines

        Write-Host "  Risk=$($trace['risk'])  Decision=$($trace['decision'])" -ForegroundColor Gray

        $errors = Compare-Trace -Actual $trace -Expected $expected
        if ($errors.Count -eq 0 -and !$timedOut) {
            Write-Host "  PASS" -ForegroundColor Green
        } else {
            $allPassed = $false
            Write-Host "  FAIL" -ForegroundColor Red
            if ($timedOut) { Write-Host "    Reason: timed out (30s)" -ForegroundColor Red }
            foreach ($e in $errors) { Write-Host "    $e" -ForegroundColor Red }
        }
    }
} finally {
    Set-Content $CoordinatorAsl $backup -NoNewline
}

if ($allPassed) {
    Write-Host "`nALL CASES PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`nSOME CASES FAILED" -ForegroundColor Red
    exit 1
}
