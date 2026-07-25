# =====================================================
# 매일성경 스크래퍼 - Windows 작업 스케줄러 등록 스크립트
# 관리자 권한 없이 현재 사용자 세션에서 실행됩니다.
# =====================================================

$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonScript = Join-Path $ScriptDir "scraper.py"
$TaskName = "BibleDailyScraper"

# python 실행 파일 경로 찾기
$PythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $PythonExe) {
    Write-Error "Python을 찾을 수 없습니다. Python이 설치되어 있고 PATH에 등록되어 있는지 확인하세요."
    exit 1
}

Write-Host "Python: $PythonExe"
Write-Host "Script: $PythonScript"

# 기존 작업 삭제 (있을 경우)
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# 작업 설정
$action  = New-ScheduledTaskAction `
    -Execute $PythonExe `
    -Argument "`"$PythonScript`"" `
    -WorkingDirectory $ScriptDir

$trigger = New-ScheduledTaskTrigger `
    -Daily `
    -At "05:00AM"

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

# 현재 로그인한 사용자로 등록
$principal = New-ScheduledTaskPrincipal `
    -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName   $TaskName `
    -Action     $action `
    -Trigger    $trigger `
    -Settings   $settings `
    -Principal  $principal `
    -Description "매일 오전 5시 매일성경 본문/해설 자동 스크랩 (sum.su.or.kr)"

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host " 작업 등록 완료: '$TaskName'" -ForegroundColor Green
Write-Host " 매일 오전 05:00 자동 실행됩니다." -ForegroundColor Green
Write-Host " 결과: $ScriptDir\output\YYYY-MM-DD.md" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
