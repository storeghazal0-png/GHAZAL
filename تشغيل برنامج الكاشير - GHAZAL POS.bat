@echo off
chcp 65001 > nul
title برنامج كاشير غزل - GHAZAL POS
echo ===================================================
echo     محل غزل للمكياج والعناية — عين الباشا
echo            تشغيل برنامج الكاشير (GHAZAL POS)
echo ===================================================
echo.
echo جاري بدء تشغيل برنامج الكاشير المستقل بسرعة فائقة...
echo.

if exist "%~dp0GHAZAL POS.exe" (
    start "" "%~dp0GHAZAL POS.exe"
    exit /b
)

if exist "%~dp0win-unpacked\GHAZAL POS.exe" (
    start "" "%~dp0win-unpacked\GHAZAL POS.exe"
    exit /b
)

if exist "%~dp0desktop\release\win-unpacked\GHAZAL POS.exe" (
    start "" "%~dp0desktop\release\win-unpacked\GHAZAL POS.exe"
    exit /b
)

if exist "%~dp0public\downloads\GHAZAL-POS-Setup.exe" (
    start "" "%~dp0public\downloads\GHAZAL-POS-Setup.exe"
    exit /b
)

echo جاري فتح نقطة البيع السحابية عبر المتصفح الافتراضي...
start "" "https://ghazal-store-jo.netlify.app/pos/cashier"
exit /b
