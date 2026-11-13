/** 合并高频进度回调为定时刷新 */
export function throttleProgress(paint: (data: any) => void): (data: any) => void {
  let last = 0;
  let pending = null;
  let timer = null;
  return (data) => {
    pending = data;
    const isDone = data && data.total > 0 && data.written >= data.total;
    if (isDone || Date.now() - last >= 120) {
      clearTimeout(timer);
      timer = null;
      last = Date.now();
      paint(pending);
      pending = null;
      return;
    }
    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        if (pending) {
          paint(pending);
          pending = null;
        }
      }, 120);
    }
  };
}
