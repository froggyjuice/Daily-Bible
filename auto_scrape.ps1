# 매일성경 로컬 자동 스크랩
# Windows 작업 스케줄러가 "로그온 시" 트리거로 이 스크립트를 실행합니다.
# - 이 PC가 유일한 스크랩 경로입니다(GitHub Actions cron은 제거됨 - 이미 한국 IP인
#   로컬과 달리 러너별로 간헐적으로 차단됐고, 로컬 자동화와 겹쳐 같은 날짜를 다시
#   스크랩/푸시하면서 git push 충돌을 낸 적이 있음). IP 차단 재시도 로직은 불필요.
# - 같은 날 여러 번 로그온해도 중복 실행/커밋되지 않도록 오늘자 파일 존재 여부를 먼저 확인합니다.
# - git 네이티브 명령은 stderr에 정상 진행 메시지를 씀 -> $ErrorActionPreference/2>&1 조합으로
#   오탐하지 않도록 $LASTEXITCODE만으로 성공 여부를 판단합니다.
# - 로컬에서 다른 경로(수동 실행 등)로 이미 커밋된 원격 변경이 있을 수 있으므로,
#   스크랩 여부를 판단하기 전에 항상 먼저 pull 해서 로컬을 원격과 맞춥니다.

$RepoDir = "C:\dev\QT\bible_scraper"
$Python  = "C:\Users\user\anaconda3\python.exe"
$LogFile = Join-Path $RepoDir "logs\auto_scrape.log"

New-Item -ItemType Directory -Force -Path (Join-Path $RepoDir "logs") | Out-Null

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$ts] $msg" | Out-File -FilePath $LogFile -Append -Encoding utf8
}

Set-Location $RepoDir
Log "===== 자동 스크랩 시작 ====="

git pull --rebase origin main *> $null
Log "git pull exit code: $LASTEXITCODE"

$todayKst = & $Python -c "from datetime import datetime, timezone, timedelta; print(datetime.now(timezone(timedelta(hours=9))).strftime('%Y-%m-%d'))"
Log "오늘(KST): $todayKst"

$todayFile = Join-Path $RepoDir "data\main\$todayKst.json"
if (Test-Path $todayFile) {
    Log "오늘자 데이터가 이미 있습니다. 스크랩 생략."
    exit 0
}

$maxAttempts = 2
$success = $false
for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    Log "scraper.py 실행 시도 $attempt/$maxAttempts"
    $output = & $Python (Join-Path $RepoDir "scraper.py") 2>&1
    $output | ForEach-Object { Log "  $_" }
    if ($LASTEXITCODE -eq 0) {
        $success = $true
        break
    }
    Log "scraper.py 실패 (exit $LASTEXITCODE)"
    if ($attempt -lt $maxAttempts) {
        Start-Sleep -Seconds 30
    }
}

if (-not $success) {
    Log "스크랩 최종 실패. 커밋/푸시 생략."
    exit 1
}

git add data/ *> $null
Log "git add exit code: $LASTEXITCODE"

git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Log "변경된 데이터 없음. 커밋 생략."
    exit 0
}

git commit -m "data: $todayKst 매일성경 업데이트 (local auto)" *> $null
Log "git commit exit code: $LASTEXITCODE"

git push origin main *> $null
$pushExit = $LASTEXITCODE
Log "git push exit code: $pushExit"

if ($pushExit -ne 0) {
    Log "git push 실패 - pull --rebase 후 1회 재시도"
    git pull --rebase origin main *> $null
    Log "재시도 전 git pull exit code: $LASTEXITCODE"
    git push origin main *> $null
    $pushExit = $LASTEXITCODE
    Log "재시도 git push exit code: $pushExit"
}

if ($pushExit -ne 0) {
    Log "git push 최종 실패 - 수동 확인 필요 (충돌 가능성)"
    exit 1
}

Log "===== 자동 스크랩 완료 (성공) ====="
exit 0
