// Electron entry point
const { app } = require('electron');
const path = require('path');

// Set userData to project directory to avoid AppData access
app.setPath('userData', path.join(__dirname, '..', '.electron-data'));

// Load the compiled main process
require('../dist/main/main/index.js');