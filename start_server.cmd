@echo off
chcp 65001 >nul
title Serveur Web & Mobile Airfree (Jeedom / Local API 192.168.0.61:3000)

set PHP_BIN=C:\wamp64\bin\php\php8.1.0\php.exe
if not exist "%PHP_BIN%" set PHP_BIN=php.exe

echo ==============================================================
echo   Interface Graphique Airfree (Desktop ^& Mobile)
echo   Passerelle cible par defaut : 192.168.0.61:3000
echo   URL PC     : http://localhost:8088
echo   URL Mobile : http://^<IP_DE_VOTRE_PC^>:8088
echo ==============================================================
echo.

start "" "http://localhost:8088"
"%PHP_BIN%" -S 0.0.0.0:8088 -t "%~dp0"
