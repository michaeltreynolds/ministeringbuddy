// The categories panel shown on LCR's Proposed Assignments page. It reads LCR and saves choices to the cloud.
// It never writes to LCR.
import { computeRows, groupRows, manualCategories, type Choice, type Kind, type Row } from '../categories';
import type { MinisteringData } from '../lcr/ministeringData';

export interface PanelStore {
  loadData(): Promise<MinisteringData>;
  loadChoices(): Promise<Choice[]>;
  saveChoice(kind: Kind, personUuid: string, category: string | null): Promise<void>;
}

// Long enough for a first-time Google consent prompt.
const CLOUD_TIMEOUT_MS = 60_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('the cloud did not answer in time')), ms)),
  ]);
}

const TABS: { kind: Kind; label: string }[] = [
  { kind: 'brother', label: 'Brothers' },
  { kind: 'household', label: 'Households' },
  { kind: 'companionship', label: 'Companionships' },
];

const STYLE = `
  :host { all: initial; }
  .toggle { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; font: 600 14px system-ui, sans-serif;
    background: #1d4f91; color: #fff; border: 0; border-radius: 20px; padding: 10px 16px; cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,.25); }
  .panel { position: fixed; top: 64px; right: 16px; bottom: 64px; width: 380px; z-index: 2147483646;
    display: flex; flex-direction: column; background: #fff; color: #1f2328; border: 1px solid #d0d7de;
    border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.2); font: 14px system-ui, sans-serif; }
  .panel[hidden] { display: none; }
  header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #d0d7de; }
  header h2 { margin: 0; font-size: 15px; flex: 1; }
  header button { border: 0; background: none; cursor: pointer; font-size: 16px; }
  nav { display: flex; border-bottom: 1px solid #d0d7de; }
  nav button { flex: 1; padding: 8px 4px; border: 0; background: none; cursor: pointer; font: inherit;
    border-bottom: 2px solid transparent; }
  nav button[aria-selected="true"] { border-bottom-color: #1d4f91; font-weight: 600; }
  .body { overflow-y: auto; padding: 4px 12px 12px; flex: 1; }
  .status { padding: 6px 12px; font-size: 12px; color: #57606a; border-top: 1px solid #d0d7de; }
  .status.error { color: #b42318; }
  details { margin-top: 8px; }
  summary { cursor: pointer; font-weight: 600; padding: 4px 0; }
  summary .count { font-weight: 400; color: #57606a; }
  .row { display: flex; align-items: center; gap: 6px; padding: 3px 0 3px 8px; }
  .name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .icons { display: flex; gap: 2px; }
  .icons button { border: 1px solid transparent; background: none; border-radius: 6px; cursor: pointer;
    font-size: 15px; line-height: 1; padding: 3px; opacity: .35; }
  .icons button:hover { opacity: .8; border-color: #d0d7de; }
  .icons button[aria-pressed="true"] { opacity: 1; border-color: #1d4f91; background: #eaf1fb; }
  .icons button:disabled { cursor: default; }
  .legend { font-size: 12px; color: #57606a; padding: 6px 0 2px; }
`;

