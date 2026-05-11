const db = new Dexie('training_log_db');
db.version(1).stores({ entries: '++id,date,dayType,exercise,load,reps,rir,knee,createdAt' });

const state = { chart: null };
const $ = (id) => document.getElementById(id);
const formatDate = (d) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(d));
const toNum = (v) => Number(v || 0);
const e1rm = (load, reps, rir) => {
  const effortReps = Math.max(1, toNum(reps) + toNum(rir));
  return Math.round((toNum(load) * (1 + effortReps / 30)) * 10) / 10;
};
const fatigueIndex = (reps, rir, knee) => Math.round((toNum(reps) * 2 + toNum(rir) * 3 + toNum(knee || 0)) * 10) / 10;

function setToday() {
  const d = new Date();
  $('date').value = d.toISOString().slice(0, 10);
}

function switchTab(tab) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add('active');
}

async function saveEntry(e) {
  e.preventDefault();
  const entry = {
    date: $('date').value,
    dayType: $('dayType').value,
    exercise: $('exercise').value.trim(),
    load: toNum($('load').value),
    reps: toNum($('reps').value),
    rir: toNum($('rir').value),
    knee: $('knee').value === '' ? null : toNum($('knee').value),
    notes: $('notes').value.trim(),
    createdAt: new Date().toISOString()
  };
  await db.entries.add(entry);
  $('entryForm').reset();
  setToday();
  $('dayType').value = entry.dayType;
  await refreshAll();
  switchTab('history');
}

async function refreshHistory(entries) {
  const el = $('historyList');
  if (!entries.length) {
    el.innerHTML = '<div class="card muted">No entries yet.</div>';
    return;
  }
  el.innerHTML = entries.slice().reverse().map(x => `
    <article class="card entry">
      <div class="entry-head">
        <div>
          <div class="entry-title">${x.exercise} <span class="pill">${x.dayType}</span></div>
          <div class="entry-meta">${formatDate(x.date)} • Load ${x.load} • Reps ${x.reps} • RIR ${x.rir}${x.knee === null || x.knee === undefined ? '' : ' • Knee ' + x.knee}</div>
        </div>
        <div class="small muted">e1RM ${e1rm(x.load, x.reps, x.rir)}</div>
      </div>
      ${x.notes ? `<div class="entry-notes">${x.notes}</div>` : ''}
    </article>
  `).join('');
}

async function refreshTrends(entries) {
  $('entryCount').textContent = entries.length;
  if (!entries.length) {
    $('latestE1RM').textContent = '—';
    $('latestFatigue').textContent = '—';
    if (state.chart) state.chart.destroy();
    state.chart = null;
    return;
  }
  const sorted = [...entries].sort((a,b) => new Date(a.date) - new Date(b.date) || new Date(a.createdAt) - new Date(b.createdAt));
  const labels = sorted.map(x => x.date);
  const e1 = sorted.map(x => e1rm(x.load, x.reps, x.rir));
  const fat = sorted.map(x => fatigueIndex(x.reps, x.rir, x.knee));
  $('latestE1RM').textContent = e1[e1.length - 1].toFixed(1);
  $('latestFatigue').textContent = fat[fat.length - 1].toFixed(1);
  const ctx = $('trendChart');
  if (state.chart) state.chart.destroy();
  state.chart = new Chart(ctx, {
    type: 'line',
     {
      labels,
      datasets: [
        { label: 'Estimated 1RM',  e1, borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,.12)', tension: .25, fill: false },
        { label: 'Fatigue index',  fat, borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,.12)', tension: .25, fill: false }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(55,65,81,.35)' } },
        y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(55,65,81,.35)' } }
      },
      plugins: {
        legend: { labels: { color: '#e5e7eb' } },
        tooltip: { mode: 'index', intersect: false }
      }
    }
  });
}

async function refreshAll() {
  const entries = await db.entries.orderBy('date').toArray();
  await refreshHistory(entries);
  await refreshTrends(entries);
}

function downloadCSV(rows) {
  const header = ['id','date','dayType','exercise','load','reps','rir','knee','notes','createdAt','e1rm','fatigue'];
  const lines = [header.join(',')].concat(rows.map(r => [r.id,r.date,r.dayType,r.exercise,r.load,r.reps,r.rir,r.knee ?? '', JSON.stringify(r.notes ?? ''),r.createdAt,e1rm(r.load,r.reps,r.rir),fatigueIndex(r.reps,r.rir,r.knee)].join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'training-log-export.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

window.addEventListener('DOMContentLoaded', async () => {
  setToday();
  $('dayType').value = 'Mon';
  $('entryForm').addEventListener('submit', saveEntry);
  document.querySelectorAll('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  $('exportBtn').addEventListener('click', async () => downloadCSV(await db.entries.orderBy('date').toArray()));
  await refreshAll();
});
