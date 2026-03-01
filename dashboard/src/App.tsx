import { useState, useEffect, useCallback } from 'react';
import { getStoredApiKey, setStoredApiKey, clearApiKey, postsApi, triggersApi, statsApi, channelApi, spamApi } from './api';

type Page = 'send' | 'scheduled' | 'channel' | 'triggers' | 'stats' | 'spam';

interface Toast {
    message: string;
    type: 'success' | 'error';
}

function App() {
    const [apiKey, setApiKey] = useState(getStoredApiKey());
    const [isLoggedIn, setIsLoggedIn] = useState(!!getStoredApiKey());
    const [currentPage, setCurrentPage] = useState<Page>('send');
    const [toast, setToast] = useState<Toast | null>(null);

    const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    }, []);

    const handleLogin = () => {
        if (!apiKey.trim()) return;
        setStoredApiKey(apiKey.trim());
        setIsLoggedIn(true);
    };

    const handleLogout = () => {
        clearApiKey();
        setIsLoggedIn(false);
        setApiKey('');
    };

    if (!isLoggedIn) {
        return (
            <div className="login-container">
                <div className="login-card">
                    <div className="sidebar-logo-icon">⚽</div>
                    <h2>Oran Cerrahı</h2>
                    <p>Admin Dashboard'a giriş yapın</p>
                    <input
                        type="password"
                        className="form-input"
                        placeholder="API Anahtarı"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    />
                    <button className="btn btn-primary" onClick={handleLogin}>
                        🔐 Giriş Yap
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} onLogout={handleLogout} />
            <main className="main-content">
                {currentPage === 'send' && <SendPostPage showToast={showToast} />}
                {currentPage === 'scheduled' && <ScheduledPostsPage showToast={showToast} />}
                {currentPage === 'channel' && <ChannelPostsPage showToast={showToast} />}
                {currentPage === 'triggers' && <TriggersPage showToast={showToast} />}
                {currentPage === 'stats' && <StatsPage />}
                {currentPage === 'spam' && <SpamConfigPage showToast={showToast} />}
            </main>
            {toast && (
                <div className={`toast toast-${toast.type}`}>
                    {toast.type === 'success' ? '✅' : '❌'} {toast.message}
                </div>
            )}
        </>
    );
}

// ═══════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════
function Sidebar({ currentPage, onNavigate, onLogout }: {
    currentPage: Page;
    onNavigate: (page: Page) => void;
    onLogout: () => void;
}) {
    const navItems: { page: Page; icon: string; label: string }[] = [
        { page: 'send', icon: '📤', label: 'Gönderi Yayınla' },
        { page: 'scheduled', icon: '📅', label: 'Zamanlanmış' },
        { page: 'channel', icon: '📢', label: 'Kanal Gönderileri' },
        { page: 'triggers', icon: '🔑', label: 'Trigger\'lar' },
        { page: 'spam', icon: '🛡️', label: 'Spam Koruması' },
        { page: 'stats', icon: '📊', label: 'İstatistikler' },
    ];

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="sidebar-logo-icon">⚽</div>
                <div>
                    <h1>Oran Cerrahı</h1>
                    <span>Admin Panel</span>
                </div>
            </div>

            {navItems.map(({ page, icon, label }) => (
                <button
                    key={page}
                    className={`nav-item ${currentPage === page ? 'active' : ''}`}
                    onClick={() => onNavigate(page)}
                >
                    <span className="icon">{icon}</span>
                    {label}
                </button>
            ))}

            <div className="sidebar-footer">
                <button className="nav-item" style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    <span className="status-dot"></span>
                    Bot çalışıyor
                </button>
                <button className="nav-item" onClick={onLogout}>
                    <span className="icon">🚪</span>
                    Çıkış Yap
                </button>
            </div>
        </aside>
    );
}

// ═══════════════════════════════════════════
// SEND POST PAGE
// ═══════════════════════════════════════════
interface ButtonLink {
    text: string;
    url: string;
}

