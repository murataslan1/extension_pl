# 🎟️ Passo Bilet Avcısı

Passo maç sayfasındaki bir kategoride yer açıldığında anında uyarır ve otomatik satın alma akışını ödeme ekranına kadar tamamlar.

## 🚀 Hızlı Kurulum (Windows / Mac — Chrome / Edge / Opera / Brave)

### Adım 1 — İndir
**En son sürümü indir:**
👉 [Releases sayfası](https://github.com/murataslan1/extension_pl/releases/latest)

Releases sayfasındaki **"Assets"** bölümünden `passo-bilet-avcisi-vX.Y.Z.zip` dosyasını indirin.

> ⚠️ **"Code → Download ZIP" butonunu KULLANMAYIN.** O repo'nun tamamını indirir, manifest yanlış yerde olur. Mutlaka **Releases** sayfasındaki ZIP'i indirin.

### Adım 2 — Çıkar
İndirdiğiniz ZIP dosyasına sağ tıklayın → **"Tümünü Çıkar" / "Extract All"**. Çıkan klasörün içinde `manifest.json` dosyasını doğrudan görmelisiniz.

### Adım 3 — Yükle
1. Tarayıcıyı açın ve şunu yazın:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Opera: `opera://extensions`
   - Brave: `brave://extensions`
2. Sağ üstte **"Developer mode" / "Geliştirici modu"** anahtarını **AÇIN**.
3. Sol üstte **"Load unpacked" / "Paketlenmemiş öğe yükle"** butonuna basın.
4. Adım 2'de çıkardığınız klasörü seçin (içinde `manifest.json` olan klasör).
5. Extension yüklendi 🎉

> ⚠️ **Manifest dosyası eksik hatası mı alıyorsunuz?** Seçtiğiniz klasörde `manifest.json` doğrudan görünür olmalı. Eğer klasörün içinde başka bir klasör varsa, o iç klasörü seçin.

### Adım 4 — Kullan
1. Passo.com.tr'ye gidin ve **login olun**.
2. İzlemek istediğiniz maç sayfasını açın (örn. seats sayfası).
3. Tarayıcı araç çubuğunda 🎟️ ikonuna tıklayın → popup açılır.
4. Kategori ve fiyat doğruysa **"İzlemeyi Başlat"** basın.
5. Otomatik satın alma istiyorsanız: **🤖 Otomatik satın al** checkbox'ını işaretleyin, **Bilet adedi** girin.
6. Maç sayfası tab'ını açık bırakın. Bilgisayarı uyku moduna almayın.

### Adım 5 — Yer Açılınca
- 🔔 Masaüstü bildirimi gelir
- 🔊 Sesli alarm çalar
- 📑 Tab başlığı yanıp söner, pencere öne gelir
- 🤖 Otomatik satın alma açıksa: koltuk seçilir, sepete eklenir, ödeme ekranına kadar gidilir
- 💳 Ödeme ekranında DURUR — siz kartı seçin, CVV/SMS girin

## 🔧 Özellikler

- ⏱️ 30 saniyede bir sessiz API poll (sayfa yenilenmez, logout olmaz)
- 💓 90 saniyede heartbeat (session keep-alive)
- 🚨 Logout tespit — olursa anında uyarı
- 🤖 Otomatik satın alma (ödeme ekranına kadar)
- 🔊 Çok katmanlı alarm (bildirim + ses + pencere flash + tab başlığı)
- 🧪 SIMULATE butonu ile test

## 🛡️ Güvenlik

- Kart bilgisi, CVV, 3DS kodu **asla** otomatize edilmez — sizde kalır.
- Sadece `passo.com.tr` alanında çalışır.
- Tüm veri sizin tarayıcınızda, hiçbir sunucuya gönderilmez.

## 📝 Lisans

Kişisel kullanım için. Passo ToS'u ihlal etmeyin, hesabınızın sorumluluğu size aittir.
