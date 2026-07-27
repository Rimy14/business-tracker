const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'business-tracker-frontend');
const read = file => fs.readFileSync(path.join(frontend, file), 'utf8');

test('new Restaurant pages have unique element IDs and valid local assets', () => {
    for (const file of ['restaurant.html', 'owner-restaurant.html']) {
        const html = read(file);
        const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
        assert.equal(new Set(ids).size, ids.length, `${file} contains duplicate IDs`);

        for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
            const reference = match[1];
            if (/^(?:https?:|#|\/)/.test(reference)) continue;
            assert.equal(fs.existsSync(path.join(frontend, reference)), true, `${file} references missing ${reference}`);
        }
    }
});

test('Restaurant navigation is present on every existing manager and owner workspace page', () => {
    const managerPages = ['manager-dashboard.html', 'staff.html', 'income.html', 'expenses.html', 'rooms.html', 'meals.html', 'suppliers.html', 'inventory.html', 'maintenance.html', 'complaints.html'];
    const ownerPages = ['owner-dashboard.html', 'owner-staff.html', 'owner-financials.html', 'owner-rooms.html', 'owner-partners.html', 'owner-inventory.html', 'owner-maintenance.html', 'owner-complaints.html'];
    managerPages.forEach(file => assert.match(read(file), /href="restaurant\.html"/, file));
    ownerPages.forEach(file => assert.match(read(file), /owner-restaurant\.html/, file));
});

test('finance source selectors do not expose phantom Bar or Spa options', () => {
    for (const file of ['income.html', 'owner-financials.html']) {
        const html = read(file);
        assert.doesNotMatch(html, /<option[^>]+value="(?:Bar|Spa)"/i, file);
    }
});

test('currency-aware pages load the shared finance utilities', () => {
    const pages = ['income.html', 'expenses.html', 'manager-dashboard.html', 'owner-dashboard.html', 'owner-financials.html', 'rooms.html', 'owner-rooms.html', 'restaurant.html', 'owner-restaurant.html'];
    for (const file of pages) {
        const html = read(file);
        assert.match(html, /js\/finance-utils\.js/, file);
        assert.match(html, /js\/exchange-rate\.js/, file);
    }
});

test('supplier tax is present in manager persistence and owner display', () => {
    assert.match(read('suppliers.html'), /id="tax"/);
    assert.match(read('suppliers.html'), /tax:\s*document\.getElementById\('tax'\)/);
    assert.match(read('owner-partners.html'), /s\.tax/);
});

test('Restaurant persistence is hotel-scoped and uses a distinct income source', () => {
    const script = read('js/restaurant-page.js');
    assert.match(script, /where\('hotelId',\s*'==',\s*state\.hotelId\)/);
    assert.match(script, /hotelId:\s*state\.hotelId/);
    assert.match(read('js/finance-utils.js'), /source:\s*'Restaurant'/);
});

test('existing owner pages remain read-only', () => {
    const ownerPages = fs.readdirSync(frontend).filter(file => /^owner-.*\.html$/.test(file));
    const writePattern = /db\.collection\([^\n]+\)\.(?:add|doc\([^)]*\)\.(?:update|delete|set))/;
    for (const file of ownerPages) {
        assert.doesNotMatch(read(file), writePattern, `${file} contains a direct Firestore mutation`);
    }
});
