// Re-encodes a clip in the browser to a clean H.264 MP4 (<=720p-1280, 30fps) that the video models accept.
function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error("Could not read this video file."));
    v.src = url;
  });
}

const SHORT_CLIP = 3.4;
const LOOP_TARGET = 3.6;

export async function prepareClip(file: File, secs: number, onProgress: (p: number) => void, loops = 1): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const video = await loadVideo(url);
    const long = Math.max(video.videoWidth, video.videoHeight);
    const scale = Math.min(1, 1280 / long);
    const w = Math.max(2, Math.round((video.videoWidth * scale) / 2) * 2);
    const h = Math.max(2, Math.round((video.videoHeight * scale) / 2) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    const mime = ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1.42E01E", "video/mp4"].find((m) =>
      typeof MediaRecorder !== "undefined" ? MediaRecorder.isTypeSupported(m) : false
    );
    if (!mime) throw new Error("This browser can't make MP4 clips. Use Chrome or Safari.");
    // Record a little over the chosen length: the recorder stops a few frames early, and engines reject clips even 0.02s under their 3s minimum.
    const dur = loops > 1 ? video.duration * loops : Math.min(video.duration, secs + 0.6, 15);
    // Manual frame pushing (captureStream(0) + requestFrame) so the recording gets a frame on every tick even when the picture hasn't changed.
    const stream = canvas.captureStream(0);
    const vtrack = stream.getVideoTracks()[0] as (MediaStreamTrack & { requestFrame?: () => void }) | undefined;
    const manual = !!vtrack?.requestFrame;
    const liveStream = manual ? stream : canvas.captureStream(30);
    const recorder = new MediaRecorder(liveStream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/mp4" }));
    });
    video.currentTime = 0;
    await new Promise<void>((r) => {
      video.onseeked = () => r();
    });
    ctx.drawImage(video, 0, 0, w, h);
    recorder.start(500);
    await video.play();
    const started = performance.now();
    await new Promise<void>((resolve) => {
      let finished = false;
      let watchdog = 0;
      // Repaint at a steady 48fps target even if the source decodes slowly (big drone files), so the recording never falls under the engines' 23fps minimum.
      // The timer lives in a Web Worker: browsers slow main-thread timers to ~1/sec when the tab is hidden or busy, which is what produced 12fps clips.
      const paint = () => {
        ctx.drawImage(video, 0, 0, w, h);
        if (manual) vtrack!.requestFrame!();
      };
      let tickWorker: Worker | null = null;
      let painter = 0;
      try {
        const src = `let t=setInterval(()=>postMessage(1),${(1000 / 30).toFixed(2)});onmessage=()=>{clearInterval(t);close()}`;
        const wurl = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
        tickWorker = new Worker(wurl);
        URL.revokeObjectURL(wurl);
        tickWorker.onmessage = paint;
      } catch {
        painter = window.setInterval(paint, 1000 / 30);
      }
      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearInterval(watchdog);
        window.clearInterval(painter);
        if (tickWorker) {
          tickWorker.postMessage(0);
          tickWorker.terminate();
        }
        video.removeEventListener("ended", onEnded);
        resolve();
      };
      // Reached the end of the source while still short of the target: loop it (short clips) or stop (everything else).
      const onEnded = () => {
        if (loops > 1 && (performance.now() - started) / 1000 < dur - 0.1) {
          video.currentTime = 0;
          void video.play();
        } else {
          finish();
        }
      };
      video.addEventListener("ended", onEnded);
      const check = () => {
        const elapsed = (performance.now() - started) / 1000;
        if (loops > 1) {
          onProgress(Math.min(1, elapsed / dur));
          if (video.currentTime >= video.duration - 0.04 && elapsed < dur - 0.1) {
            video.currentTime = 0;
            void video.play();
          }
          if (elapsed >= dur - 0.02) finish();
        } else {
          onProgress(Math.min(1, video.currentTime / dur));
          if (video.currentTime >= dur - 0.04 || video.ended) finish();
        }
        if (elapsed > dur * 2 + 15) finish(); // hard stop
      };
      // Watchdog: frame callbacks stop when the video ends or the tab is hidden, so never rely on them alone.
      watchdog = window.setInterval(check, 200);
      const tick = () => {
        if (finished) return;
        // With the worker timer running, ONLY it pushes frames (30fps); painting here too would double the frame rate (62fps was rejected).
        if (!tickWorker) paint();
        check();
        if (finished) return;
        if ("requestVideoFrameCallback" in video) (video as HTMLVideoElement).requestVideoFrameCallback(tick);
        else requestAnimationFrame(tick);
      };
      tick();
    });
    video.pause();
    recorder.stop();
    return await done;
  } finally {
    URL.revokeObjectURL(url);
  }
}
