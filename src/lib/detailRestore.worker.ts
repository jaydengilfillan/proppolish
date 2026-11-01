import { restoreDetail, type Raster } from "./detailRestore";

self.onmessage = (e: MessageEvent<{ ref: Raster; out: Raster }>) => {
  try {
    const r = restoreDetail(e.data.ref, e.data.out);
    (self as unknown as Worker).postMessage({ ok: true, data: r.data, coverage: r.coverage }, [r.data.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ ok: false, error: String(err) });
  }
};
