// Development only: loaded by the background worker in bridge builds, and absent from store builds.
// Connects to tools/bridge-server.mjs on localhost and relays commands to the page.
import { browser } from 'wxt/browser';

const SERVER = 'ws://127.0.0.1:8765';
const PAGES = ['https://lcr.churchofjesuschrist.org/*', 'http://127.0.0.1:8766/*'];
const KEEPALIVE_MS = 20_000;

let socket: WebSocket | undefined;

async function targetTab(): Promise<number | undefined> {
  const tabs = await browser.tabs.query({ url: PAGES });
  return (tabs.find((tab) => tab.active) ?? tabs[0])?.id;
}

async function handle(request: { command: string; [key: string]: unknown }): Promise<unknown> {
  if (request.command === 'reload') {
    setTimeout(() => browser.runtime.reload(), 100);
    return { ok: true, output: 'reloading' };
  }
  const tabId = await targetTab();
  if (tabId === undefined) return { ok: false, error: 'No LCR tab is open.' };
  if (request.command === 'reload-page') {
    await browser.tabs.reload(tabId);
    return { ok: true, output: 'page reloading' };
  }
  try {
    return await browser.tabs.sendMessage(tabId, request);
  } catch {
    return { ok: false, error: 'The page did not answer. Reload the tab.' };
  }
}

function connect(): void {
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  socket = new WebSocket(SERVER);
  const keepalive = setInterval(() => socket?.readyState === WebSocket.OPEN && socket.send('{"ping":true}'), KEEPALIVE_MS);
  socket.onmessage = async (event) => {
    const { id, request } = JSON.parse(String(event.data));
    socket?.send(JSON.stringify({ id, result: await handle(request) }));
  };
  socket.onclose = () => {
    clearInterval(keepalive);
    socket = undefined;
    setTimeout(connect, 2000);
  };
}

export function startBridge(): void {
  browser.alarms.create('bridge-reconnect', { periodInMinutes: 0.5 });
  browser.alarms.onAlarm.addListener(connect);
  connect();
}
