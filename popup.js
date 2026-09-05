const form = document.querySelector('#ticker-form');
const input = document.querySelector('#ticker');
const status = document.querySelector('#status');

form.addEventListener('submit', async event => {
  event.preventDefault();
  const ticker = input.value.trim().toUpperCase();
  if (!/^[A-Z0-9.-]+(?::[A-Z0-9.-]+)?$/.test(ticker)) {
    status.textContent = 'Enter a valid ticker.';
    return;
  }
  status.textContent = 'Opening…';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await openModal(tab.id, ticker);
    window.close();
  } catch {
    status.textContent = 'This page does not allow extension overlays.';
  }
});

async function openModal(tabId, ticker) {
  // A page may still host an earlier content-script session after an
  // extension reload. Reapply the current stylesheet before opening.
  await chrome.scripting.insertCSS({ target: { tabId }, files: ['styles.css'] });
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  await chrome.tabs.sendMessage(tabId, { type: 'open-financial-modal-v2', ticker });
}
