const { app, BrowserWindow, dialog, shell, remote, ipcMain, systemPreferences } = require('electron');
const nodeCmd = require('node-cmd');
const ProgressBar = require('electron-progressbar');
const fetchJson = require('fetch-json');
const { download } = require('electron-dl');
const prettySize = require('prettysize');
const fs = require('fs');

let mainWindow;
let liqSoapRunning = false;
let streamMP = null;
let streamPW = null;
global.artistData = null;

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
        title: 'TunePlay Streamer',
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
        minWidth: 450,
        minHeight: 500,
        webPreferences: {
            devTools: false,
            defaultFontFamily: 'sansSerif',
            defaultFontSize: 15,
            nativeWindowOpen: false,
            experimentalFeatures: true
        },
        icon: __dirname + "/buildResources/icon.ico"
    });

    let windowsAccentColor, windowsAccentColorHex;
    function updateAccentColor() {
        windowsAccentColor = "#"+systemPreferences.getAccentColor().substring(0, 6);
        mainWindow.webContents.send('accent-color-changed', windowsAccentColor);
        console.log("Updating accent color... It is now " + windowsAccentColor);
    }
    if (process.platform === "win32") {
        console.log("Platform is win32, so using accent colors!");
        systemPreferences.on('accent-color-changed', updateAccentColor);
    }
    else {
        console.log("Not on win32, so not using accent colors! Platform is " + process.platform);
    }

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
        }
        else {
            mainWindow.title = "Sign in to TunePlay";
        }
    });

    mainWindow.webContents.on('dom-ready', function(event) {
        let url = mainWindow.webContents.getURL();
        if (url.indexOf("portal.php") > -1 && (url.indexOf("&a=") > -1 || url.indexOf("?a=") > -1)) {
            // navigated to the artist portal of a specified artist. Retrieve livestreaming data and show the main UI.
            mainWindow.webContents.executeJavaScript('if (document.getElementById("mount_pw") != null) { document.getElementById("mount_pw").value } else { false; }', false)
                .then(function(result) {
                    console.log("Auth data promise is fulfilled");
                    if (result != false && result != "false") {
                        streamMP = getParameterByName('a', url);
                        if (streamMP != null) {
                            streamMP = streamMP.toLowerCase();
                        }
                        streamPW = result;
                        
                        // streamMP = 'test';
                        // streamPW = 'tuneplay2018';

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
                                    password = "`+streamPW+`",
                                    mount = "`+streamMP+`",
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
                                console.log("Liquidsoap script written to disk");
                                console.log("Retrieving artist data...");
                                mainWindow.loadURL("https://www.tuneplay.net/loading.php");
                                fetchJson.get("https://www.tuneplay.net/get.php?type=artist&id="+streamMP).then(function(json) {
                                    if (Object.keys(json).length > 0) {
                                        if (json["type"] == "success") {
                                            console.log("Artist data retrieved");
                                            global.artistData = json["data"];
                                            mainWindow.loadFile('ui.html');
                                        }
                                        else {
                                            console.log(json);
                                            dialog.showErrorBox('An error occured', 'Could not retrieve artist info');
                                            app.quit();
                                        }
                                    }
                                    else {
                                        console.error("Could not retrieve artist info. JSON is empty");
                                        dialog.showErrorBox('An error occured', 'Could not retrieve artist info');
                                        app.quit();
                                    }
                                });
                            }
                        });
                    }
                    else {
                        dialog.showMessageBox(mainWindow, {
                            type: "warning",
                            title: "Livestreaming is not yet enabled for this artist",
                            message: "Livestreaming is not yet enabled for the selected artist. You can enable it on this page, or you can press the back arrow up top to go back to the artist selection."
                        });
                    }
                })
                .catch(function(error) {
                    console.error(error);
                    dialog.showErrorBox('An error occured', 'Could not retrieve authentication details.');
                    app.quit();
                });
        }
        else {
            console.log("Loaded page is not an artist portal main page");
        }
        updateAccentColor();
    });

    mainWindow.on('closed', function(event) {
        if (liqSoapRunning) {
            stopLiqSoap();
        }
        else {
            console.log("Liquidsoap is not running, no need to stop it.");
        }
        fs.exists('liq\\script.liq', function(exists) {
            if (exists) {
                fs.unlink('liq\\script.liq', function(error) {
                    if (error) {
                        console.error(error);
                    }
                    else {
                        console.log("script.liq deleted.");
                    }
                });
            }
            else {
                console.log("No script.liq to delete.");
            }
        });
        console.log("Quitting TunePlay Streamer...");
        app.quit();
    });

    ipcMain.on('now-streaming', function(event, nowStreaming) {
        if (process.platform === "win32") {
            if (nowStreaming === true) {
                mainWindow.setOverlayIcon('resources/live.png', 'Currently streaming as ' + global.artistData["name"]);
                mainWindow.setThumbarButtons([{
                    tooltip: 'Stop Livestreaming',
                    icon: 'resources/stop.png',
                    click: function() {
                        mainWindow.webContents.send('stop-streaming', null);
                    },
                    flags: ['enabled']
                }]);
            }
            else {
                mainWindow.setOverlayIcon(null, "");
                mainWindow.setThumbarButtons([]);
            }
        }
    });
}

function stopLiqSoap() {
    console.log("Stopping liquidsoap...");
    nodeCmd.run('taskkill /IM "liquidsoap.exe" /F');
    liqSoapRunning = false;
}

function startLiqSoap(afterWards) {
    console.log("startLiqSoap function called");
    if (!liqSoapRunning) {
        console.log("Starting liquidsoap...");
        /*
        nodeCmd.get('liq\\liquidsoap.exe liq\\script.liq', function(err, data, stderr) {
            console.log("nodeCmd callback fired");
            if (err) {
                console.error(err);
                dialog.showErrorBox('An error occured', 'Could not start Liquidsoap. Liquidsoap is required for connecting to the TunePlay Livestreaming servers.');
                app.quit();
            }
        });
        */
       nodeCmd.run('liq\\liquidsoap.exe liq\\script.liq');
        liqSoapRunning = true;
        if (typeof afterWards == "function") {
            afterWards();
        }
        else {
            console.log("No afterwards function was given");
        }
    }
    else {
        console.log("Liquidsoap is already running!");
        if (typeof afterWards == "function") {
            afterWards();
        }
    }
}

ipcMain.on('start-liqsoap', function(event, arg) {
    startLiqSoap(function() {
        console.log("Liqsoap started event firing");
        event.sender.send('liquidsoap-started');
    });
});

ipcMain.on('stop-liqsoap', function(event, arg) {
    stopLiqSoap();
});