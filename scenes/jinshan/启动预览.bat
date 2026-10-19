@echo off
chcp 65001 >nul
start "" "http://127.0.0.1:8799/index.html"
node tools\serve.mjs 8799
