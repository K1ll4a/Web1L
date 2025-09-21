

(function () {
  const xInput = document.getElementById('x-input');
  const rInput = document.getElementById('r-input');
  const submitBtn = document.getElementById('submit');
  const resultContainer = document.getElementById('result');


  function parseNumber(str) {
    if (typeof str !== 'string') return NaN;

    const s = str.replace(',', '.').trim();
    if (s === '') return NaN;
    return Number(s);
  }

  function getY() {
    const radios = Array.from(document.querySelectorAll('input[name="y-value"]'));
    const chosen = radios.find(r => r.checked);
    return chosen ? Number(chosen.value) : null;
  }

  function invalid(msg) {
    alert(msg);
  }

  function validate() {
    const x = parseNumber(xInput.value);
    const y = getY();
    const r = parseNumber(rInput.value);

    if (!Number.isFinite(x)) { invalid('X должен быть числом.'); return null; }
    if (x < -3 || x > 3) { invalid('X должен быть в диапазоне [-3; 3].'); return null; }

    if (y === null || !Number.isFinite(y)) { invalid('Не выбран Y.'); return null; }
    if (y < -3 || y > 5) { invalid('Y должен быть в диапазоне {-3..5}.'); return null; }

    if (!Number.isFinite(r)) { invalid('R должен быть числом.'); return null; }
    if (r <= 0) { invalid('R должен быть положительным.'); return null; }
    if (r < 1 || r > 4) { invalid('R должен быть в диапазоне [1; 4].'); return null; }

    return { x, y, r };
  }

  function renderRow(item) {

    const cells = [
      item.time,
      String(item.x),
      String(item.y),
      String(item.r),
      item.hit ? 'ДА' : 'НЕТ',
      item.durationMs + ' ms'
    ];
    cells.forEach(text => {
      const div = document.createElement('div');
      div.textContent = text;
      resultContainer.appendChild(div);
    });
  }

  function renderHistory(history) {
    resultContainer.innerHTML = '';
    history.forEach(renderRow);
  }


  const saved = localStorage.getItem('history');
  if (saved) {
    try { renderHistory(JSON.parse(saved)); } catch (_e) {}
  }

  async function send(data) {
    const start = performance.now();
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error('Ошибка ответа FastCGI: ' + text);
    }
    const payload = await res.json();

    const duration = Math.round(performance.now() - start);
    const item = payload.item || {
      time: new Date().toLocaleString(),
      x: data.x, y: data.y, r: data.r,
      hit: payload.hit === true,
      durationMs: duration
    };
    const history = payload.history || [];

    const clientHistory = history.length ? history : (JSON.parse(localStorage.getItem('history') || '[]'));
    clientHistory.unshift(item);
    localStorage.setItem('history', JSON.stringify(clientHistory.slice(0, 200)));
    renderHistory(clientHistory);
  }

  submitBtn.addEventListener('click', async () => {
    const data = validate();
    if (!data) return;
    try {
      await send(data);
    } catch (e) {
      console.error(e);
      alert(e.message);
    }
  });
})();
