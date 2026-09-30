// Lightweight in-memory request accounting for the WebUI dashboard.
// Deliberately not persisted: the gateway is a local process and its counters
// reset with it, which is what an operator expects from a restart.

const startedAt = Date.now();

const state = {
    requests: 0,
    errors: 0,
    unauthorized: 0,
    byStatus: Object.create(null),
    byPath: Object.create(null),
    latency: { count: 0, totalMs: 0, maxMs: 0 },
    completions: { chatStream: 0, chatNonStream: 0, responses: 0 },
    resetAt: startedAt
};

export function recordRequest({ path: pathname, status, durationMs }) {
    state.requests += 1;
    const bucket = Math.floor(status / 100);
    state.byStatus[bucket] = (state.byStatus[bucket] || 0) + 1;
    if (status >= 400) state.errors += 1;
    if (status === 401) state.unauthorized += 1;
    state.byPath[pathname] = (state.byPath[pathname] || 0) + 1;

    if (Number.isFinite(durationMs)) {
        state.latency.count += 1;
        state.latency.totalMs += durationMs;
        if (durationMs > state.latency.maxMs) state.latency.maxMs = durationMs;
    }
}

// The chat/responses handlers know whether the request was streamed, which the
// response-finish middleware cannot see, so they report the breakdown themselves.
export function recordCompletion(kind) {
    if (kind === 'chat-stream') state.completions.chatStream += 1;
    else if (kind === 'chat') state.completions.chatNonStream += 1;
    else if (kind === 'responses') state.completions.responses += 1;
}

export function snapshotStats() {
    const avgMs = state.latency.count ? Math.round(state.latency.totalMs / state.latency.count) : 0;
    return {
        startedAt,
        resetAt: state.resetAt,
        uptimeMs: Date.now() - startedAt,
        requests: state.requests,
        errors: state.errors,
        unauthorized: state.unauthorized,
        errorRate: state.requests ? Number((state.errors / state.requests).toFixed(4)) : 0,
        byStatus: { ...state.byStatus },
        byPath: { ...state.byPath },
        completions: { ...state.completions },
        latency: { avgMs, maxMs: state.latency.maxMs, samples: state.latency.count }
    };
}

export function resetStats() {
    state.requests = 0;
    state.errors = 0;
    state.unauthorized = 0;
    state.byStatus = Object.create(null);
    state.byPath = Object.create(null);
    state.latency = { count: 0, totalMs: 0, maxMs: 0 };
    state.completions = { chatStream: 0, chatNonStream: 0, responses: 0 };
    state.resetAt = Date.now();
}
