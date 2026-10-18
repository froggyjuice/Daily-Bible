# 매일성경 로컬 자동 스크랩 (대체 경로)
# Windows 작업 스케줄러가 "로그온 시" 트리거로 이 스크립트를 실행합니다.
# - 주 경로는 Vercel Cron(/api/cron/scrape)입니다. 이 스크립트는 클라우드 IP가 막히거나
#   Cron 이 빠진 날을 대비한 보험으로, 한국 IP인 이 PC에서 빠진 날짜만 Supabase 에 채웁니다.
# - Supabase upsert 라 몇 번을 돌려도, Cron 과 겹쳐도 충돌하지 않습니다(git 사용 안 함).
# - 인증 정보는 .env.local (gitignore) 에서 node --env-file 로 읽습니다.

$RepoDir = "C:\dev\QT\bible_scraper"
$Node    = "C:\Program Files\nodejs\node.exe"
$LogFile = Join-Path $RepoDir "logs\auto_scrape.log"

New-Item -ItemType Directory -Force -Path (Join-Path $RepoDir "logs") | Out-Null

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$ts] $msg" | Out-File -FilePath $LogFile -Append -Encoding utf8
}

Set-Location $RepoDir
Log "===== 자동 스크랩 시작 ====="

$maxAttempts = 2
for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    Log "scripts/scrape.mjs 실행 시도 $attempt/$maxAttempts"
    $output = & $Node --env-file=.env.local scripts/scrape.mjs 2>&1
    $code = $LASTEXITCODE
    $output | ForEach-Object { Log "  $_" }
    if ($code -eq 0) {
        Log "===== 자동 스크랩 완료 (성공) ====="
        exit 0
    }
    Log "실패 (exit $code)"
    if ($attempt -lt $maxAttempts) { Start-Sleep -Seconds 30 }
}

Log "===== 자동 스크랩 최종 실패 ====="
exit 1
