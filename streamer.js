const { remote, desktopCapturer, ipcRenderer } = require('electron');

let webcast;
let artistData = remote.getGlobal('artistData');
let source = null;
let isStreaming = false;

var welcome = document.getElementById("welcome");
welcome.innerHTML = "Welcome " + artistData["name"] + "!";

var startStop = document.getElementById("start-stop-streaming");

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
                    break;
                }
            }
            startStreaming();
        }
    });
}

function startStreaming() {
    if (source != null) {
        ipcRenderer.on('liquidsoap-started', function(event, arg) {
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
                    var audioTracks = stream.getAudioTracks();
                    console.log(audioTracks);
                    if (audioTracks.length > 0) {
                        let audioStream = audioTracks[0];
                        const audioCtx = new AudioContext();
                        const source = audioCtx.createMediaStreamSource(stream);
                        
                        let encoder = new Webcast.Encoder.Mp3({
                            channels: 2,
                            samplerate: 44100,
                            bitrate: 128
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
                            scripts: ["webcast.js", "libshine.js", "libsamplerate.js"]
                        });
                        
                        webcast = audioCtx.createWebcastSource(4096, 2);
                        source.connect(webcast);
                        webcast.connect(audioCtx.destination);
                        
                        webcast.connectSocket(encoder, "ws://source:hackme@localhost:4001/mount");
                        isStreaming = true;

                        startStop.innerHTML = "Stop Livestreaming";
                        startStop.onclick = "stopStreaming();";
                        startStop.className = "stop";
                    }
                    else {
                        alert("An error occured: could not capture desktop audio properly.");
                    }
                })
                .catch(function(error) {
                    alert("An error occured: could not capture desktop audio. " + error.message);
                });
        });
        ipcRenderer.send('start-liqsoap');
    }
    else {
        console.log(source);
        alert("An error occured: could not find a source. Cannot connect to TunePlay Livestreaming Servers.");
    }
}

function stopStreaming() {
    if (isStreaming) {
        webcast.close();
        isStreaming = false;
    }

    startStop.innerHTML = "Start Livestreaming";
    startStop.onclick = "startService();";
    startStop.className = "start";
}