function SendPostPage({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
    const [message, setMessage] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [buttons, setButtons] = useState<ButtonLink[]>([]);
    const [sending, setSending] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [scheduleMode, setScheduleMode] = useState(false);
    const [cronExpression, setCronExpression] = useState('');

    const handleImageSelect = (file: File) => {
        if (!file.type.startsWith('image/')) {
            showToast('Sadece resim dosyaları kabul edilir', 'error');
            return;
        }
        setImage(file);
        const reader = new FileReader();
        reader.onload = (e) => setImagePreview(e.target?.result as string);
        reader.readAsDataURL(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleImageSelect(file);
    };

    const removeImage = () => {
        setImage(null);
        setImagePreview(null);
    };

    const addButton = () => {
        setButtons([...buttons, { text: '', url: '' }]);
    };

    const updateButton = (index: number, field: 'text' | 'url', value: string) => {
        const updated = [...buttons];
        updated[index][field] = value;
        setButtons(updated);
    };

    const removeButton = (index: number) => {
        setButtons(buttons.filter((_, i) => i !== index));
    };

    const resetForm = () => {
        setMessage('');
        removeImage();
        setButtons([]);
        setCronExpression('');
    };

    const handleSend = async () => {
        if (!message.trim() && !image) return;
        setSending(true);
        try {
            const validButtons = buttons.filter(b => b.text.trim() && b.url.trim());

            if (scheduleMode) {
                if (!cronExpression.trim()) {
                    showToast('Cron ifadesi gerekli', 'error');
                    setSending(false);
                    return;
                }
                await postsApi.schedule(message, cronExpression, image, validButtons);
                showToast('Gönderi zamanlandı! 📅');
            } else {
                await postsApi.send(message, image, validButtons);
                showToast('Gönderi kanala gönderildi! 🚀');
            }
            resetForm();
        } catch (err: any) {
            showToast(err.message || 'Gönderi gönderilemedi', 'error');
        } finally {
            setSending(false);
        }
    };

    const canSubmit = (message.trim() || image) && (!scheduleMode || cronExpression.trim());

    return (
        <>
            <div className="page-header">
                <h2>📤 Gönderi Yayınla</h2>
                <p>Kanala görsel, metin ve butonlu link gönderin — hemen veya zamanlanmış</p>
            </div>

            {/* GÖRSEL YÜKLEME */}
            <div className="card">
                <div className="card-header">
                    <h3>🖼️ Görsel</h3>
                    {image && (
                        <button className="btn btn-danger btn-sm" onClick={removeImage}>
                            ✕ Kaldır
                        </button>
                    )}
                </div>

                {imagePreview ? (
                    <div className="image-preview">
                        <img src={imagePreview} alt="Önizleme" />
                    </div>
                ) : (
                    <div
                        className={`drop-zone ${dragOver ? 'drop-zone-active' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => document.getElementById('file-input')?.click()}
                    >
                        <div className="drop-zone-icon">📷</div>
                        <p>Görseli sürükle & bırak veya <strong>tıkla</strong></p>
                        <p className="form-help">PNG, JPG, WEBP — Maks 10MB</p>
                    </div>
                )}
                <input
                    id="file-input"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageSelect(file);
                        e.target.value = '';
                    }}
                />
            </div>

            {/* MESAJ */}
            <div className="card">
                <div className="card-header">
                    <h3>✍️ Mesaj İçeriği</h3>
                </div>
                <div className="form-group">
                    <textarea
                        className="form-textarea"
                        placeholder={"Mesajınızı buraya yazın...\n\n*Kalın* _İtalik_ `Kod`\n[Link](https://ornek.com)"}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                    />
                    <p className="form-help">Markdown: *kalın*, _italik_, `kod`, [link](url)</p>
                </div>

                {message && (
                    <div className="form-group">
                        <label className="form-label">Önizleme</label>
                        <div className="preview-box">{message}</div>
                    </div>
                )}
            </div>

            {/* BUTONLU LİNKLER */}
            <div className="card">
                <div className="card-header">
                    <h3>🔗 Butonlu Linkler</h3>
                    <button className="btn btn-secondary btn-sm" onClick={addButton}>
                        ➕ Buton Ekle
                    </button>
                </div>

                {buttons.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        Gönderi altına tıklanabilir buton eklemek için "Buton Ekle"ye tıklayın
                    </p>
                ) : (
                    buttons.map((btn, idx) => (
                        <div key={idx} className="button-row">
                            <input
                                type="text"
                                className="form-input"
                                placeholder="✅ YATIRIM YAP ✅"
                                value={btn.text}
                                onChange={(e) => updateButton(idx, 'text', e.target.value)}
                            />
                            <input
                                type="text"
                                className="form-input"
                                placeholder="https://example.com"
                                value={btn.url}
                                onChange={(e) => updateButton(idx, 'url', e.target.value)}
                            />
                            <button className="btn btn-danger btn-sm" onClick={() => removeButton(idx)}>✕</button>
                        </div>
                    ))
                )}
            </div>

            {/* ZAMANLAMA SEÇENEĞİ */}
            <div className="card">
                <div className="card-header">
                    <h3>⏰ Gönderim Zamanı</h3>
                </div>
                <div className="schedule-toggle">
                    <button
                        className={`schedule-toggle-btn ${!scheduleMode ? 'active' : ''}`}
                        onClick={() => setScheduleMode(false)}
                    >
                        🚀 Hemen Gönder
                    </button>
                    <button
                        className={`schedule-toggle-btn ${scheduleMode ? 'active' : ''}`}
                        onClick={() => setScheduleMode(true)}
                    >
                        📅 Zamanla
                    </button>
                </div>

                {scheduleMode && (
                    <div className="form-group" style={{ marginTop: 16 }}>
                        <label className="form-label">Cron İfadesi</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="0 9 * * *"
                            value={cronExpression}
                            onChange={(e) => setCronExpression(e.target.value)}
                        />
                        <p className="form-help">
                            Örnekler: <code>0 9 * * *</code> (her gün 09:00) · <code>0 9,18 * * *</code> (09:00 ve 18:00) · <code>30 10 * * 1</code> (Pzt 10:30)
                        </p>
                    </div>
                )}
            </div>

            {/* GÖNDER / ZAMANLA */}
            <div className="btn-group" style={{ marginBottom: 40 }}>
                <button
                    className="btn btn-primary"
                    onClick={handleSend}
                    disabled={sending || !canSubmit}
                >
                    {sending
                        ? (scheduleMode ? '⏳ Zamanlanıyor...' : '⏳ Gönderiliyor...')
                        : (scheduleMode ? '📅 Zamanla' : '🚀 Hemen Gönder')
                    }
                </button>
                {(message || image || buttons.length > 0 || cronExpression) && (
                    <button className="btn btn-secondary" onClick={resetForm}>
                        🗑️ Temizle
                    </button>
                )}
            </div>
        </>
    );
}

// ═══════════════════════════════════════════
// SCHEDULED POSTS PAGE
// ═══════════════════════════════════════════
function ScheduledPostsPage({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
    const [posts, setPosts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [cronExpression, setCronExpression] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [buttons, setButtons] = useState<ButtonLink[]>([]);
    const [scheduling, setScheduling] = useState(false);
    const [dragOver, setDragOver] = useState(false);

    const loadPosts = useCallback(async () => {
        try {
            const data = await postsApi.listScheduled();
            setPosts(data.posts || []);
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { loadPosts(); }, [loadPosts]);

    const handleImageSelect = (file: File) => {
        if (!file.type.startsWith('image/')) {
            showToast('Sadece resim dosyaları kabul edilir', 'error');
            return;
        }
        setImage(file);
        const reader = new FileReader();
        reader.onload = (e) => setImagePreview(e.target?.result as string);
        reader.readAsDataURL(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleImageSelect(file);
    };

    const removeImage = () => { setImage(null); setImagePreview(null); };

    const addButton = () => setButtons([...buttons, { text: '', url: '' }]);

    const updateButton = (index: number, field: 'text' | 'url', value: string) => {
        const updated = [...buttons];
        updated[index][field] = value;
        setButtons(updated);
    };

    const removeButton = (index: number) => setButtons(buttons.filter((_, i) => i !== index));

    const resetForm = () => {
        setMessage('');
        setCronExpression('');
        removeImage();
        setButtons([]);
    };

    const handleSchedule = async () => {
        if ((!message.trim() && !image) || !cronExpression.trim()) return;
        setScheduling(true);
        try {
            const validButtons = buttons.filter(b => b.text.trim() && b.url.trim());
            await postsApi.schedule(message, cronExpression, image, validButtons);
            showToast('Gönderi zamanlandı!');
            resetForm();
            loadPosts();
        } catch (err: any) {
            showToast(err.message || 'Zamanlama hatası', 'error');
        } finally {
            setScheduling(false);
        }
    };

    const handleDelete = async (id: number) => {
        try {
            await postsApi.deleteScheduled(id);
            showToast(`Gönderi #${id} silindi`);
            loadPosts();
        } catch (err: any) {
            showToast(err.message, 'error');
        }
    };

    return (
        <>
            <div className="page-header">
                <h2>📅 Zamanlanmış Gönderiler</h2>
                <p>Otomatik olarak belirlenen zamanlarda görsel+metin+buton gönderilecek</p>
            </div>

            {/* CRON */}
            <div className="card">
                <div className="card-header">
                    <h3>⏰ Zamanlama</h3>
                </div>
                <div className="form-group">
                    <label className="form-label">Cron İfadesi</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="0 9 * * *"
                        value={cronExpression}
                        onChange={(e) => setCronExpression(e.target.value)}
                    />
                    <p className="form-help">
                        Örnekler: <code>0 9 * * *</code> (her gün 09:00) · <code>0 9,18 * * *</code> (09:00 ve 18:00) · <code>30 10 * * 1</code> (Pzt 10:30)
                    </p>
                </div>
            </div>

            {/* GÖRSEL */}
            <div className="card">
                <div className="card-header">
                    <h3>🖼️ Görsel</h3>
                    {image && (
                        <button className="btn btn-danger btn-sm" onClick={removeImage}>✕ Kaldır</button>
                    )}
                </div>
                {imagePreview ? (
                    <div className="image-preview">
                        <img src={imagePreview} alt="Önizleme" />
                    </div>
                ) : (
                    <div
                        className={`drop-zone ${dragOver ? 'drop-zone-active' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => document.getElementById('sched-file-input')?.click()}
                    >
                        <div className="drop-zone-icon">📷</div>
                        <p>Görseli sürükle & bırak veya <strong>tıkla</strong></p>
                        <p className="form-help">PNG, JPG, WEBP — Maks 10MB</p>
                    </div>
                )}
                <input
                    id="sched-file-input"
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageSelect(file);
                        e.target.value = '';
                    }}
                />
            </div>

            {/* MESAJ */}
            <div className="card">
                <div className="card-header">
                    <h3>✍️ Mesaj İçeriği</h3>
                </div>
                <div className="form-group">
                    <textarea
                        className="form-textarea"
                        placeholder="Zamanlanmış mesajınızı yazın..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                    />
                </div>
            </div>

            {/* BUTONLU LİNKLER */}
            <div className="card">
                <div className="card-header">
                    <h3>🔗 Butonlu Linkler</h3>
                    <button className="btn btn-secondary btn-sm" onClick={addButton}>➕ Buton Ekle</button>
                </div>
                {buttons.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        Gönderi altına tıklanabilir buton eklemek için "Buton Ekle"ye tıklayın
                    </p>
                ) : (
                    buttons.map((btn, idx) => (
                        <div key={idx} className="button-row">
                            <input type="text" className="form-input" placeholder="✅ YATIRIM YAP ✅"
                                value={btn.text} onChange={(e) => updateButton(idx, 'text', e.target.value)} />
                            <input type="text" className="form-input" placeholder="https://example.com"
                                value={btn.url} onChange={(e) => updateButton(idx, 'url', e.target.value)} />
                            <button className="btn btn-danger btn-sm" onClick={() => removeButton(idx)}>✕</button>
                        </div>
                    ))
                )}
            </div>

            {/* ZAMANLA BUTONU */}
            <div className="btn-group" style={{ marginBottom: 32 }}>
                <button
                    className="btn btn-primary"
                    onClick={handleSchedule}
                    disabled={scheduling || ((!message.trim() && !image) || !cronExpression.trim())}
                >
                    {scheduling ? '⏳ Zamanlanıyor...' : '📅 Zamanla'}
                </button>
                {(message || image || buttons.length > 0) && (
                    <button className="btn btn-secondary" onClick={resetForm}>🗑️ Temizle</button>
                )}
            </div>

            {/* AKTİF ZAMANLAMALAR */}
            <div className="card">
                <div className="card-header">
                    <h3>📋 Aktif Zamanlamalar</h3>
                </div>

                {loading ? (
                    <div className="spinner" />
                ) : posts.length === 0 ? (
                    <div className="empty-state">
                        <div className="icon">📭</div>
                        <p>Zamanlanmış gönderi yok</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Zamanlama</th>
                                    <th>İçerik</th>
                                    <th>Özellikler</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {posts.map((p) => (
                                    <tr key={p.id}>
                                        <td><span className="code-badge">#{p.id}</span></td>
                                        <td>
                                            <span className="code-badge">{p.cron_expression}</span>
                                            <br />
                                            <small style={{ color: 'var(--text-muted)' }}>{p.humanCron}</small>
                                        </td>
                                        <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {p.content || '(sadece görsel)'}
                                        </td>
                                        <td>
                                            {p.image_path && <span className="code-badge" style={{ marginRight: 6 }}>🖼️</span>}
                                            {p.buttons_json && <span className="code-badge">🔗</span>}
                                        </td>
                                        <td>
                                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>
                                                🗑️ Sil
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}

// ═══════════════════════════════════════════
// TRIGGERS PAGE
// ═══════════════════════════════════════════
function TriggersPage({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
    const [triggers, setTriggers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [triggerWord, setTriggerWord] = useState('');
    const [response, setResponse] = useState('');
    const [adding, setAdding] = useState(false);

    const loadTriggers = useCallback(async () => {
        try {
            const data = await triggersApi.list();
            setTriggers(data.triggers || []);
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { loadTriggers(); }, [loadTriggers]);

    const handleAdd = async () => {
        if (!triggerWord.trim() || !response.trim()) return;
        setAdding(true);
        try {
            await triggersApi.add(triggerWord, response);
            showToast('Trigger eklendi!');
            setTriggerWord('');
            setResponse('');
            loadTriggers();
        } catch (err: any) {
            showToast(err.message || 'Hata', 'error');
        } finally {
            setAdding(false);
        }
    };

    const handleDelete = async (chatId: string, word: string) => {
        try {
            await triggersApi.remove(chatId, word);
            showToast(`${word} silindi`);
            loadTriggers();
        } catch (err: any) {
            showToast(err.message, 'error');
        }
    };

    return (
        <>
            <div className="page-header">
                <h2>🔑 Trigger Yönetimi</h2>
                <p>Kullanıcılar belirli komutları yazdığında otomatik cevap verin</p>
            </div>

            <div className="card">
                <div className="card-header">
                    <h3>➕ Yeni Trigger</h3>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">Tetikleyici</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="!site"
                            value={triggerWord}
                            onChange={(e) => setTriggerWord(e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Cevap</label>
                        <input
                            type="text"
                            className="form-input"
                            placeholder="https://cutt.ly/orancerrahi"
                            value={response}
                            onChange={(e) => setResponse(e.target.value)}
                        />
                    </div>
                </div>

                <div className="btn-group">
                    <button
                        className="btn btn-primary"
                        onClick={handleAdd}
                        disabled={adding || !triggerWord.trim() || !response.trim()}
                    >
                        {adding ? '⏳ Ekleniyor...' : '✅ Trigger Ekle'}
                    </button>
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <h3>📋 Aktif Trigger'lar</h3>
                </div>

                {loading ? (
                    <div className="spinner" />
                ) : triggers.length === 0 ? (
                    <div className="empty-state">
                        <div className="icon">📭</div>
                        <p>Tanımlı trigger yok</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Tetikleyici</th>
                                    <th>Cevap</th>
                                    <th>Chat ID</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {triggers.map((t) => (
                                    <tr key={`${t.chat_id}-${t.trigger_word}`}>
                                        <td><span className="code-badge">{t.trigger_word}</span></td>
                                        <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {t.response}
                                        </td>
                                        <td><span className="code-badge">{t.chat_id}</span></td>
                                        <td>
                                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t.chat_id, t.trigger_word)}>
                                                🗑️ Sil
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
}

// ═══════════════════════════════════════════
// STATS PAGE
// ═══════════════════════════════════════════
function StatsPage() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        statsApi.get()
            .then((data) => setStats(data.stats))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="spinner" />;

    const formatUptime = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        return `${h}sa ${m}dk`;
    };

    return (
        <>
            <div className="page-header">
                <h2>📊 İstatistikler</h2>
                <p>Bot durumu ve genel veriler</p>
            </div>

            {stats && (
                <div className="stats-grid">
                    <div className="stat-card">
                        <div className="stat-icon">📅</div>
                        <div className="stat-value">{stats.scheduledPosts}</div>
                        <div className="stat-label">Zamanlanmış Gönderi</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon">⏰</div>
                        <div className="stat-value">{stats.activeJobs}</div>
                        <div className="stat-label">Aktif Cron Job</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon">⚠️</div>
                        <div className="stat-value">{stats.totalWarnings}</div>
                        <div className="stat-label">Toplam Uyarı</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon">🔑</div>
                        <div className="stat-value">{stats.totalTriggers}</div>
                        <div className="stat-label">Aktif Trigger</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon">👤</div>
                        <div className="stat-value">{stats.uniqueWarned}</div>
                        <div className="stat-label">Uyarılan Kullanıcı</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon">🕐</div>
                        <div className="stat-value">{formatUptime(stats.uptime)}</div>
                        <div className="stat-label">Uptime</div>
                    </div>
                </div>
            )}

            {stats && (
                <div className="card">
                    <div className="card-header">
                        <h3>📡 Sunucu Bilgileri</h3>
                    </div>
                    <table>
                        <tbody>
                            <tr>
                                <td style={{ fontWeight: 600, width: 200 }}>Sunucu Zamanı</td>
                                <td>{stats.serverTime}</td>
                            </tr>
                            <tr>
                                <td style={{ fontWeight: 600 }}>Saat Dilimi</td>
                                <td>Europe/Istanbul</td>
                            </tr>
                            <tr>
                                <td style={{ fontWeight: 600 }}>Bot Durumu</td>
                                <td><span className="status-dot" /> Çalışıyor</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}

// ═══════════════════════════════════════════
// CHANNEL POSTS PAGE
// ═══════════════════════════════════════════
interface ChannelPost {
    id: number;
    message_id: number;
    chat_id: string;
    text: string | null;
    has_photo: number;
    has_video: number;
    has_document: number;
    caption: string | null;
    date: number;
    photo_file_id?: string;
}



interface KnownGroup {
    chat_id: string;
    title: string;
    type: string;
}

function ChannelPostsPage({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
    const [posts, setPosts] = useState<ChannelPost[]>([]);
    const [groups, setGroups] = useState<KnownGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [forwardingId, setForwardingId] = useState<number | null>(null);
    const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
    const [forwarding, setForwarding] = useState(false);
    const [showAddGroup, setShowAddGroup] = useState(false);
    const [newGroupId, setNewGroupId] = useState('');
    const [newGroupTitle, setNewGroupTitle] = useState('');
    const [fetchingHistory, setFetchingHistory] = useState(false);
    const [autoForwards, setAutoForwards] = useState<string[]>([]); // target_chat_ids

    // Recurring Forward State
    const [isRecurring, setIsRecurring] = useState(false);
    const [scheduleTime, setScheduleTime] = useState('12:00');

    const loadData = useCallback(async () => {
        try {
            const [postsData, groupsData, autoData] = await Promise.all([
                channelApi.listPosts(),
                channelApi.listGroups(),
                channelApi.listAutoForward(),
            ]);
            setPosts(postsData.posts || []);
            setGroups(groupsData.groups || []);
            // autoData.configs -> [{ source_chat_id, target_chat_id }]
            const activeTargets = (autoData.configs || []).map((c: any) => c.target_chat_id);
            setAutoForwards(activeTargets);
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { loadData(); }, [loadData]);

    const formatDate = (ts: number) => {
        const d = new Date(ts * 1000);
        return d.toLocaleString('tr-TR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    const openForwardDialog = (messageId: number) => {
        setForwardingId(messageId);
        setSelectedGroups([]);
        setIsRecurring(false);
        setScheduleTime('12:00');
    };

    const toggleGroup = (chatId: string) => {
        setSelectedGroups(prev =>
            prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId]
        );
    };

    const selectAllGroups = () => {
        if (selectedGroups.length === groups.length) {
            setSelectedGroups([]);
        } else {
            setSelectedGroups(groups.map(g => g.chat_id));
        }
    };

    const handleForward = async () => {
        if (!forwardingId || selectedGroups.length === 0) return;
        setForwarding(true);

        try {
            if (isRecurring) {
                // Zamanlanmış gönderi oluştur
                if (!scheduleTime) {
                    showToast('Lütfen saat seçin', 'error');
                    setForwarding(false);
                    return;
                }

                const postToForward = posts.find(p => p.message_id === forwardingId);
                if (!postToForward) {
                    showToast('Gönderi bulunamadı', 'error');
                    setForwarding(false);
                    return;
                }

                const [hh, mm] = scheduleTime.split(':');
                const cronExpression = `0 ${parseInt(mm)} ${parseInt(hh)} * * *`; // Her gün HH:mm

                let successCount = 0;
                for (const groupId of selectedGroups) {
                    await postsApi.schedule(
                        postToForward.text || postToForward.caption || '',
                        cronExpression,
                        null,
                        [], // butonlar şimdilik yok
                        groupId,
                        postToForward.photo_file_id
                    );
                    successCount++;
                }
                showToast(`${successCount} gruba zamanlama yapıldı! 📅`);
            } else {
                // Normal iletme
                const data = await channelApi.forward(forwardingId, selectedGroups);
                showToast(data.message);
            }
            setForwardingId(null);
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setForwarding(false);
        }
    };

    const handleAddGroup = async () => {
        if (!newGroupId.trim() || !newGroupTitle.trim()) return;
        try {
            await channelApi.addGroup(newGroupId, newGroupTitle);
            showToast('Grup eklendi');
            setNewGroupId('');
            setNewGroupTitle('');
            setShowAddGroup(false);
            loadData();
        } catch (err: any) {
            showToast(err.message, 'error');
        }
    };

    const handleDeleteGroup = async (chatId: string) => {
        try {
            await channelApi.deleteGroup(chatId);
            showToast('Grup silindi');
            loadData();
        } catch (err: any) {
            showToast(err.message, 'error');
        }
    };

    const handleFetchHistory = async () => {
        setFetchingHistory(true);
        try {
            const data = await channelApi.fetchHistory(5000);
            showToast(data.message);
            loadData();
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setFetchingHistory(false);
        }
    };

    const handleToggleAutoForward = async (targetChatId: string) => {
        const isEnabled = autoForwards.includes(targetChatId);
        try {
            await channelApi.toggleAutoForward(targetChatId, !isEnabled);
            showToast(isEnabled ? 'Otomatik iletim kapatıldı' : 'Otomatik iletim açıldı ⚡');
            loadData(); // State'i güncelle
        } catch (err: any) {
            showToast(err.message, 'error');
        }
    };

    const getPostPreview = (post: ChannelPost): string => {
        const text = post.text || post.caption || '';
        const prefix: string[] = [];
        if (post.has_photo) prefix.push('🖼️');
        if (post.has_video) prefix.push('🎬');
        if (post.has_document) prefix.push('📎');
        const pfx = prefix.length > 0 ? prefix.join(' ') + ' ' : '';
        return pfx + (text.length > 120 ? text.slice(0, 120) + '...' : text || '(içerik yok)');
    };

    return (
        <>
            <div className="page-header">
                <h2>📢 Kanal Gönderileri</h2>
                <p>Kanaldaki mesajları görüntüle ve gruplara ilet</p>
                <button
                    className="btn btn-primary"
                    onClick={handleFetchHistory}
                    disabled={fetchingHistory}
                    style={{ marginTop: 8 }}
                >
                    {fetchingHistory ? '⏳ Mesajlar çekiliyor... (biraz bekleyin)' : '📥 Kanal Geçmişini Çek'}
                </button>
            </div>

            {/* GRUPLAR */}
            <div className="card">
                <div className="card-header">
                    <h3>👥 Gruplar ({groups.length})</h3>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowAddGroup(!showAddGroup)}>
                        {showAddGroup ? '✕ İptal' : '➕ Grup Ekle'}
                    </button>
                </div>

                {showAddGroup && (
                    <div style={{ marginBottom: 16 }}>
                        <div className="button-row" style={{ gridTemplateColumns: '1fr 1.5fr auto' }}>
                            <input type="text" className="form-input" placeholder="-1001234567890"
                                value={newGroupId} onChange={(e) => setNewGroupId(e.target.value)} />
                            <input type="text" className="form-input" placeholder="Grup adı"
                                value={newGroupTitle} onChange={(e) => setNewGroupTitle(e.target.value)} />
                            <button className="btn btn-primary btn-sm" onClick={handleAddGroup}>Ekle</button>
                        </div>
                        <p className="form-help">Grup chat ID'sini ve adını girin. Bot'un o grupta admin olması gerekir.</p>
                    </div>
                )}

                {groups.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        Henüz grup yok. Bot'un eklendiği gruplar otomatik kaydedilir veya manuel ekleyebilirsiniz.
                    </p>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {groups.map((g) => (
                            <div key={g.chat_id} className="code-badge" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: 10 }}>
                                <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 600 }}>{g.title}</span>
                                    <button onClick={() => handleDeleteGroup(g.chat_id)}
                                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: 14 }}>✕</button>
                                </div>
                                <button
                                    className={`btn btn-xs ${autoForwards.includes(g.chat_id) ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => handleToggleAutoForward(g.chat_id)}
                                    style={{ width: '100%', fontSize: 11 }}
                                >
                                    {autoForwards.includes(g.chat_id) ? '⚡ Otomatik: AÇIK' : '⚡ Otomatik: KAPALI'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* İLETME DİALOGU */}
            {forwardingId !== null && (
                <div className="card" style={{ border: '1px solid var(--accent)', boxShadow: '0 0 20px var(--accent-glow)' }}>
                    <div className="card-header">
                        <h3>📨 İlet — Mesaj #{forwardingId}</h3>
                        <button className="btn btn-secondary btn-sm" onClick={() => setForwardingId(null)}>✕ Kapat</button>
                    </div>

                    {groups.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Henüz grup yok. Önce grup ekleyin.</p>
                    ) : (
                        <>
                            <div style={{ marginBottom: 12 }}>
                                <button className="btn btn-secondary btn-sm" onClick={selectAllGroups}>
                                    {selectedGroups.length === groups.length ? '☐ Tümünü Kaldır' : '☑ Tümünü Seç'}
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                {groups.map((g) => (
                                    <button
                                        key={g.chat_id}
                                        className={`btn btn-sm ${selectedGroups.includes(g.chat_id) ? 'btn-primary' : 'btn-secondary'}`}
                                        onClick={() => toggleGroup(g.chat_id)}
                                        style={{ fontSize: 12 }}
                                    >
                                        {selectedGroups.includes(g.chat_id) ? '✅' : '⬜'} {g.title}
                                    </button>
                                ))}
                            </div>

                            {/* Recurring Option */}
                            <div style={{ background: 'var(--bg-default)', padding: 12, borderRadius: 8, marginBottom: 16 }}>
                                <label className="checkbox-row">
                                    <input type="checkbox"
                                        checked={isRecurring}
                                        onChange={(e) => setIsRecurring(e.target.checked)}
                                    />
                                    <strong>Her gün otomatik tekrarla</strong>
                                </label>
                                {isRecurring && (
                                    <div style={{ marginTop: 8, marginLeft: 28 }}>
                                        <label style={{ fontSize: 13, marginRight: 8 }}>Saat:</label>
                                        <input
                                            type="time"
                                            className="form-input"
                                            style={{ width: 'auto', display: 'inline-block' }}
                                            value={scheduleTime}
                                            onChange={(e) => setScheduleTime(e.target.value)}
                                        />
                                        <p className="form-help">Bu gönderi seçilen gruplara her gün bu saatte otomatik gönderilecek.</p>
                                    </div>
                                )}
                            </div>

                            <button
                                className="btn btn-primary"
                                onClick={handleForward}
                                disabled={forwarding || selectedGroups.length === 0}
                            >
                                {forwarding
                                    ? '⏳ İşleniyor...'
                                    : isRecurring
                                        ? `📅 ${selectedGroups.length} Gruba Zamanla`
                                        : `📨 ${selectedGroups.length} Gruba İlet`
                                }
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* MESAJ LİSTESİ */}
            <div className="card">
                <div className="card-header">
                    <h3>📋 Gönderiler</h3>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setLoading(true); loadData(); }}>
                        🔄 Yenile
                    </button>
                </div>

                {loading ? (
                    <div className="spinner" />
                ) : posts.length === 0 ? (
                    <div className="empty-state">
                        <div className="icon">📭</div>
                        <p>Henüz kanal gönderisi yok. Bot kanal yöneticisi olmalı ve kanal mesajlarını alabilmeli.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {posts.map((post) => (
                            <div key={post.id} style={{
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                                padding: '14px 18px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'flex-start',
                                gap: 16,
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
                                        🕐 {formatDate(post.date)}
                                    </div>

                                    {post.photo_file_id && (
                                        <div style={{ marginBottom: 8 }}>
                                            <img
                                                src={`/api/channel/image?fileId=${encodeURIComponent(post.photo_file_id)}`}
                                                alt="Post visual"
                                                style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 4, objectFit: 'contain' }}
                                            />
                                        </div>
                                    )}

                                    <div style={{ fontSize: 14, color: 'var(--text-primary)', wordBreak: 'break-word', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                        {getPostPreview(post)}
                                    </div>
                                </div>
                                <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => openForwardDialog(post.message_id)}
                                    style={{ flexShrink: 0 }}
                                >
                                    📨 İlet
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

// ═══════════════════════════════════════════
// SPAM CONFIG PAGE
// ═══════════════════════════════════════════
function SpamConfigPage({ showToast }: { showToast: (msg: string, type?: 'success' | 'error') => void }) {
    const [config, setConfig] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        spamApi.get()
            .then((data) => setConfig(data.config))
            .catch(err => showToast(err.message, 'error'))
            .finally(() => setLoading(false));
    }, [showToast]);

    const handleSave = async () => {
        if (!config) return;
        setSaving(true);
        try {
            await spamApi.update(config);
            showToast('Ayarlar kaydedildi! ✅');
        } catch (err: any) {
            showToast(err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const updateConfig = (field: string, value: any) => {
        setConfig((prev: any) => ({ ...prev, [field]: value }));
    };

    if (loading) return <div className="spinner" />;

    return (
        <>
            <div className="page-header">
                <h2>🛡️ Spam Koruması</h2>
                <p>Bot'un otomatik koruma sistemlerini yönetin</p>
                <div style={{ marginTop: 8 }}>
                    <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? '⏳ Kaydediliyor...' : '💾 Ayarları Kaydet'}
                    </button>
                </div>
            </div>

            {config && (
                <div style={{ display: 'grid', gap: 24 }}>
                    {/* TOGGLES */}
                    <div className="card">
                        <div className="card-header">
                            <h3>⚙️ Genel Ayarlar</h3>
                        </div>
                        <div style={{ display: 'grid', gap: 16 }}>
                            <label className="checkbox-row">
                                <input type="checkbox"
                                    checked={!!config.rate_limit_enabled}
                                    onChange={(e) => updateConfig('rate_limit_enabled', e.target.checked ? 1 : 0)}
                                />
                                <div>
                                    <strong>Hız Limiti (Rate Limit)</strong>
                                    <p className="form-help">Çok hızlı mesaj gönderen kullanıcıları uyarır/kısıtlar.</p>
                                </div>
                            </label>

                            <label className="checkbox-row">
                                <input type="checkbox"
                                    checked={!!config.captcha_enabled}
                                    onChange={(e) => updateConfig('captcha_enabled', e.target.checked ? 1 : 0)}
                                />
                                <div>
                                    <strong>Captcha Doğrulama</strong>
                                    <p className="form-help">Yeni gelen üyeleri doğrulamadan mesaj attırmaz.</p>
                                </div>
                            </label>

                            <label className="checkbox-row">
                                <input type="checkbox"
                                    checked={!!config.duplicate_filter_enabled}
                                    onChange={(e) => updateConfig('duplicate_filter_enabled', e.target.checked ? 1 : 0)}
                                />
                                <div>
                                    <strong>Tekrar Eden Mesaj (Flood)</strong>
                                    <p className="form-help">Aynı mesajı tekrar tekrar yazanları engeller.</p>
                                </div>
                            </label>

                            <label className="checkbox-row">
                                <input type="checkbox"
                                    checked={!!config.link_filter_enabled}
                                    onChange={(e) => updateConfig('link_filter_enabled', e.target.checked ? 1 : 0)}
                                />
                                <div>
                                    <strong>Link Filtresi</strong>
                                    <p className="form-help">İzin verilmeyen linklerin paylaşılmasını engeller.</p>
                                </div>
                            </label>

                            <label className="checkbox-row">
                                <input type="checkbox"
                                    checked={!!config.word_filter_enabled}
                                    onChange={(e) => updateConfig('word_filter_enabled', e.target.checked ? 1 : 0)}
                                />
                                <div>
                                    <strong>Kelime Filtresi</strong>
                                    <p className="form-help">Yasaklı kelimeler içeren mesajları siler.</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* LISTS */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                        <div className="card">
                            <div className="card-header">
                                <h3>🚫 Yasaklı Kelimeler (Blacklist)</h3>
                            </div>
                            <div className="form-group">
                                <textarea
                                    className="form-textarea"
                                    style={{ height: 300, fontFamily: 'monospace' }}
                                    placeholder="bahis, casino, +18, hack..."
                                    value={config.blacklisted_words || ''}
                                    onChange={(e) => updateConfig('blacklisted_words', e.target.value)}
                                />
                                <p className="form-help">Kelimeleri virgül (,) ile ayırın.</p>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-header">
                                <h3>✅ İzinli Domainler (Whitelist)</h3>
                            </div>
                            <div className="form-group">
                                <textarea
                                    className="form-textarea"
                                    style={{ height: 300, fontFamily: 'monospace' }}
                                    placeholder="youtube.com, google.com..."
                                    value={config.whitelisted_domains || ''}
                                    onChange={(e) => updateConfig('whitelisted_domains', e.target.value)}
                                />
                                <p className="form-help">Domainleri virgül (,) ile ayırın.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Alt Kaydet Butonu */}
            <div style={{ marginTop: 24, paddingBottom: 40, textAlign: 'right' }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ minWidth: 200 }}>
                    {saving ? '⏳ Kaydediliyor...' : '💾 Ayarları Kaydet'}
                </button>
            </div>
        </>
    );
}

export default App;
