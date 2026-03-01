# 🛡️ Telegram Guard Bot

Telegram grubu için anti-spam koruması ve zamanlanmış otomatik gönderi yönetimi botu.

## Özellikler

### Anti-Spam
- 🔄 **Rate Limiting** - Mesaj flood koruması (susturma)
- 🔐 **CAPTCHA** - Yeni üyelere matematik doğrulama
- 🔗 **Link Filtresi** - Whitelist dışı linkleri silme
- 📝 **Kelime Filtresi** - Kara listedeki kelimeleri tespit
- 🔁 **Tekrar Tespiti** - Aynı mesajı spamlayanları engelleme

### Zamanlanmış Gönderiler
- 📅 Cron ifadesi ile esnek zamanlama
- ✏️ Kolay ekleme/silme/listeleme
- 🕐 Europe/Istanbul timezone desteği

### Admin Araçları
- ⚠️ 3-uyarı sistemi (otomatik ban)
- 🔨 Ban/Unban komutları
- ⚙️ Her grup için ayrı spam ayarları
- 📊 Bot istatistikleri

## Kurulum

```bash
# 1. Bağımlılıkları kur
npm install

# 2. .env dosyası oluştur
cp .env.example .env
# BOT_TOKEN ve ADMIN_IDS değerlerini düzenle

# 3. Geliştirme modunda başlat
npm run dev

# 4. Production build
npm run build
npm start
```

## .env Yapılandırması

```env
BOT_TOKEN=your_bot_token_here
ADMIN_IDS=123456789,987654321
```

## Komutlar

| Komut | Açıklama |
|-------|----------|
| `/start` | Bot bilgileri |
| `/help` | Komut listesi |
| `/rules` | Grup kuralları |
| `/addpost <cron> \| <mesaj>` | Zamanlanmış gönderi ekle |
| `/listposts` | Aktif gönderileri listele |
| `/removepost <id>` | Gönderi sil |
| `/spamconfig` | Spam filtre ayarları |
| `/togglespam <özellik>` | Spam özelliği aç/kapat |
| `/warn` | Kullanıcıya uyarı (reply) |
| `/ban` | Kullanıcıyı banla (reply) |
| `/unban <user_id>` | Banı kaldır |
| `/stats` | Bot istatistikleri |
| `/addwhitelist <domain>` | Link whitelist'e ekle |
| `/addblacklist <kelime>` | Kelime kara listeye ekle |

## Teknoloji

- **Runtime**: Node.js + TypeScript
- **Framework**: grammY
- **Veritabanı**: SQLite (better-sqlite3)
- **Zamanlama**: node-cron
