import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

const GRID = 'rgba(148, 163, 184, 0.12)';
const TICK = '#8b93a5';

/** Repere vertical sur le point de diffraction critique. */
const criticalMarker = {
  id: 'criticalMarker',
  afterDatasetsDraw(chart, _args, opts) {
    const pt = opts?.point;
    if (!pt) return;
    const { ctx, scales } = chart;
    const x = scales.x.getPixelForValue(pt.distKm);
    const yTop = scales.y.getPixelForValue(pt.los);
    const yBot = scales.y.getPixelForValue(pt.terrain);
    ctx.save();
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, scales.y.top);
    ctx.lineTo(x, scales.y.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, yBot, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f43f5e';
    ctx.fill();
    ctx.strokeStyle = '#0b0e14';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#fda4af';
    ctx.font = '600 10px Inter, system-ui, sans-serif';
    ctx.textAlign = x > (scales.x.left + scales.x.right) / 2 ? 'right' : 'left';
    const dx = x > (scales.x.left + scales.x.right) / 2 ? -6 : 6;
    ctx.fillText('obstacle dominant', x + dx, Math.min(yTop, yBot) - 8);
    ctx.restore();
  },
};

export default function ProfileChart({ hop, title, subtitle, onReady, height = 240 }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!hop?.series) return;
    const s = hop.series;
    const n = s.dist.length;
    const pt = (arr) => Array.from({ length: n }, (_, i) => ({ x: s.dist[i], y: arr[i] }));
    // Le critere de dimensionnement est 60 % du rayon : on le trace en plus de
    // l enveloppe complete.
    const f60 = Array.from({ length: n }, (_, i) => s.los[i] - 0.6 * (s.fresnelUp[i] - s.los[i]));
    // Le relief trace inclut deja le bati, opaque ; la bande verte au-dessus
    // est la vegetation, traitee comme milieu absorbant.
    const hasCanopy = s.canopy && s.canopy.some((v, i) => v > s.terrain[i] + 0.5);

    const cfg = {
      type: 'line',
      data: {
        datasets: [
          {
            label: '1re zone de Fresnel',
            data: pt(s.fresnelUp),
            borderColor: 'rgba(249, 115, 22, 0.55)',
            borderWidth: 1,
            pointRadius: 0,
            fill: { target: 2, above: 'rgba(249, 115, 22, 0.13)' },
            tension: 0,
            order: 3,
          },
          {
            label: 'Ligne de visee',
            data: pt(s.los),
            borderColor: 'rgba(226, 232, 240, 0.9)',
            borderWidth: 1.6,
            borderDash: [6, 4],
            pointRadius: 0,
            fill: false,
            order: 2,
          },
          {
            label: 'Fresnel bas',
            data: pt(s.fresnelDown),
            borderColor: 'rgba(249, 115, 22, 0.55)',
            borderWidth: 1,
            pointRadius: 0,
            fill: false,
            order: 3,
          },
          {
            label: 'Seuil 60 % de Fresnel',
            data: pt(f60),
            borderColor: 'rgba(251, 191, 36, 0.85)',
            borderWidth: 1.2,
            borderDash: [3, 3],
            pointRadius: 0,
            fill: false,
            order: 3,
          },
          {
            label: 'Couvert vegetal',
            data: pt(hasCanopy ? s.canopy : s.terrain),
            borderColor: 'rgba(34, 197, 94, 0.75)',
            backgroundColor: 'rgba(34, 197, 94, 0.28)',
            borderWidth: hasCanopy ? 1 : 0,
            pointRadius: 0,
            fill: 5,
            tension: 0,
            order: 2,
            hidden: !hasCanopy,
          },
          {
            label: 'Relief (corrige 4/3)',
            data: pt(s.terrain),
            borderColor: 'rgba(161, 161, 170, 0.95)',
            backgroundColor: 'rgba(113, 113, 122, 0.42)',
            borderWidth: 1.4,
            pointRadius: 0,
            fill: 'start',
            tension: 0,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { top: 14, right: 6 } },
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Distance (km)', color: TICK, font: { size: 10 } },
            grid: { color: GRID },
            ticks: { color: TICK, font: { size: 10 }, maxTicksLimit: 8 },
          },
          y: {
            title: { display: true, text: 'Altitude (m)', color: TICK, font: { size: 10 } },
            grid: { color: GRID },
            ticks: { color: TICK, font: { size: 10 } },
          },
        },
        plugins: {
          legend: {
            labels: {
              color: TICK,
              boxWidth: 10,
              boxHeight: 2,
              font: { size: 10 },
              filter: (item) =>
                item.text !== 'Fresnel bas' &&
                !(item.text === 'Couvert vegetal' && !hasCanopy),
            },
          },
          tooltip: {
            backgroundColor: 'rgba(17, 21, 31, 0.95)',
            borderColor: '#2a3345',
            borderWidth: 1,
            titleColor: '#e4e4e7',
            bodyColor: '#a1a1aa',
            callbacks: {
              title: (items) => `${items[0].parsed.x.toFixed(2)} km`,
              label: (item) => `${item.dataset.label} : ${item.parsed.y.toFixed(1)} m`,
            },
          },
          criticalMarker: { point: hop.worstPoint },
        },
      },
      plugins: [criticalMarker],
    };

    chartRef.current = new Chart(canvasRef.current, cfg);
    onReady?.(chartRef.current);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [hop, onReady]);

  if (!hop?.series) return null;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[13px] font-semibold text-zinc-200">{title}</h4>
        {subtitle && <span className="font-mono text-[11px] text-zinc-500">{subtitle}</span>}
      </div>
      <div style={{ height }}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
