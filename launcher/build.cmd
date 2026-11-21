@echo off
rem Uses the C# compiler bundled with the .NET Framework that every Windows 10/11 machine has
rem "build.cmd beta" builds the closed beta variant that starts on the test map
rem LAUNCHER_APIKEY, when set, is embedded from a temporary file and never written into the repo
setlocal
cd /d "%~dp0"
set "OUT=dist"
set "DEFINE="
if /i "%~1"=="beta" (
  set "OUT=dist\beta"
  set "DEFINE=/define:BETA"
)
if not exist "%OUT%" mkdir "%OUT%"
set "KEYFILE=%TEMP%\Windy10v10AI-launcher-key.%RANDOM%.txt"
powershell -NoProfile -Command "[IO.File]::WriteAllText('%KEYFILE%', $env:LAUNCHER_APIKEY)"
"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /optimize+ /target:winexe %DEFINE% /out:%OUT%\Windy10v10AI.exe /win32icon:assets\icon.ico /win32manifest:app.manifest /resource:assets\banner.jpg,banner.jpg /resource:"%KEYFILE%",launcher-api-key.txt /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll core\*.cs src\*.cs
set "STATUS=%ERRORLEVEL%"
del /q "%KEYFILE%" >nul 2>&1
exit /b %STATUS%
