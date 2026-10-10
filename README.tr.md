# Prism Browser Community

[English](README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [Русский](README.ru.md) | [Tiếng Việt](README.vi.md) | [ไทย](README.th.md) | [Português (Brasil)](README.pt-BR.md)

[Français](README.fr.md) | [Українська](README.uk.md) | [Español](README.es.md) | **[Türkçe](README.tr.md)** | [日本語](README.ja.md) | [हिन्दी](README.hi.md)

Geliştirici: [DFarm](https://x.com/DFarm_club) · Resmî site: [prismbrowser.app](https://prismbrowser.app/)

Prism Browser, özelleştirilmiş Chromium üzerine kurulu, tarayıcı parmak izlerini yapılandırabilen yerel bir profil yöneticisidir. Her profilin çerezleri, önbelleği, uzantı verileri, proxy ayarları ve parmak izi yapılandırması bağımsızdır; böylece birbirinden yalıtılmış tarayıcı kimlikleri yönetilebilir.

Profiller, çerezler, proxy kimlik bilgileri ve geçmiş varsayılan olarak kullanıcının cihazında kalır. Community sürümü ücretsizdir ve yerel profil sayısını sınırlamaz.

## Kaynak kodunun bakımı

Bu depo öğrenme, inceleme ve topluluk derlemeleri için açık kalacaktır. `v0.3.17` sürümünden itibaren ürünün yeni özellikleri, düzeltmeleri ve kaynak kodu değişiklikleri buraya düzenli olarak aktarılmamaktadır. Uygulama, motorlar, platformlar arası paketler ve Pro özellikleri büyüdükçe birden fazla dalı sürdürmenin ve test etmenin maliyeti artmıştır.

Bu güncelleme bir istisna olarak 0.3.19 sürümünün genel çoklu dil desteğini aktarır ve mevcut açık arayüzü çevirir. Pro'nun özel çalışma zamanı bileşenleri, lisanslama hizmetleri, yeni Pro özellikleri veya özel yayın ayarları dahil değildir. Ürün kaynak kodunun sürekli eşitlenmesi yeniden başlamamaktadır.

Mevcut kod, commit geçmişi ve önceki sürümler korunur. Yeni özellikler, düzeltmeler ve kurulum dosyaları için [resmî siteye](https://prismbrowser.app/) ve [Releases](../../releases) sayfasına bakın.

## Diller

Arayüz ve README **13 dilde** sunulur: Basitleştirilmiş Çince, Geleneksel Çince, İngilizce, Rusça, Vietnamca, Tayca, Brezilya Portekizcesi, Fransızca, Ukraynaca, İspanyolca, Türkçe, Japonca ve Hintçe. README dilini üstteki bağlantılardan değiştirebilirsiniz.

- Başlangıçta sistemin birincil görüntüleme dili kullanılır; dil desteklenmiyorsa veya okunamıyorsa İngilizce seçilir.
- Sağ üstteki seçici dili anında değiştirir. Elle yapılan seçim yerel olarak kaydedilir ve sonraki açılışlarda önceliklidir.
- Arayüz dili, profilin parmak izi dilinden ve saat diliminden bağımsızdır. Adlar, notlar, etiketler ve kaydedilmemiş düzenlemeler korunur.
- Çeviriler uygulamayla birlikte gelir; çevrimiçi çeviri hizmeti kullanılmaz. Katkıda bulunmak için [Çince ve İngilizce yerelleştirme kılavuzuna](docs/localization.md) bakın.

## İndirme ve ilk kullanım

[Releases](../../releases) üzerinden macOS için DMG veya ZIP, Windows için kurulum paketi veya Portable sürümünü indirin. Yayınlanan paketler kullanıma hazır Chromium 144 parmak izi motorunu içerir; Chromium'u derlemeniz gerekmez.

Sistem imzasız bir sürümü engellerse macOS'ta **Sistem Ayarları → Gizlilik ve Güvenlik** bölümünden açılmasını onaylayın; Windows SmartScreen'de **Ek bilgi → Yine de çalıştır** seçeneğini kullanın. Yalnızca bu projenin Releases sayfasından indirin ve SHA-256 değerini yayımlanan değerle karşılaştırın.

1. Prism Browser'ı açın ve yeni bir profil oluşturun.
2. Ad, sistem, dil, saat dilimi, ekran ve donanım kimliğini ayarlayın.
3. Proxy gerekmiyorsa doğrudan bağlantı kullanın. Aksi halde protokol, sunucu, bağlantı noktası ve kimlik bilgilerini girip bağlantıyı test edin.
4. Profili kaydedip açın. Pencere kapandığında çerezler, önbellek, yer imleri ve uzantı verileri korunur.

Her profil ayrı bir veri dizini kullanır. Kopyalama, ayarları korurken yeni bir kimlik ve yeni bir başlangıç değeri (seed) oluşturur.

## Özellikler

Her şey yerel makinede çalışır: hesap, abonelik veya etkinleştirme yoktur. Yerel otomasyon API’si, zamanlanmış görevler ve MCP üzerinden yerel yapay zekâ denetimi ücretsiz sürüme dahildir; parmak izi çekirdeği uygulamayla birlikte gelir.

Community; sınırsız yerel profil, bağımsız veriler, HTTP/HTTPS/SOCKS5 proxy ve WebRTC sızıntı koruması sunar. User-Agent, dil, saat dilimi, ekran, CPU, bellek ve GPU kimliği yapılandırılabilir; Canvas, WebGL, Audio, DOMRect, yazı tipleri, Speech ve WebGPU tutarlılığı desteklenir.

Kopyalama, gruplar, etiketler, favoriler, toplu işlemler, çöp kutusu ve çerezlerin, profillerin veya tüm çalışma alanının yerel aktarımı desteklenir. macOS Dock ve Windows görev çubuğu simgeleri profil numarasını gösterebilir.

## Doğrulama

Proje; Pixelscan, CreepJS, BrowserLeaks, IPhey, Prism parmak izi matrisi ve profil verisi denetim araçlarını kullanır. Kimlik tutarlılığı, aynı seed ile yeniden başlatma kararlılığı, farklı seed'lerin ayrışması, iframe/Worker tutarlılığı ve veri kalıcılığı denetlenir.

Üçüncü taraf testleri değiştiği için tüm testleri süresiz geçme garantisi yoktur. Proxy kalitesi, IP itibarı, uzak masaüstü, sistem yazı tipleri ve gerçek donanım da sonuçları etkiler.

## Geliştirme ve derleme

Node.js 22 veya üzeri, npm ve platformunuzun temel derleme araçları gerekir. Depo kökünde çalıştırın:

```bash
# Kurulum, kontrol ve derleme
npm ci
npm run typecheck
npm run build

# Geliştirme modu
npm run dev

# macOS paketi
npm run dist:mac

# Windows paketi
npm run dist:win
```

Bu paketleme komutları parmak izi motorunu içermez. Chromium 144 derlemesi için 32 GB RAM, yaklaşık 300 GB boş SSD alanı ve boşluksuz kısa bir yol önerilir.

- macOS arm64: Xcode, Git, Python 3, Ninja ve APFS birimi. Xcode lisansını kabul edip [derleme kılavuzunu](tools/macos-kernel/README.md) izleyin.
- Windows x64: Windows 10/11, C++ masaüstü geliştirme araçlarıyla Visual Studio, Windows SDK, Git, Python 3 ve NTFS birimi. Temiz bir Python sanal ortamı önerilir. [Derleme kılavuzuna](tools/windows-kernel/README.md) bakın.

Sabitlenmiş sürümler, kaynak commit'leri, yama sırası ve SHA-256 değerleri `tools/kernel-lock.json` içindedir; ortak yamalar `tools/kernel-patches` dizinindedir. Kesilen derlemeyi sürdürmek için `Build-Kernel` komutunu yeniden çalıştırın. Çıktılar derleme kökündeki `artifacts/<version>-<platform>`, günlükler ise `logs` dizinine yazılır. Ayrıntılı komutlar [İngilizce README](README.md) içinde de bulunur.

Prism'in motor yönetiminden yerel derlemeyi içe aktarın: macOS'ta `Chromium.app`, Windows'ta `chrome.exe` içeren dizin. Motoru doğruladıktan sonra etkinleştirin; mevcut veri ve ayarlar korunur.

## Güvenlik ve lisans

Herkese açık issue'larda etkinleştirme kodu, proxy parolası, çerez, cüzdan bilgisi, özel anahtar veya kişisel veri içeren tanılama dosyaları paylaşmayın. Hassas bilgileri kaldırarak asgari yeniden üretme adımlarını, sürümü, platformu ve etkiyi belirtin. Parmak izi test puanındaki değişim mutlaka güvenlik açığı değildir; site, test zamanı, motor sürümü ve başarısız alanları ekleyin.

Prism Browser Community'ye ait kod [MIT Lisansı](LICENSE) ile sunulur. Chromium, Electron ve diğer bileşenler kendi lisanslarına tabidir. Chromium dağıtımlarında gerekli `LICENSE`, `LICENSES` ve bildirimler korunmalıdır. Kod lisansı Prism adı, logosu veya simgeleri için otomatik marka hakkı vermez.

Projeyi yalnızca yasal ve izinli tarayıcı yalıtımı, otomasyon testleri, gizlilik araştırması ve hesap yönetimi için, hedef sitelerin koşullarına ve yerel yasalara uyarak kullanın.

## Yıldız geçmişi

[![Prism Browser Community Star History](https://api.star-history.com/svg?repos=DFarm6/Prism-Browser-Community&type=Date)](https://www.star-history.com/#DFarm6/Prism-Browser-Community&Date)
