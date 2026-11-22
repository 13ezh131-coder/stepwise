@echo off
cd /d "%~dp0"
node scripts/view-database.mjs
if errorlevel 1 (
  echo Could not open the database. Start the site once and check Node.js.
  pause
  exit /b 1
)
start "" "%~dp0output\database-view.html"
