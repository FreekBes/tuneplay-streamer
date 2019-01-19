const { remote, desktopCapturer, ipcRenderer } = require('electron');

/* theme color (windows) */
const windowsThemeStyles = document.getElementById("windows-theme-styles");
let accentColor = "#FFCB2E";
function updateAccentColor(event, newAccentColor) {
    accentColor = newAccentColor;
    windowsThemeStyles.innerHTML = `
        .windows-bg-color {
            background-color: ` + accentColor + ` !important;
        }

        .windows-text-color {
            color: ` + accentColor + ` !important;
        }
    `;
    console.log("Updated accent color: " + newAccentColor);
}
ipcRenderer.on('accent-color-changed', updateAccentColor);

let webcast;
let socket = null;
let artistData = remote.getGlobal('artistData');
let source = null;
let isStreaming = false;
let audioAnalyzer = null;
const waveformCanvas = document.getElementById("waveform");
let waveformWidth = waveformCanvas.width;
const waveformHeight = waveformCanvas.height;
let waveformContext = null;
let doWaveformDrawing = false;

let welcome = document.getElementById("welcome");
welcome.innerHTML = "Welcome " + artistData["name"] + "!";

let startStop = document.getElementById("start-stop-streaming");

function startService() {
    desktopCapturer.getSources({ types: ['window'] }, function(error, sources) {
        if (error) {
            throw error;
        }
        else {
            for(let tempSource of sources) {
                console.log(tempSource);
                if (tempSource.name === 'TunePlay Streamer') {
                    console.log('%cFound TunePlay Streamer', 'color: green;');
                    source = tempSource;
                    startStreaming();
                    return;
                }
            }
            alert("Could not record desktop audio.");
        }
    });
}

function startStreaming() {
    if (source != null) {
        ipcRenderer.send('start-liqsoap');
    }
    else {
        console.log(source);
        alert("An error occured: could not find a source. Cannot connect to TunePlay Livestreaming Servers.");
    }
}

function stopStreaming() {
    doWaveformDrawing = false;

    if (isStreaming) {
        isStreaming = false;
        webcast.close();
    }

    startStop.innerHTML = "Start Livestreaming";
    startStop.setAttribute("onclick", "startStreaming();");
    startStop.className = "start windows-bg-color";

    ipcRenderer.send('now-streaming', false);
    ipcRenderer.send('stop-liqsoap');

    socket = null;
}

ipcRenderer.on('liquidsoap-started', function(event, arg) {
    console.log(source);
    navigator.mediaDevices.getUserMedia({
        audio: {
            mandatory: {
                chromeMediaSource: 'desktop'
            },
            optional: []
        },
        video: {
            mandatory: {
                chromeMediaSource: 'desktop'
            },
            optional: []
        }
    })
        .then(function(stream) {
            console.log("%cTunePlay Streaming is ready!", "color: green;");
            console.log(stream);
            let audioTracks = stream.getAudioTracks();
            console.log(audioTracks);
            if (audioTracks.length > 0) {
                let audioStream = audioTracks[0];
                const audioCtx = new AudioContext();
                audioAnalyzer = audioCtx.createAnalyser();
                audioAnalyzer.fftSize = 2048;
                let bufferLength = audioAnalyzer.frequencyBinCount;
                let dataArray = new Uint8Array(bufferLength);
                waveformContext = waveformCanvas.getContext("2d");
                waveformContext.canvas.width = window.innerWidth;
                waveformWidth = waveformCanvas.width;
                waveformContext.fillStyle = '#212121';
                waveformContext.clearRect(0, 0, waveformWidth, waveformHeight);
                doWaveformDrawing = true;
                const streamSource = audioCtx.createMediaStreamSource(stream);
                streamSource.connect(audioAnalyzer);
                
                let encoder = new Webcast.Encoder.Mp3({
                    channels: 2,
                    samplerate: 44100,
                    bitrate: 256
                });
                
                console.log("Audio context samplerate", audioCtx.sampleRate);
                if (audioCtx.sampleRate !== 44100) {
                    encoder = new Webcast.Encoder.Resample({
                        encoder:    encoder,
                        samplerate: audioCtx.sampleRate
                    });
                }
                
                encoder = new Webcast.Encoder.Asynchronous({
                    encoder: encoder,
                    scripts: ["https://www.tuneplay.net/import/webcast.js", "https://www.tuneplay.net/import/libshine.js", "https://www.tuneplay.net/import/libsamplerate.js"]
                });
                
                webcast = audioCtx.createWebcastSource(4096, 2);
                audioAnalyzer.connect(webcast);
                alert("As soon as you press OK here, you will go live on TunePlay as " + artistData["name"] + "! Keep in mind that this program records all system audio (no microphones though), so system audio (such as error messages and notifications) will also be heard by listeners. To ensure this does not happen, please disable those using volume control.");
                webcast.connect(audioCtx.destination);
                
                socket = webcast.connectSocket(encoder, "ws://source:hackme@localhost:4001/mount");
                socket.addEventListener('error', function(event) {
                    console.log(event);
                    alert('An error occured and the connection with the TunePlay Livestreaming servers was lost.');
                    isStreaming = false;
                    stopStreaming();
                });
                isStreaming = true;

                startStop.innerHTML = "Stop Livestreaming";
                startStop.setAttribute("onclick", "stopStreaming();");
                startStop.className = "stop windows-text-color";

                ipcRenderer.send('now-streaming', true);

                function draw() {
                    waveformWidth = waveformCanvas.width;
                    if (!doWaveformDrawing) {
                        waveformContext.fillStyle = '#212121';
                        waveformContext.fillRect(0, 0, waveformWidth, waveformHeight);
                        waveformContext = null;
                        return;
                    }
                    let drawVisual = requestAnimationFrame(draw);
                    audioAnalyzer.getByteTimeDomainData(dataArray);
                    waveformContext.canvas.width = window.innerWidth;
                    waveformContext.fillStyle = '#212121';
                    waveformContext.fillRect(0, 0, waveformWidth, waveformHeight);
                    waveformContext.lineWidth = 2;
                    waveformContext.strokeStyle = accentColor;
                    waveformContext.beginPath();
                    let sliceWidth = waveformWidth * 1.0 / bufferLength;
                    let x = 0;
                    for (let a = 0; a < bufferLength; a++) {
                        let v = dataArray[a] / 128.0;
                        let y = v * waveformHeight / 2;

                        if (a === 0) {
                            waveformContext.moveTo(x, y);
                        }
                        else {
                            waveformContext.lineTo(x, y);
                        }

                        x += sliceWidth;
                    }
                    // waveformContext.lineTo(waveformCanvas.width, waveformCanvas.height / 2);
                    waveformContext.stroke();
                };
                draw();
            }
            else {
                alert("An error occured: could not capture desktop audio properly.");
            }
        })
        .catch(function(error) {
            alert("An error occured: could not capture desktop audio. " + error.message);
        });
});

ipcRenderer.on('stop-streaming', function(event, arg) {
    stopStreaming();
});