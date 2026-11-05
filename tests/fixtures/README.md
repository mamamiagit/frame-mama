These tiny video fixtures were generated locally using FFmpeg's synthetic sources; they contain no third-party content. FFmpeg is only needed to regenerate them, not to run Frame or its tests.

```sh
ffmpeg -f lavfi -i 'testsrc2=size=320x180:rate=10' -t 2 -c:v libvpx-vp9 -threads 2 sample.webm
ffmpeg -f lavfi -i 'color=c=blue:size=320x180:rate=10' -t 3 -c:v libx264 -pix_fmt yuv420p -threads 2 sample.mp4
```
