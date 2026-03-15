# TM Tier Overlay — быстрая установка/обновление
# Запуск: pwsh -File install-extension.ps1

$extPath = "$PSScriptRoot\extension"

if (-not (Test-Path $extPath)) {
    Write-Host "Папка extension не найдена: $extPath" -ForegroundColor Red
    exit 1
}

Write-Host @"
╔══════════════════════════════════════════════╗
║  TM Tier Overlay — установка расширения      ║
╚══════════════════════════════════════════════╝

Расширение готово в: $extPath

ШАГИ:
1. Открой Яндекс Браузер
2. В адресной строке: browser://extensions
3. Включи "Режим разработчика" (toggle справа вверху)
4. Нажми "Загрузить распакованное расширение"
5. Выбери папку: $extPath
6. Готово!

ОБНОВЛЕНИЕ (после git pull):
- Открой browser://extensions
- Нажми 🔄 (обновить) на карточке TM Tier Overlay
- Обнови страницу игры (F5)

"@ -ForegroundColor Cyan

# Попробовать открыть browser://extensions
$browsers = @(
    "$env:LOCALAPPDATA\Yandex\YandexBrowser\Application\browser.exe",
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)

foreach ($b in $browsers) {
    if (Test-Path $b) {
        Write-Host "Открываю extensions в: $(Split-Path $b -Leaf)" -ForegroundColor Green
        Start-Process $b "browser://extensions"
        break
    }
}

Write-Host "`nПуть для копирования:" -ForegroundColor Yellow
Write-Host $extPath
Set-Clipboard $extPath
Write-Host "(скопирован в буфер обмена)" -ForegroundColor DarkGray
