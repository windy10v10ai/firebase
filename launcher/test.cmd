@echo off
setlocal
cd /d "%~dp0"
set "TEST_EXE=%TEMP%\Windy10v10AI.Launcher.Tests.%RANDOM%.exe"
"%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:exe /main:Windy10v10AI.Launcher.Tests.SteamExecutableTests /out:"%TEST_EXE%" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll src\*.cs tests\*.cs
if errorlevel 1 exit /b %errorlevel%
"%TEST_EXE%" zh-CN
if errorlevel 1 goto fail
"%TEST_EXE%" en-US
if errorlevel 1 goto fail
"%TEST_EXE%" ru-RU
if errorlevel 1 goto fail
del /q "%TEST_EXE%" >nul 2>&1
exit /b 0

:fail
del /q "%TEST_EXE%" >nul 2>&1
exit /b 1
