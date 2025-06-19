// Utility functions for localStorage
const STORAGE_KEY = 'ministeringbuddy_status_v1';

function loadStatus() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
        return {};
    }
}

function saveStatus(status) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(status));
}

// Helper to create icon buttons
function createIconButton(type, active, onClick) {
    const btn = document.createElement('button');
    btn.className = `mbuddy-icon mbuddy-${type}` + (active ? ' mbuddy-active' : '');
    btn.type = 'button';
    btn.tabIndex = 0;
    btn.title = {
        bishop: 'Mark as Bishop',
        nn: 'Not Now',
        star: 'Star',
        question: 'Question'
    }[type];

    // SVGs for icons
    let svg = '';
    if (type === 'bishop') {
        svg = `<svg width="20" height="20" viewBox="0 0 20 20"><path fill="${active ? '#1976d2' : '#888'}" d="M10 2l3 6h-6l3-6zm0 8a4 4 0 0 1 4 4v4H6v-4a4 4 0 0 1 4-4z"/></svg>`;
    } else if (type === 'nn') {
        svg = `<svg width="20" height="20" viewBox="0 0 20 20"><rect x="4" y="9" width="12" height="2" rx="1" fill="${active ? '#d32f2f' : '#888'}"/></svg>`;
    } else if (type === 'star') {
        svg = `<svg width="20" height="20" viewBox="0 0 20 20"><polygon points="10,2 12,7.5 18,8 13.5,12 15,18 10,14.5 5,18 6.5,12 2,8 8,7.5" fill="${active ? '#ffd600' : 'none'}" stroke="#ffd600" stroke-width="1.5"/></svg>`;
    } else if (type === 'question') {
        svg = `<svg width="20" height="20" viewBox="0 0 20 20"><text x="10" y="15" text-anchor="middle" font-size="14" font-weight="bold" fill="${active ? '#2e7d32' : '#888'}" style="font-family:sans-serif;">?</text></svg>`;
    }
    btn.innerHTML = svg;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick(btn);
    });
    return btn;
}

// Extracts name and age from a ministering row
function extractMinisteringInfo(tr) {
    const name = tr.querySelector('a')?.textContent.trim();
    // Try to find the age in the second cell
    let age = null;
    const tds = tr.querySelectorAll('td');
    if (tds.length > 1) {
        const ageDivs = tds[1].querySelectorAll('div');
        if (ageDivs.length > 1) {
            age = ageDivs[1].textContent.trim();
        }
    }
    return { name, age: age || null };
}

// Extracts name from a household row
function extractHouseholdInfo(tr) {
    const name = tr.querySelector('a')?.textContent.trim();
    return { name };
}

// Generates a unique key for a row (name + age if present)
function rowKey(info) {
    return info.age ? `${info.name}__${info.age}` : info.name;
}

// Insert custom CSS for icons and sections
function injectStyles() {
    if (document.getElementById('mbuddy-style')) return;
    const style = document.createElement('style');
    style.id = 'mbuddy-style';
    style.textContent = `
    .mbuddy-icon {
        background: none;
        border: none;
        cursor: pointer;
        margin: 0 2px;
        padding: 2px;
        vertical-align: middle;
        outline: none;
    }
    .mbuddy-icon:focus { outline: 2px solid #1976d2; }
    .mbuddy-active svg { filter: drop-shadow(0 0 2px #ffd600); }
    .mbuddy-section {
        margin-top: 1em;
        border-top: 2px solid #eee;
        padding-top: 0.5em;
    }
    .mbuddy-section-title {
        font-weight: bold;
        color: #1976d2;
        margin-bottom: 0.3em;
    }
    `;
    document.head.appendChild(style);
}

// Move a row to a section at the bottom of the table
function moveRowToSection(row, section, table) {
    if (!section.parentNode) {
        table.parentNode.appendChild(section);
    }
    section.querySelector('tbody').appendChild(row);
}

