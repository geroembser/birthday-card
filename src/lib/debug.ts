/** On-screen pointer-event trace for the editor (open /edit/:id?debug=1). */

export interface DebugPanel {
  log(message: string): void;
  destroy(): void;
}

export function createDebugPanel(host: HTMLElement): DebugPanel {
  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  panel.innerHTML = `<div class="debug-tools"><button type="button" data-act="copy">Copy log</button><button type="button" data-act="clear">Clear</button><span class="debug-count"></span></div><pre class="debug-log"></pre>`;
  host.append(panel);
  const pre = panel.querySelector<HTMLElement>('.debug-log')!;
  const count = panel.querySelector<HTMLElement>('.debug-count')!;
  const lines: string[] = [];
  const t0 = performance.now();
  let last = t0;
  let raf = 0;

  const render = () => {
    raf = 0;
    pre.textContent = lines.slice(-40).join('\n');
    count.textContent = `${lines.length} events · ${navigator.userAgent.match(/(iPad|iPhone|Macintosh|Android|Windows)[^;)]*/)?.[0] ?? ''}`;
  };

  panel.querySelector('.debug-tools')!.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).dataset.act;
    if (act === 'clear') {
      lines.length = 0;
      render();
    } else if (act === 'copy') {
      const text = `${navigator.userAgent}\n${lines.join('\n')}`;
      navigator.clipboard.writeText(text).catch(() => prompt('Copy the log', text));
    }
  });

  return {
    log(message) {
      const now = performance.now();
      lines.push(`${(now - t0).toFixed(0).padStart(6)}ms +${(now - last).toFixed(0).padStart(4)} ${message}`);
      last = now;
      if (lines.length > 2000) lines.splice(0, 500);
      if (!raf) raf = requestAnimationFrame(render);
    },
    destroy() {
      cancelAnimationFrame(raf);
      panel.remove();
    },
  };
}
