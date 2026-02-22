// TM Tier Overlay — Background Service Worker
// Handles Claude API calls (content scripts can't call external APIs directly in some configs)

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'CLAUDE_ADVICE') {
    handleClaudeRequest(request).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message || String(err) });
    });
    return true; // keep channel open for async response
  }
});

async function handleClaudeRequest({ apiKey, baseUrl, prompt }) {
  const url = (baseUrl || 'https://api.anthropic.com').replace(/\/$/, '') + '/v1/messages';

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system: 'Ты эксперт по Terraforming Mars (3 игрока, WGT, все дополнения). Давай короткие конкретные советы по ходу. Только ключевые приоритеты, без воды. Отвечай на русском, без Markdown заголовков — просто пронумерованный список 3-5 пунктов.',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error('API ' + resp.status + ': ' + text.slice(0, 200));
  }

  const data = await resp.json();
  const text = data.content && data.content[0] && data.content[0].text;
  if (!text) throw new Error('Пустой ответ от API');
  return { success: true, advice: text };
}
