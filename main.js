const { app, BrowserWindow, dialog, shell } = require('electron');
const nodeCmd = require('node-cmd');
const ProgressBar = require('electron-progressbar');
const fetchJson = require('fetch-json');
const { download } = require('electron-dl');
const prettySize = require('prettysize');
const fs = require('fs');

let mainWindow;
let streamMP = null;
let streamPW = null;

// from https://stackoverflow.com/questions/901115/how-can-i-get-query-string-values-in-javascript
function getParameterByName(name, url) {
    if (!url) url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

app.on('ready', function() {
    console.log('App is ready!');
    console.log('Node v' + process.versions.node);
    console.log('Electron v' + process.versions.electron);
    console.log('Chrome v' + process.versions.chrome);
    console.log('TunePlay Desktop v' + app.getVersion());
    checkForUpdates();
});

function checkForUpdates() {
    progressBar = new ProgressBar({
        title: 'TunePlay',
        text: 'Checking for updates...',
        detail: 'Fetching update logs...',
        indeterminate: true,
    });

    console.log("Checking for updates...");
    const updateLogUrl = 'https://www.tuneplay.net/appversion-streamer.json';
    fetchJson.get(updateLogUrl).then(handleUpdateLog);
}

function handleUpdateLog(data) {
    if (Object.keys(data).length > 0) {
        if (data["latest_name_version"] != undefined && data["latest_name_version"] != null) {
            progressBar.detail = 'Reading update logs...';
            if (app.getVersion() != data["latest_name_version"]) {
                progressBar.text = 'An update is available!';
                console.log("An update is available!");
                if (fs.existsSync(app.getPath('temp') + "/tuneplay-streamer-updater.exe")) {
                    progressBar.detail = 'Deleting old updater... This could take a minute or two.';
                    console.log("Deleting old updater... This could take a minute or two.");
                    fs.unlink(app.getPath('temp') + "/tuneplay-streamer-updater.exe", function() {
                        console.log("File deleted!");
                        progressBar.detail = 'Starting download...';
                        downloadUpdate();
                    });
                }
                else {
                    console.log("No old updater to delete.");
                    progressBar.detail = 'Starting download...';
                    downloadUpdate();
                }
            }
            else {
                // no update is available
                console.log("No update available.");
                progressBar.text = "Starting TunePlay Streamer...";
                progressBar.detail = "";
                start();
            }
        }
        else {
            console.log(data);
            console.warn("latest_app_version is not set!");
            progressBar.close();
            dialog.showErrorBox('Update checking error', 'An error occured while checking for updates.\n\nPlease reinstall TunePlay Streamer at tuneplay.net/app-download.php.');
            app.quit();
        }
    }
    else {
        console.warn("Something happened and the update logs are empty.");
        progressBar.close();
        dialog.showErrorBox('Update checking error', 'An error occured while checking for updates.\n\nPlease reinstall TunePlay Streamer at tuneplay.net/app-download.php.');
        app.quit();
    }
}

function downloadUpdate() {
    console.log("Loading new progressbar...");
    let dlProgressBar = new ProgressBar({
        title: 'TunePlay Streamer',
        text: 'Downloading update...',
        detail: 'Starting download...',
        indeterminate: false,
        initialValue: 0,
        maxValue: 100,
        closeOnComplete: false
    });
    progressBar.close();
    console.log("Starting download...");
    console.log("Location: " + app.getPath('temp'));
    let downloadItem = null;
    download(BrowserWindow.getFocusedWindow(), 'https://github.com/FreekBes/tuneplay-streamer/raw/master/dist/tuneplay-streamer-latest.exe', {
        saveAs: false,
        directory: app.getPath('temp'),
        filename: 'tuneplay-streamer-updater.exe',
        showBadge: false,
        onStarted: function(dli) {
            console.log("Download started!");
            downloadItem = dli;
        },
        onProgress: function(progress) {
            console.log("Downloading update... " + (progress * 100) + "%");
            dlProgressBar.value = progress * 100;
            dlProgressBar.detail = prettySize(downloadItem.getReceivedBytes(), true, false, 1).padStart(6, ' ') + " / " + prettySize(downloadItem.getTotalBytes(), true, false, 1).padStart(6, ' ');
        },
        onCancel: function() {
            console.warn("Download canceled!");
            dlProgressBar.close();
            dialog.showErrorBox('Update downloading error', 'An error occured while downloading the update. The download was canceled.\n\nPlease reinstall TunePlay Streamer at tuneplay.net/portal.php.');
            app.quit();
        }
    })
        .then(function(dl) {
            console.log("Download finished");
            console.log("Loading new progressbar...");
            let openProgressBar = new ProgressBar({
                title: 'TunePlay',
                text: 'Starting update installer... This might take a while.',
                detail: 'This window might not respond until the installer has been started.',
                indeterminate: true
            });
            dlProgressBar.close();
            setTimeout(function() {
                console.log("Opening updater...");
                let opened = shell.openItem(app.getPath('temp') + "/tuneplay-streamer-updater.exe");
                openProgressBar.close();
                if (!opened) {
                    dialog.showErrorBox('An error occured', 'Could not open the TunePlay Streamer updater.\n\nPlease reinstall TunePlay Streamer at tuneplay.net/portal.php.');
                }
                app.quit();
            }, 500);
        })
        .catch(function(error) {
            console.log(error);
            dlProgressBar.close();
            dialog.showErrorBox('Update downloading error', 'An error occured while downloading the update.\n\nPlease reinstall TunePlay Streamer at tuneplay.net/portal.php.');
            app.quit();
        });
}

function start() {
    mainWindow = new BrowserWindow({
        show: false,
        frame: true,
        backgroundColor: '#1A1A1A',
        center: true,
        fullscreenable: false,
        title: "TunePlay Streamer",
        darkTheme: true,
        vibrancy: "dark",
        titleBarStyle: 'hiddenInset',
        webPreferences: {
            devTools: false,
            defaultFontFamily: 'sansSerif',
            defaultFontSize: 15,
            nativeWindowOpen: false,
            experimentalFeatures: true
        },
        icon: __dirname + "/buildResources/icon.ico"
    });

    mainWindow.setMenu(null);
    mainWindow.loadURL('https://www.tuneplay.net/loading.php');
    mainWindow.once('ready-to-show', function() {
        // when the window is ready, load the main site
        // while loading, loading.php will still be shown
        progressBar.close();
        mainWindow.show();
        mainWindow.loadURL('https://www.tuneplay.net/portal.php');
        // mainWindow.webContents.openDevTools();
    });

    app.on('browser-window-created', function(e, window) {
        window.setMenu(null);
    });

    mainWindow.on('page-title-updated', function(event, title) {
        // update page title, but do not do so on login.php
        if (mainWindow.webContents.getURL().indexOf(".tuneplay.net/login.php") == -1) {
            mainWindow.title = title;
            mainWindow.webContents.executeJavaScript(`document.getElementById("electron-window-title-text").innerHTML = decodeURIComponent("`+encodeURIComponent(title)+`");`);
        }
        else {
            mainWindow.title = "Sign in to TunePlay";
        }
    });

    mainWindow.webContents.on('dom-ready', function(event) {
        let url = mainWindow.webContents.getURL();
        if (url.indexOf("portal.php") > -1 && (url.indexOf("&a=") > -1 || url.indexOf("?a=") > -1)) {
            // navigated to the artist portal of a specified artist. Retrieve livestreaming data and show the main UI.
            mainWindow.webContents.executeJavaScript('document.getElementById("mount_pw").value', false)
                .then(function(result) {
                    streamMP = getParameterByName('a', url);
                    if (streamMP != null) {
                        streamMP = streamMP.toLowerCase();
                    }
                    streamPW = result;
                    console.log(streamMP);
                    console.log(streamPW);

                    let liqScript = `
                        #!/usr/bin/liquidsoap

                        # Live DJ stuff
                        set("harbor.bind_addr","0.0.0.0")
                        set("harbor.verbose",true)
                        livedj = input.harbor(
                            "mount",
                            port=4001,
                            password="hackme"
                        )
                        
                        # Set Radio
                        radio = fallback(track_sensitive = false, [livedj])
                        
                        # Stream it out
                        output.icecast(
                                %mp3(bitrate=256),
                                fallible=true,
                                host = "tuneplay.net",
                                port = 4003,
                                password = `+streamPW+`,
                                mount = `+streamMP+`,
                                radio
                        )
                    `;

                    fs.writeFile('liq\\script.liq', liqScript, function(error) {
                        if (error) {
                            console.error(error);
                            dialog.showErrorBox('An error occured', 'Could not write authentication details to disk. Details: ' + error.message);
                            app.quit();
                        }
                        else {
                            console.log("LiquidSoap script written to disk");s
                        }
                    });
                })
                .catch(function(error) {
                    console.error(error);
                });
        }
    });
}

/*
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
*/