export function mountPanel(store: PanelStore, host: HTMLElement = document.body): { refresh(): Promise<void> } {
  const root = document.createElement('div');
  root.id = 'ministering-buddy-panel';
  const shadow = root.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${STYLE}</style>
    <button class="toggle" type="button">Categories</button>
    <section class="panel" hidden aria-label="Ministering categories">
      <header><h2>Ministering categories</h2>
        <button class="refresh" type="button" title="Reload from LCR">⟳</button>
        <button class="close" type="button" title="Close">✕</button></header>
      <nav>${TABS.map((tab) => `<button type="button" data-kind="${tab.kind}">${tab.label}</button>`).join('')}</nav>
      <div class="body"></div>
      <div class="status"></div>
    </section>`;
  host.appendChild(root);

  const panel = shadow.querySelector<HTMLElement>('.panel')!;
  const body = shadow.querySelector<HTMLElement>('.body')!;
  const status = shadow.querySelector<HTMLElement>('.status')!;
  let kind: Kind = 'brother';
  let data: MinisteringData | undefined;
  let choices: Choice[] = [];
  let cloudError = '';

  const setStatus = (text: string, isError = false) => {
    status.textContent = text;
    status.classList.toggle('error', isError);
  };

  function rowElement(row: Row): HTMLElement {
    const element = document.createElement('div');
    element.className = 'row';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = row.label;
    name.title = row.label;
    const icons = document.createElement('span');
    icons.className = 'icons';
    // Rows LCR settles, such as "Has an assignment", take no choice.
    const settledByLcr = row.category.source === 'lcr' && !row.category.needsDecision;
    for (const category of settledByLcr ? [] : manualCategories(row.kind)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = category.icon;
      button.title = category.label;
      button.setAttribute('aria-pressed', String(row.choice === category.id));
      button.disabled = !!cloudError;
      button.addEventListener('click', () => choose(row, row.choice === category.id ? null : category.id));
      icons.appendChild(button);
    }
    element.append(name, icons);
    return element;
  }

  function render() {
    for (const button of shadow.querySelectorAll<HTMLButtonElement>('nav button')) {
      button.setAttribute('aria-selected', String(button.dataset.kind === kind));
    }
    body.replaceChildren();
    if (!data) return;
    const legend = document.createElement('div');
    legend.className = 'legend';
    legend.textContent = manualCategories(kind).map((category) => `${category.icon} ${category.label}`).join('   ');
    body.appendChild(legend);
    for (const group of groupRows(kind, computeRows(data, choices)[kind])) {
      const details = document.createElement('details');
      details.open = !!group.category.needsDecision;
      const summary = document.createElement('summary');
      summary.innerHTML = `${group.category.icon} ${group.category.label} <span class="count">(${group.rows.length})</span>`;
      details.appendChild(summary);
      for (const row of group.rows) details.appendChild(rowElement(row));
      body.appendChild(details);
    }
  }

  async function choose(row: Row, category: string | null) {
    const previous = choices;
    choices = choices.filter((choice) => !(choice.kind === row.kind && choice.personUuid === row.personUuid));
    if (category) choices.push({ kind: row.kind, personUuid: row.personUuid, category, since: new Date().toISOString() });
    render();
    try {
      await store.saveChoice(row.kind, row.personUuid, category);
      setStatus('Saved.');
    } catch (error) {
      choices = previous;
      render();
      setStatus(`Not saved: ${error instanceof Error ? error.message : 'unknown error'}`, true);
    }
  }

  async function refresh() {
    setStatus('Loading…');
    try {
      data = await store.loadData();
    } catch (error) {
      setStatus(`Couldn't read LCR: ${error instanceof Error ? error.message : 'unknown error'}`, true);
      return;
    }
    // Show LCR's data right away; saved categories follow. Icons stay off until they arrive,
    // so a click can't be lost by being overwritten.
    cloudError = 'still loading saved categories';
    render();
    setStatus('Loading saved categories…');
    try {
      choices = await withTimeout(store.loadChoices(), CLOUD_TIMEOUT_MS);
      cloudError = '';
    } catch (error) {
      cloudError = error instanceof Error ? error.message : 'unknown error';
    }
    render();
    if (cloudError) setStatus(`Cloud unavailable, so categories can't be saved: ${cloudError}`, true);
    else setStatus(`${data.brothers.length} brothers, ${data.households.length} households. Saved categories: ${choices.length}.`);
  }

  shadow.querySelector('.toggle')!.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden && !data) void refresh();
  });
  shadow.querySelector('.close')!.addEventListener('click', () => (panel.hidden = true));
  shadow.querySelector('.refresh')!.addEventListener('click', () => void refresh());
  for (const button of shadow.querySelectorAll<HTMLButtonElement>('nav button')) {
    button.addEventListener('click', () => {
      kind = button.dataset.kind as Kind;
      render();
    });
  }
  return { refresh };
}
