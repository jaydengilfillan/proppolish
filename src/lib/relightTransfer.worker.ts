import { relightTransfer } from "./relightTransfer";
import type { Raster } from "./detailRestore";

self.onmessage = (e: MessageEvent<{ ref: Raster; out: Raster }>) => {
  try {
    const r = relightTransfer(e.data.ref, e.data.out);
    (self as unknown as Worker).postMessage({ ok: true, data: r.data, skyShare: r.skyShare }, [r.data.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(err) });
  }
};
