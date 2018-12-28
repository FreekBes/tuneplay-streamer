const { app, BrowserWindow, dialog, shell } = require('electron');
const nodeCmd = require('node-cmd');

let mainWindow;

console.log("Starting liquidsoap...");
nodeCmd.get('liq\\liquidsoap.exe liq\\script.liq', function(err, data, stderr) {
    if (err) {
        console.error(err);
    }
    else {
        console.log(data);
    }
});

mainWindow.on('closed', function(event) {
    console.log("Stopping liquidsoap...");
    nodeCmd.get('taskkill /IM "liquidsoap.exe" /F', function(err, data, stderr) {
        if (err) {
            console.log("Could not stop liquidsoap!");
            console.error(err);
        }
        else {
            console.log("Liquidsoap has been stopped.");
        }
    });
    console.log("Quitting...");
    app.quit();
});