(function (root, factory) {
    const api = factory(root && root.FinanceUtils);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ExchangeRateService = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (FinanceUtils) {
    const CACHE_COLLECTION = 'settings';
    const CACHE_DOCUMENT = 'exchangeRate';
    const API_URL = 'https://open.er-api.com/v6/latest/USD';
    const MAX_AGE_MS = 24 * 60 * 60 * 1000;

    function validatePayload(payload) {
        const rate = Number(payload && payload.rates && payload.rates.LKR);
        if (!payload || payload.result !== 'success' || !Number.isFinite(rate) || rate <= 0) {
            throw new Error('The exchange-rate provider returned an invalid USD/LKR rate.');
        }
        return rate;
    }

    function normalizeCachedRate(data) {
        const rate = Number(data && data.rate);
        if (!Number.isFinite(rate) || rate <= 0) return null;
        return {
            rate,
            source: data.source || 'ExchangeRate-API',
            providerUpdatedAt: data.providerUpdatedAt || null,
            fetchedAt: data.fetchedAt || null
        };
    }

    async function loadUsdToLkrRate(db, options) {
        if (!db) throw new Error('Firestore is required to load the exchange rate.');
        const settings = options || {};
        const fetchImpl = settings.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
        const now = settings.now || Date.now();
        const forceRefresh = Boolean(settings.forceRefresh);
        const cacheRef = db.collection(CACHE_COLLECTION).doc(CACHE_DOCUMENT);

        let cached = null;
        try {
            const snapshot = await cacheRef.get();
            if (snapshot.exists) cached = normalizeCachedRate(snapshot.data());
        } catch (error) {
            console.warn('Unable to read the cached exchange rate:', error);
        }

        if (!forceRefresh && cached && FinanceUtils.isRateFresh(cached.fetchedAt, now, MAX_AGE_MS)) {
            return { ...cached, stale: false, fromCache: true };
        }

        try {
            if (!fetchImpl) throw new Error('Fetch is unavailable.');
            const response = await fetchImpl(API_URL, { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`Exchange-rate request failed (${response.status}).`);
            const payload = await response.json();
            const rate = validatePayload(payload);
            const fetchedAt = new Date(FinanceUtils.timestampToMillis(now));
            const providerUpdatedAt = payload.time_last_update_unix
                ? new Date(payload.time_last_update_unix * 1000)
                : fetchedAt;

            const result = {
                rate,
                source: 'ExchangeRate-API',
                providerUpdatedAt,
                fetchedAt,
                stale: false,
                fromCache: false
            };

            try {
                await cacheRef.set({
                    baseCurrency: 'USD',
                    quoteCurrency: 'LKR',
                    rate,
                    source: result.source,
                    providerUpdatedAt,
                    fetchedAt
                }, { merge: true });
            } catch (error) {
                console.warn('Live exchange rate loaded but could not be cached:', error);
            }

            return result;
        } catch (error) {
            if (cached) return { ...cached, stale: true, fromCache: true, error: error.message };
            throw error;
        }
    }

    function describeRate(result) {
        if (!result) return 'Exchange rate unavailable';
        const timestamp = FinanceUtils.timestampToMillis(result.providerUpdatedAt || result.fetchedAt);
        const updated = timestamp ? new Date(timestamp).toLocaleString() : 'unknown time';
        return `1 USD = ${Number(result.rate).toLocaleString(undefined, { maximumFractionDigits: 4 })} LKR · Updated ${updated}${result.stale ? ' · Cached rate (may be stale)' : ''}`;
    }

    return {
        API_URL,
        MAX_AGE_MS,
        validatePayload,
        normalizeCachedRate,
        loadUsdToLkrRate,
        describeRate
    };
});
