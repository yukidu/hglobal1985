// H-Global public listings: read-only, safe text rendering, no account data.
(() => {
  const host = document.getElementById('liveListings');
  if (!host) return;
  const config = {
    '最新消息': { endpoint: 'news', heading: '公開最新消息', title: 'title', description: 'summary' },
    '活動報名': { endpoint: 'events', heading: '公開活動資訊', title: 'title', description: 'summary' },
    '場地租借': { endpoint: 'venues', heading: '公開場地資訊', title: 'name', description: 'address_text' }
  };
  let requestId = 0;
  function message(text) {
    host.replaceChildren();
    const p = document.createElement('p');
    p.textContent = text;
    host.append(p);
  }

  // No innerHTML with server data. Every entry is rendered as text nodes.
  function validId(id) {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
  }
  function feedback(target, value) {
    target.replaceChildren();
    const paragraph = document.createElement('p');
    paragraph.textContent = value;
    target.append(paragraph);
  }
  function eventDetails(entry) {
    if (!validId(entry.id)) return null;
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = '查看公開場次';
    const output = document.createElement('div');
    output.setAttribute('aria-live', 'polite');
    details.append(summary, output);
    let attempted = false;
    details.addEventListener('toggle', async () => {
      if (!details.open || attempted) return;
      attempted = true;
      feedback(output, '正在讀取場次…');
      try {
        const response = await fetch('/api/v1/event-sessions?event_id=' + encodeURIComponent(entry.id));
        if (!response.ok) throw new Error('unavailable');
        const body = await response.json();
        if (!Array.isArray(body.sessions)) throw new Error('invalid_data');
        if (!details.isConnected) return;
        if (!body.sessions.length) { feedback(output, '目前尚無已公開場次。'); return; }
        output.replaceChildren();
        const list = document.createElement('ul');
        list.className = 'live-list';
        for (const session of body.sessions) {
          const item = document.createElement('li');
          const label = document.createElement('strong');
          label.textContent = String(session.title || '活動場次');
          const date = document.createElement('p');
          date.textContent = [session.starts_at, session.venue_text].filter(Boolean).join(' · ');
          item.append(label, date);
          list.append(item);
        }
        output.append(list);
      } catch { if (details.isConnected) feedback(output, '場次資料暫時無法取得，請稍後重試。'); }
    });
    return details;
  }
  function venueDetails(entry) {
    if (!validId(entry.id)) return null;
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = '查詢場地可用時段';
    const controls = document.createElement('div');
    controls.className = 'availability-controls';
    const labelFrom = document.createElement('label');
    labelFrom.textContent = '開始日期';
    const inputFrom = document.createElement('input');
    inputFrom.type = 'date';
    labelFrom.append(inputFrom);
    const labelTo = document.createElement('label');
    labelTo.textContent = '結束日期';
    const inputTo = document.createElement('input');
    inputTo.type = 'date';
    labelTo.append(inputTo);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '查詢時段';
    const output = document.createElement('div');
    output.setAttribute('aria-live', 'polite');
    controls.append(labelFrom, labelTo, button);
    details.append(summary, controls, output);
    button.addEventListener('click', async () => {
      const from = inputFrom.value, to = inputTo.value;
      if (!from || !to || from > to) {
        feedback(output, '請先選擇正確的開始與結束日期。');
        return;
      }
      const fromDate = new Date(from + 'T00:00:00Z');
      const toDate = new Date(to + 'T00:00:00Z');
      if (!Number.isFinite(fromDate.getTime()) || !Number.isFinite(toDate.getTime()) ||
          toDate - fromDate > 31 * 86400000) {
        feedback(output, '查詢範圍最多 31 天。');
        return;
      }
      button.disabled = true;
      feedback(output, '正在查詢可用時段…');
      try {
        const q = new URLSearchParams({venue_id: entry.id, from, to});
        const response = await fetch('/api/v1/venue-availability?' + q);
        if (!response.ok) throw new Error('unavailable');
        const body = await response.json();
        if (!Array.isArray(body.slots)) throw new Error('invalid_data');
        if (!details.isConnected) return;
        if (!body.slots.length) { feedback(output, '所選日期目前沒有可用時段。'); return; }
        output.replaceChildren();
        const list = document.createElement('ul');
        list.className = 'live-list';
        for (const slot of body.slots) {
          const li = document.createElement('li');
          const title = document.createElement('strong');
          title.textContent = [slot.starts_at, slot.ends_at].filter(Boolean).join(' — ');
          const fee = document.createElement('p');
          fee.textContent = Number.isFinite(slot.price_amount) ?
            '參考費用：' + String(slot.price_amount) + ' ' + String(slot.currency || '') :
            '費用請洽管理單位';
          li.append(title, fee);
          list.append(li);
        }
        output.append(list);
      } catch { if (details.isConnected) feedback(output, '可用時段暫時無法查詢，請稍後重試。'); }
      finally { button.disabled = false; }
    });
    return details;
  }

  function display(data, cfg) {
    host.replaceChildren();
    const heading = document.createElement('h3');
    heading.textContent = cfg.heading;
    host.append(heading);
    if (!data.length) {
      message('目前尚無已公開資料，請稍後再查看。');
      return;
    }
    const list = document.createElement('ul');
    list.className = 'live-list';
    for (const entry of data) {
      const li = document.createElement('li');
      const title = document.createElement('strong');
      title.textContent = String(entry[cfg.title] ?? '未命名');
      const description = document.createElement('p');
      description.textContent = String(entry[cfg.description] ?? '');
      li.append(title, description);
      if (cfg.endpoint === 'events') {
        const detail = eventDetails(entry);
        if (detail) li.append(detail);
      }
      if (cfg.endpoint === 'venues') {
        const detail = venueDetails(entry);
        if (detail) li.append(detail);
      }
      list.append(li);
    }
    host.append(list);
  }
  window.hglobalRefresh = async (major) => {
    const id = ++requestId;
    const cfg = config[major];
    host.hidden = !cfg;
    if (!cfg) return;
    message('正在載入公開資料…');
    try {
      const response = await fetch('/api/v1/' + cfg.endpoint + '?limit=20&offset=0', {
        headers: { accept: 'application/json' }
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const body = await response.json();
      if (!body || !Array.isArray(body.data)) throw new Error('Invalid response');
      if (id === requestId) display(body.data, cfg);
    } catch {
      if (id === requestId) message('公開資料暫時無法讀取，請稍後重試。');
    }
  };
  const current = document.querySelector('[data-major].active');
  if (current) window.hglobalRefresh(current.dataset.major);
})();
