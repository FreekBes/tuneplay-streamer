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
        password = REPLACE_ARTIST_PASSWORD,
        mount = REPLACE_ARTIST_MOUNTPOINT,
        radio
)