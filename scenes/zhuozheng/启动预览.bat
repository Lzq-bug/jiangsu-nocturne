@echo off
rem 起本地服务并打开浏览器（ES Module 需要 http://，不能直接双击 html）
cd /d "%~dp0"
start "" "http://127.0.0.1:8830/index.html"
node tools\serve.mjs 8830
