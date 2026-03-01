/**
 * Cron ifadesini insan okunabilir formata çevirir.
 */
export function cronToHuman(cron: string): string {
    const parts = cron.split(' ');
    if (parts.length < 5) return cron;

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

    // Basit durumlar
    if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
        if (hour === '*' && minute === '*') return 'Her dakika';
        if (hour === '*') return `Her saat, dakika ${minute}`;
        return `Her gün saat ${hour}:${minute.padStart(2, '0')}`;
    }

    if (dayOfWeek !== '*' && dayOfMonth === '*') {
        const days: Record<string, string> = {
            '0': 'Pazar', '1': 'Pazartesi', '2': 'Salı',
            '3': 'Çarşamba', '4': 'Perşembe', '5': 'Cuma', '6': 'Cumartesi',
        };
        const dayName = days[dayOfWeek] || dayOfWeek;
        return `Her ${dayName} saat ${hour}:${minute.padStart(2, '0')}`;
    }

    return cron;
}

/**
 * Telegram kullanıcı adını veya ismini gösterir.
 */
export function getUserDisplayName(from: { username?: string; first_name: string; id: number }): string {
    return from.username ? `@${from.username}` : from.first_name;
}

/**
 * Tarih formatı (TR)
 */
export function formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'Z');
    return date.toLocaleString('tr-TR', {
        timeZone: 'Europe/Istanbul',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}
