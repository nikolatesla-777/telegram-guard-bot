const API_KEY_STORAGE_KEY = 'oc-dashboard-api-key';

export function getStoredApiKey(): string {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || '';
}

export function setStoredApiKey(key: string): void {
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
}

export function clearApiKey(): void {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
}

async function apiFetch(path: string, options: RequestInit = {}): Promise<any> {
    const apiKey = getStoredApiKey();
    const res = await fetch(`/api${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            ...options.headers,
        },
    });

    if (res.status === 401) {
        clearApiKey();
        window.location.reload();
        throw new Error('Yetkisiz erişim');
    }

    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Bir hata oluştu');
        }
        return data;
    } else {
        const text = await res.text();
        if (!res.ok) {
            throw new Error(`API Hatası (${res.status}): ${text}`);
        }
        // Eğer OK ise ama JSON değilse (örn empty body), boş obje dön
        return {};
    }
}

// ═══ Posts ═══
export const postsApi = {
    send: async (message: string, image?: File | null, buttons?: { text: string; url: string }[], parseMode?: string) => {
        const apiKey = getStoredApiKey();
        const formData = new FormData();
        if (message) formData.append('message', message);
        if (parseMode) formData.append('parseMode', parseMode);
        if (image) formData.append('image', image);
        if (buttons && buttons.length > 0) formData.append('buttons', JSON.stringify(buttons));

        const res = await fetch('/api/posts/send', {
            method: 'POST',
            headers: { 'x-api-key': apiKey },
            body: formData,
        });

        if (res.status === 401) {
            clearApiKey();
            window.location.reload();
            throw new Error('Yetkisiz erişim');
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Bir hata oluştu');
        return data;
    },

    schedule: async (message: string, cronExpression: string, image?: File | null, buttons?: { text: string; url: string }[], chatId?: string, mediaFileId?: string) => {
        const apiKey = getStoredApiKey();
        const formData = new FormData();
        if (message) formData.append('message', message);
        formData.append('cronExpression', cronExpression);
        if (chatId) formData.append('chatId', chatId);
        if (mediaFileId) formData.append('mediaFileId', mediaFileId);
        if (image) formData.append('image', image);
        if (buttons && buttons.length > 0) formData.append('buttons', JSON.stringify(buttons));

        const res = await fetch('/api/posts/schedule', {
            method: 'POST',
            headers: { 'x-api-key': apiKey },
            body: formData,
        });

        if (res.status === 401) {
            clearApiKey();
            window.location.reload();
            throw new Error('Yetkisiz erişim');
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Bir hata oluştu');
        return data;
    },

    listScheduled: () => apiFetch('/posts/scheduled'),

    deleteScheduled: (id: number) =>
        apiFetch(`/posts/scheduled/${id}`, { method: 'DELETE' }),
};

// ═══ Triggers ═══
export const triggersApi = {
    list: () => apiFetch('/triggers'),

    add: (triggerWord: string, response: string, chatId?: string) =>
        apiFetch('/triggers', {
            method: 'POST',
            body: JSON.stringify({ triggerWord, response, chatId }),
        }),

    remove: (chatId: string, word: string) =>
        apiFetch(`/triggers/${chatId}/${encodeURIComponent(word)}`, { method: 'DELETE' }),
};

// ═══ Stats ═══
export const statsApi = {
    get: () => apiFetch('/stats'),
};

// ═══ Channel ═══
export const channelApi = {
    listPosts: () => apiFetch('/channel/posts'),

    listGroups: () => apiFetch('/channel/groups'),

    forward: (messageId: number, groupIds: string[]) =>
        apiFetch('/channel/forward', {
            method: 'POST',
            body: JSON.stringify({ messageId, groupIds }),
        }),

    addGroup: (chatId: string, title: string) =>
        apiFetch('/channel/groups', {
            method: 'POST',
            body: JSON.stringify({ chatId, title }),
        }),

    deleteGroup: (chatId: string) =>
        apiFetch(`/channel/groups/${encodeURIComponent(chatId)}`, { method: 'DELETE' }),

    fetchHistory: (maxId: number = 500) =>
        apiFetch('/channel/fetch-history', {
            method: 'POST',
            body: JSON.stringify({ maxId }),
        }),

    listAutoForward: () => apiFetch('/channel/auto-forward'),

    toggleAutoForward: (targetChatId: string, enable: boolean) =>
        apiFetch('/channel/auto-forward', {
            method: 'POST',
            body: JSON.stringify({ targetChatId, enable }),
        }),
};

// ═══ Spam ═══
export const spamApi = {
    get: (chatId?: string) => {
        const url = chatId ? `/spam?chatId=${chatId}` : '/spam';
        return apiFetch(url);
    },
    update: (config: any) =>
        apiFetch('/spam', {
            method: 'POST',
            body: JSON.stringify(config),
        }),
};
