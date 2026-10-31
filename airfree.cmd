@echo off
chcp 65001 >nul
title Diagnostic Airfree 192.168.0.61

echo ======================================================
echo    Test direct de l'API Airfree (192.168.0.61)
echo ======================================================
echo.

:: Creation d'un payload JSON temporaire propre
echo {"systemID":1,"zoneID":0} > "%TEMP%\az_test.json"

echo [1/3] Envoi de la requete HVAC globale (systemID: 1)...
curl.exe -s -X POST "http://192.168.0.61:3000/api/v1/hvac" -H "Content-Type: application/json" --data-binary "@%TEMP%\az_test.json"
echo.
echo.

echo {"systemID":0,"zoneID":0} > "%TEMP%\az_test.json"
echo [2/3] Envoi de la requete HVAC alternative (systemID: 0)...
curl.exe -s -X POST "http://192.168.0.61:3000/api/v1/hvac" -H "Content-Type: application/json" --data-binary "@%TEMP%\az_test.json"
echo.
echo.

echo {} > "%TEMP%\az_test.json"
echo [3/3] Envoi de la requete Webserver...
curl.exe -s -X POST "http://192.168.0.61:3000/api/v1/webserver" -H "Content-Type: application/json" --data-binary "@%TEMP%\az_test.json"
echo.
echo.

:: Nettoyage
if exist "%TEMP%\az_test.json" del "%TEMP%\az_test.json"

echo ======================================================
echo Appuyez sur une touche pour quitter...
pause >nul