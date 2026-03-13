@echo off
setlocal enabledelayedexpansion

set GRADLE_VERSION=8.7
set DIST_URL=https://services.gradle.org/distributions/gradle-%GRADLE_VERSION%-bin.zip
set BASE_DIR=%~dp0
set BOOT_DIR=%BASE_DIR%.gradle-bootstrap
set GRADLE_DIR=%BOOT_DIR%\gradle-%GRADLE_VERSION%
set ZIP_PATH=%BOOT_DIR%\gradle-%GRADLE_VERSION%-bin.zip

if exist "%GRADLE_DIR%\bin\gradle.bat" goto run

if not exist "%BOOT_DIR%" mkdir "%BOOT_DIR%"
if not exist "%ZIP_PATH%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri '%DIST_URL%' -OutFile '%ZIP_PATH%'" || exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%ZIP_PATH%' -DestinationPath '%BOOT_DIR%' -Force" || exit /b 1

:run
call "%GRADLE_DIR%\bin\gradle.bat" %*