// Ensure a section exists for a table
function ensureSection(table, id, title) {
    let section = table.parentNode.querySelector(`#${id}`);
    if (!section) {
        section = document.createElement('div');
        section.className = 'mbuddy-section';
        section.id = id;
        section.innerHTML = `<div class="mbuddy-section-title">${title}</div><table><tbody></tbody></table>`;
        table.parentNode.appendChild(section);
    }
    return section;
}

// Main logic to enhance a table (ministering or households)
function enhanceTable(table, type) {
    const status = loadStatus();
    const tbody = table.querySelector('tbody');
    if (!tbody) return;

    // Section containers
    let bishopSection, nnSection;

    // For each row, add icons and move if needed
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
        let info = type === 'ministering' ? extractMinisteringInfo(tr) : extractHouseholdInfo(tr);
        if (!info.name) return;
        const key = rowKey(info);

        // Remove any previous icon cell
        let iconCell = tr.querySelector('.mbuddy-icons-cell');
        if (iconCell) iconCell.remove();

        // Insert icon cell at the end
        iconCell = document.createElement('td');
        iconCell.className = 'mbuddy-icons-cell';

        // Bishop icon (only for ministering)
        if (type === 'ministering') {
            iconCell.appendChild(createIconButton('bishop', status[key]?.bishop, btn => {
                status[key] = { ...status[key], bishop: !status[key]?.bishop, nn: false };
                saveStatus(status);
                render();
            }));
        }

        // NN icon
        iconCell.appendChild(createIconButton('nn', status[key]?.nn, btn => {
            status[key] = { ...status[key], nn: !status[key]?.nn, bishop: false };
            saveStatus(status);
            render();
        }));

        // Star icon
        iconCell.appendChild(createIconButton('star', status[key]?.star, btn => {
            status[key] = { ...status[key], star: !status[key]?.star };
            saveStatus(status);
            render();
        }));

        // Question icon
        iconCell.appendChild(createIconButton('question', status[key]?.question, btn => {
            status[key] = { ...status[key], question: !status[key]?.question };
            saveStatus(status);
            render();
        }));

        tr.appendChild(iconCell);

        // Move row to section if needed
        if (status[key]?.bishop && type === 'ministering') {
            bishopSection = bishopSection || ensureSection(table, 'mbuddy-bishops', 'Bishops');
            moveRowToSection(tr, bishopSection, table);
        } else if (status[key]?.nn) {
            nnSection = nnSection || ensureSection(table, `mbuddy-nn-${type}`, 'Not Now');
            moveRowToSection(tr, nnSection, table);
        }
    });
}

// Main render function
function render() {
    injectStyles();

    // Ministering Brothers table
    // Find the table under .sc-b78c45da-0 (Unassigned Ministering Brothers)
    const ministeringTable = document.querySelector('.sc-b78c45da-0 table');
    if (ministeringTable) {
        // Remove previous sections
        ['mbuddy-bishops', 'mbuddy-nn-ministering'].forEach(id => {
            const sec = ministeringTable.parentNode.querySelector(`#${id}`);
            if (sec) sec.remove();
        });
        enhanceTable(ministeringTable, 'ministering');
    }

    // Households table
    // Find the table under .sc-333a1eda-0 (Unassigned Households)
    const householdsTable = document.querySelector('.sc-333a1eda-0 table');
    if (householdsTable) {
        // Remove previous sections
        ['mbuddy-nn-households'].forEach(id => {
            const sec = householdsTable.parentNode.querySelector(`#${id}`);
            if (sec) sec.remove();
        });
        enhanceTable(householdsTable, 'households');
    }
}

// Wait for DOM content and tables to be present
function waitForTablesAndRender() {
    const ministeringTable = document.querySelector('.sc-b78c45da-0 table');
    const householdsTable = document.querySelector('.sc-333a1eda-0 table');
    if (ministeringTable && householdsTable) {
        render();
    } else {
        setTimeout(waitForTablesAndRender, 500);
    }
}

waitForTablesAndRender();