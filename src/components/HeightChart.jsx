import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

const GRID = 'rgba(148, 163, 184, 0.12)';
const TICK = '#8b93a5';

/** Bande de la marge souhaitee + repere des hauteurs testees au balayage. */
const thresholdBand = {
  id: 'thresholdBand',
  beforeDatasetsDraw(chart, _a, opts) {
    const { ctx, scales } = chart;
    const target = opts?.target;
    if (!Number.isFinite(target)) return;
    const y = scales.y.getPixelForValue(target);
    if (!Number.isFinite(y)) return;
    ctx.save();
    ctx.fillStyle = 'rgba(34, 197, 94, 0.07)';
    ctx.fillRect(scales.x.left, scales.y.top, scales.x.right - scales.x.left, Math.max(0, y - scales.y.top));
    ctx.strokeStyle = 'rgba(34, 197, 94, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(scales.x.left, y);
    ctx.lineTo(scales.x.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(134, 239, 172, 0.9)';
    ctx.font = '600 10px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`marge souhaitee ${target} dB`, scales.x.left + 6, y - 5);
    ctx.restore();
  },
};

export default function HeightChart({ rows, desiredMargin, currentHeight, onReady, height = 250 }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!rows?.length) return;
    const labels = rows.map((r) => r.height);
    const series = (key, label, color, opts = {}) => ({
      label,
      data: rows.map((r) => r[key]),
      borderColor: color,
      backgroundColor: color,
      borderWidth: opts.width ?? 1.8,
      borderDash: opts.dash,
      pointRadius: rows.map((r) => (r.height === currentHeight ? 4 : 0)),
      pointBackgroundColor: color,
      pointBorderColor: '#0b0e14',
      pointBorderWidth: 1.5,
      tension: 0.25,
      fill: false,
    });

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [
          series('margin', 'Marge globale (maillon faible)', '#38bdf8', { width: 2.6 }),
          series('m1', 'Bond 1 : TX vers relais', '#a78bfa', { dash: [5, 3] }),
          series('m2', 'Bond 2 : relais vers RX', '#f472b6', { dash: [5, 3] }),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            title: { display: true, text: 'Hauteur d antenne du relais (m)', color: TICK, font: { size: 10 } },
            grid: { color: GRID },
            ticks: { color: TICK, font: { size: 10 } },
          },
          y: {
            title: { display: true, text: 'Marge (dB)', color: TICK, font: { size: 10 } },
            grid: { color: GRID },
            ticks: { color: TICK, font: { size: 10 } },
          },
        },
        plugins: {
          legend: { labels: { color: TICK, boxWidth: 10, boxHeight: 2, font: { size: 10 } } },
          tooltip: {
            backgroundColor: 'rgba(17, 21, 31, 0.95)',
            borderColor: '#2a3345',
            borderWidth: 1,
            titleColor: '#e4e4e7',
            bodyColor: '#a1a1aa',
            callbacks: {
              title: (items) => `Antenne a ${items[0].label} m`,
              label: (item) => `${item.dataset.label} : ${item.parsed.y.toFixed(1)} dB`,
            },
          },
          thresholdBand: { target: desiredMargin },
        },
      },
      plugins: [thresholdBand],
    });
    onReady?.(chartRef.current);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [rows, desiredMargin, currentHeight, onReady]);

  if (!rows?.length) return null;

  // Hauteur minimale atteignant la marge souhaitee : la reponse concrete a
  // "faut-il un mat ?".
  const firstOk = rows.find((r) => r.margin >= desiredMargin);
  const bestRow = rows.reduce((a, b) => (b.margin > a.margin ? b : a), rows[0]);
  const gain = bestRow.margin - rows[0].margin;

  return (
    <div>
      <div style={{ height }}>
        <canvas ref={canvasRef} />
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
        {firstOk ? (
          <>
            La marge souhaitee de <b className="text-zinc-200">{desiredMargin} dB</b> est atteinte des{' '}
            <b className="text-emerald-300">{firstOk.height} m</b> de hauteur d antenne.
          </>
        ) : (
          <>
            La marge souhaitee de <b className="text-zinc-200">{desiredMargin} dB</b> n est jamais atteinte sur
            cette plage : le meilleur resultat est {bestRow.margin.toFixed(1)} dB a {bestRow.height} m.
          </>
        )}{' '}
        Passer de {rows[0].height} m a {bestRow.height} m rapporte {gain.toFixed(1)} dB.
      </p>
    </div>
  );
}
