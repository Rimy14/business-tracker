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

test('Restaurant views use the established manager and owner workspace shells', () => {
    const css = fs.readFileSync(path.join(frontend, 'css', 'restaurant.css'), 'utf8');
    assert.match(read('restaurant.html'), /body data-mode="manager"/);
    assert.match(read('restaurant.html'), /class="profile-chip"/);
    assert.match(read('owner-restaurant.html'), /class="navbar"/);
    assert.match(read('owner-restaurant.html'), /class="nav-item back-btn"/);
    assert.match(read('owner-restaurant.html'), /class="page-heading animated-element delay-1"/);
    assert.match(read('owner-restaurant.html'), /class="toolbar animated-element delay-2"/);
    assert.match(css, /--color-canvas:\s*#dfe5f3/);
    assert.match(css, /--font-owner:\s*-apple-system/);
    assert.match(css, /body\[data-mode="manager"\]\s+header/);
    assert.match(css, /body\[data-mode="owner"\]\s+\{[\s\S]*background:\s*linear-gradient/);
    assert.match(css, /@keyframes premiumFadeUp/);
    assert.match(css, /body\[data-mode="owner"\]\s+\.animated-element/);
    assert.match(css, /@media \(max-width: 480px\)[\s\S]*body\[data-mode="owner"\]\s+\{ --sb-w: 64px; \}/);
    assert.match(css, /body\[data-mode="owner"\]\s+select\s*\{[\s\S]*color-scheme:\s*dark/);
    assert.match(css, /body\[data-mode="owner"\]\s+select\s+option\s*\{[\s\S]*color:\s*#f4f4f4[\s\S]*background:\s*#22242c/);
});

test('dashboard exchange controls use the responsive currency component', () => {
    for (const file of ['manager-dashboard.html', 'owner-dashboard.html']) {
        const html = read(file);
        assert.match(html, /class="dashboard-exchange-tools"/, file);
        assert.match(html, /class="exchange-rate-text"/, file);
        assert.match(html, /class="currency-control"/, file);
        assert.match(html, /class="currency-select"/, file);
        assert.match(html, /\.currency-select\s*\{[\s\S]*color-scheme:\s*dark/, file);
        assert.match(html, /\.currency-select\s+option\s*\{[\s\S]*color:\s*#f4f4f4[\s\S]*background:\s*#22242c/, file);
    }
    assert.match(read('owner-dashboard.html'), /@media \(max-width: 480px\)[\s\S]*--sb-w: 64px/);
});

test('manager workspace forms share the same responsive content grid', () => {
    const managerPages = ['meals.html', 'rooms.html', 'staff.html', 'inventory.html', 'suppliers.html', 'expenses.html', 'income.html'];
    managerPages.forEach(file => {
        const html = read(file);
        assert.match(html, /\.cinematic-environment-container\s*\{[\s\S]*max-width:\s*none\s*!important;[\s\S]*width:\s*calc\(min\(1440px,\s*calc\(100vw\s*-\s*var\(--sb-w\)\)\)\s*-\s*12%\)\s*!important;/, file);
        assert.match(html, /\.cinematic-environment-container\s*\{\s*margin:\s*20px auto 30px !important;/, file);
    });
    for (const file of ['meals.html', 'rooms.html']) {
        assert.match(read(file), /\.dashboard-telemetry-section\s*>\s*\.cinematic-environment-container\s*\{\s*width:\s*100%\s*!important;/, file);
    }
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

test('manager Restaurant suggestions are linked to hotel reference data without removing free entry', () => {
    const html = read('restaurant.html');
    const js = read('js/restaurant-page.js');
    assert.match(html, /id="customerName"[^>]+list="restaurantGuestOptions"/);
    assert.match(html, /id="roomNumber"[^>]+list="restaurantRoomOptions"/);
    assert.match(html, /id="restaurantGuestOptions"/);
    assert.match(html, /id="restaurantRoomOptions"/);
    assert.match(html, /id="restaurantItemOptions"/);
    assert.match(js, /collection\('rooms'\)\.where\('hotelId', '==', state\.hotelId\)/);
    assert.match(js, /collection\('bookings'\)\.where\('hotelId', '==', state\.hotelId\)/);
    assert.match(js, /collection\('packages'\)\.where\('hotelId', '==', state\.hotelId\)/);
    assert.match(js, /collection\('buffetItems'\)\.where\('hotelId', '==', state\.hotelId\)/);
    assert.match(js, /list="restaurantItemOptions"/);
});

test('existing owner pages remain read-only', () => {
    const ownerPages = fs.readdirSync(frontend).filter(file => /^owner-.*\.html$/.test(file));
    const writePattern = /db\.collection\([^\n]+\)\.(?:add|doc\([^)]*\)\.(?:update|delete|set))/;
    for (const file of ownerPages) {
        assert.doesNotMatch(read(file), writePattern, `${file} contains a direct Firestore mutation`);
    }
});

test('finance views escape stored descriptions before inserting HTML', () => {
    for (const file of ['income.html', 'expenses.html', 'owner-financials.html']) {
        const html = read(file);
        assert.match(html, /FinanceUtils\.escapeHtml\(/, file);
    }
    assert.doesNotMatch(read('income.html'), /<div>\$\{item\.description \|\| '-'/);
    assert.doesNotMatch(read('owner-financials.html'), /<td>\$\{item\.description \|\| '-'/);
});

test('booking income writes are deterministic, batched, awaited, and metadata-complete', () => {
    const rooms = read('rooms.html');
    assert.match(rooms, /FinanceUtils\.bookingIncomeDocumentId\(/);
    assert.match(rooms, /FinanceUtils\.buildBookingIncome\(/);
    assert.match(rooms, /await batch\.commit\(\)/);
    assert.doesNotMatch(rooms, /collection\('income'\)\.add\(/);
    assert.doesNotMatch(rooms, /forEach\(async/);
    assert.doesNotMatch(rooms, /oldBooking\.totalAmount !== newTotalAmount/);
});

test('currency-aware pages mark unavailable conversion instead of re-labelling raw values', () => {
    const pages = ['income.html', 'expenses.html', 'manager-dashboard.html', 'owner-dashboard.html', 'owner-financials.html', 'rooms.html', 'owner-rooms.html'];
    for (const file of pages) assert.match(read(file), /convertAmountOrUnavailable/, file);
    assert.match(read('js/restaurant-page.js'), /convertAmountOrUnavailable/);
});
