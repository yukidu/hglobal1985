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
