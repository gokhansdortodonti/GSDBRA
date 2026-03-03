# OrthoScan Pro

**OrthoScan Pro**, ortodonti kliniklerinde kullanılmak üzere geliştirilmekte olan bir **3D diş tarama analiz ve braket planlama yazılımıdır.** Web tabanlı olup hastaya özel tarama dosyalarını (STL/OBJ/PLY) tarayıcı üzerinden yükleyip gerçek zamanlı 3D görüntüleme, oklüzal düzlem hizalaması ve braket yerleşim planlaması yapılmasına imkân tanır.

> **Durum:** Aktif geliştirme aşamasında — temel iş akışı çalışır durumda, ileri özellikler eklenmekte.

---

## İçindekiler

- [Proje Amacı](#proje-amacı)
- [Temel Özellikler](#temel-özellikler)
- [Teknoloji Yığını](#teknoloji-yığını)
- [Proje Mimarisi](#proje-mimarisi)
- [İş Akışı (Blueprint)](#iş-akışı-blueprint)
- [Bileşenler](#bileşenler)
- [Kurulum ve Çalıştırma](#kurulum-ve-çalıştırma)
- [Geliştirme Yol Haritası](#geliştirme-yol-haritası)

---

## Proje Amacı

Ortodontistler, hastanın ağız içi taramalarını (maxilla = üst çene, mandibula = alt çene) dijital ortamda inceleyerek braket yerleşimini planlar. Bu süreç geleneksel olarak pahalı masaüstü yazılımlarla (Dolphin, Orthoanalyzer vb.) yürütülmektedir. OrthoScan Pro, bu iş akışını modern web teknolojileriyle yeniden kurgulayarak şu hedeflere ulaşmayı amaçlar:

- **Platform bağımsızlığı** — tarayıcı olan her cihazdan erişilebilirlik
- **Sıfır kurulum** — lokal yazılım yükleme gerektirmez
- **Hasta bazlı iş akışı** — taranan dosyadan braket planına kadar adım adım rehberlik
- **Gerçek zamanlı 3D** — Three.js tabanlı GPU hızlandırmalı görüntüleme

---

## Temel Özellikler

| Özellik | Açıklama | Durum |
|---|---|---|
| STL / OBJ / PLY yükleme | Sürükle-bırak ve dosya seçici desteği | ✅ Çalışıyor |
| 3D görüntüleyici | Orbit, yakınlaştırma, döndürme | ✅ Çalışıyor |
| Perspektif / Ortografik kamera | Üst, ön, yan, alt, perspektif önayar görünümleri | ✅ Çalışıyor |
| 3 Noktalı oklüzal düzlem seçimi | Sağ molar, sol molar, orta hat — plane tanımı | ✅ Çalışıyor |
| Transform gizmo | Tarama modelini öteleme ve döndürme | ✅ Çalışıyor |
| Oklüzal hizalama iş akışı | Centroid → Düzlem seviyeleme → ICP → Doğrulama | 🔄 Kısmen |
| Ark şekli seçimi | Tapered, Ovoid, Square, Round, Auto | ✅ UI Hazır |
| Braket yerleşim planlaması | Slot hizalaması ve görselleştirme | 🔄 Geliştiriliyor |
| Model görünürlük / opaklık / renk | Her çene için ayrı kontrol | ✅ Çalışıyor |
| Sahne parlaklığı | Aydınlatma yoğunluğu kaydırıcısı | ✅ Çalışıyor |
| Wireframe modu | Kafes görünümü | ✅ Çalışıyor |
| Grid göstergesi | Referans ızgarası | ✅ Çalışıyor |

---

## Teknoloji Yığını

```
Frontend Framework : Next.js 16 (App Router)
UI Kütüphanesi    : React 19 + TypeScript 5
3D Motor          : Three.js 0.183 (WebGL)
Stil              : Tailwind CSS v4
İkonlar           : Lucide React
Dil               : TypeScript (strict)
```

### Neden Bu Seçimler?

- **Next.js App Router** — SSR/SSG esnekliği, `dynamic()` ile Three.js'in client-side yüklenmesi
- **Three.js** — WebGL soyutlaması; STL/OBJ/PLY loader'ları, OrbitControls, TransformControls built-in
- **React 19** — `useCallback` + `useRef` ile imperative viewer API'si (zorunlu çünkü Three.js sahnesini React state'ine bağlamak pratik değil)
- **Tailwind v4** — CSS değişkenleri üzerinden açık/koyu tema desteği

---

## Proje Mimarisi

```
src/
├── app/
│   ├── page.tsx              # Root sayfa — OrthoApp'i render eder
│   ├── layout.tsx            # Global HTML iskeleti + font
│   └── globals.css           # CSS değişkenleri (tema renkleri)
│
└── components/
    ├── OrthoApp.tsx          # Ana uygulama kabuğu — tüm state yönetimi burada
    ├── ThreeViewer.tsx       # Three.js 3D görüntüleyici (imperative API)
    ├── OcclusalAlignment.tsx # Oklüzal hizalama paneli + iş akışı adımları
    └── ScanLoader.tsx        # Dosya yükleme UI bileşeni
```

### Durum Yönetimi Stratejisi

```
OrthoApp (merkezi state)
│
├── stage: "load" | "align" | "plan"       — hangi iş akışı adımında?
├── maxillaFile / mandibleFile              — yüklenen tarama dosyaları
├── landmarkCount / occlusalPlane          — 3D'den yukarı taşınan veriler
├── görsel kontroller (wireframe, grid…)
│
├── ThreeViewer (ref ile kontrol edilir)   — imperative API
│   ├── loadMesh()
│   ├── setPickMode() / clearLandmarks()
│   ├── setGizmoMode() / setGizmoAxis()
│   ├── setView() / setOrthographic()
│   └── setMeshVisible() / setMeshOpacity() / setMeshColor()
│
└── OcclusalAlignment (callback'lerle kontrol)
    ├── 3 landmark nokta seçim arayüzü
    ├── Hizalama adım sihirbazı
    └── Gizmo modu / eksen seçimi
```

---

## İş Akışı (Blueprint)

### Aşama 1 — Tarama Yükleme (`load`)

```
Kullanıcı eylemi:
  ┌─────────────────────────────────────┐
  │  Dosya seçici veya sürükle-bırak   │
  │  ┌─────────────┐ ┌──────────────┐  │
  │  │  Maxilla    │ │  Mandibula   │  │
  │  │  (Üst çene) │ │  (Alt çene)  │  │
  │  └─────────────┘ └──────────────┘  │
  │  Desteklenen: STL, OBJ, PLY        │
  └─────────────────────────────────────┘
         │
         ▼
  ThreeViewer.loadMesh(file, jaw)
         │
         ▼
  BufferGeometry hesapla → Mesh oluştur → Sahneye ekle
```

- Maxilla: Sıcak krem rengi (`#fff3e0`)
- Mandibula: Açık mavi rengi (`#e3f2fd`)
- Viewport'a sürükle-bırak yapılırsa çene atama diyaloğu açılır

---

### Aşama 2 — Oklüzal Hizalama (`align`)

```
Adım 1 — 3 Nokta Seçimi
  ┌──────────────────────────────────────┐
  │  Pick Mode Aktif                     │
  │  • Nokta 1: Sağ Molar (R Molar)     │  🔴
  │  • Nokta 2: Sol Molar (L Molar)     │  🟢
  │  • Nokta 3: Orta Hat (11|21)        │  🔵
  └──────────────────────────────────────┘
         │
         ▼  3 nokta seçilince otomatik:
  Oklüzal düzlem hesabı
  (3 nokta → normal vektör → plane mesh)

Adım 2 — Manuel Ayar (isteğe bağlı)
  Transform Gizmo:
  ├── Mod: Öteleme (Translate)
  ├── Mod: Döndürme (Rotate)
  └── Eksen kilidi: X / Y / Z / Serbest

Adım 3 — Hizalama Sihirbazı
  ┌──────────────────────────────────────────┐
  │  1. Centroid Hizalaması      [████░░] 60%│
  │  2. Oklüzal Düzlem Seviyeleme[░░░░░░]  0%│
  │  3. ICP Kaydı                [░░░░░░]  0%│
  │  4. Doğrulama                [░░░░░░]  0%│
  └──────────────────────────────────────────┘

Görünüm önayarları:
  [Perspektif] [Üst] [Ön] [Yan] [Alt]
  [Ortografik mod açma/kapama]
```

---

### Aşama 3 — Braket Planlaması (`plan`)

```
Ark şekli seçimi:
  ┌──────────────────────────────────────┐
  │  Üst çene:  [Ovoid ▼]               │
  │  Alt çene:  [Tapered ▼]             │
  │  □ Her iki çene için aynı şekil     │
  └──────────────────────────────────────┘

Başlangıç çenesi: [Maxilla] [Mandibula]

Braket yerleşimi:
  → Her diş için slot konumu hesapla
  → İdeal ark eğrisine göre hizala
  → WCS/OCS (World/Occlusal Coord. System) dönüşümü

[Planlama sonuçları dışa aktar] → (roadmapte)
```

---

## Bileşenler

### `ThreeViewer.tsx` — 3D Motor

Three.js sahnesini yöneten ana görüntüleyici bileşeni. React dışında tutulup `forwardRef + useImperativeHandle` ile dışarıya bir **imperative API** sunar.

**Imperative API:**

| Metot | Parametre | Açıklama |
|---|---|---|
| `loadMesh` | `(file, jaw)` | Dosyadan geometri yükle ve sahneye ekle |
| `clearMesh` | `(jaw)` | Belirtilen çeneyi sil |
| `resetCamera` | — | Kamerayı başlangıç pozisyonuna döndür |
| `setPickMode` | `"none"\|"landmark"` | Landmark seçim modunu aç/kapat |
| `clearLandmarks` | — | Tüm landmark noktalarını sil |
| `undoLandmark` | — | Son landmark'ı geri al |
| `getOcclusalPlane` | — | Hesaplanan oklüzal düzlemi döndür |
| `setView` | `ViewPreset` | Kamera önayar görünümünü ayarla |
| `setOrthographic` | `boolean` | Perspektif / ortografik kamera geçişi |
| `setGizmoMode` | `"translate"\|"rotate"` | Transform gizmo modu |
| `setGizmoAxis` | `"all"\|"x"\|"y"\|"z"` | Gizmo eksen kilidi |
| `setWireframe` | `boolean` | Kafes görünümü |
| `setMeshVisible` | `(jaw, visible)` | Model görünürlüğü |
| `setMeshOpacity` | `(jaw, opacity)` | Model saydamlığı |
| `setMeshColor` | `(jaw, hex)` | Model rengi |
| `setSceneBrightness` | `number` | Sahne aydınlatma yoğunluğu |

**Desteklenen dosya formatları:**

| Format | Loader |
|---|---|
| `.stl` | `THREE.STLLoader` |
| `.obj` | `THREE.OBJLoader` |
| `.ply` | `THREE.PLYLoader` |

---

### `OrthoApp.tsx` — Ana Kabuk

Tüm uygulama state'ini yöneten ve `ThreeViewer`, `OcclusalAlignment`, `ScanLoader` bileşenlerini bir araya getiren kök bileşen.

**Temel sorumluluklar:**
- Workflow aşama yönetimi (`load → align → plan`)
- Tarama dosyası state'ini tutmak ve viewer'a iletmek
- Oklüzal düzlem verisini viewer'dan alıp `OcclusalAlignment`'a aktarmak
- Sağ kenar çubuğu kontrolleri (görünürlük, opaklık, renk, parlaklık)
- Bildirim sistemi (kısa süreli toast mesajları)

---

### `OcclusalAlignment.tsx` — Hizalama Paneli

Oklüzal düzlem tanımlama ve hizalama sürecini yöneten sol panel bileşeni.

**Adım sistemi:**
1. `centroid` — Sentroid hizalaması
2. `occlusal` — Oklüzal düzlem seviyeleme
3. `icp` — ICP (Iterative Closest Point) ince hizalama
4. `verify` — Artık hata ve temas noktası doğrulaması

**Landmark tanımları:**
- `R Molar` — Sağ birinci molar bukkal tüberkül
- `L Molar` — Sol birinci molar bukkal tüberkül
- `11|21` — Üst santral dişler arası orta hat noktası

---

### `ScanLoader.tsx` — Dosya Yükleyici

Maxilla ve mandibula tarama dosyalarını yönetmek için sürükle-bırak ve dosya seçici arayüzü.

---

## Kurulum ve Çalıştırma

### Gereksinimler

- Node.js 18+
- npm veya yarn

### Adımlar

```bash
# 1. Repoyu klonla
git clone https://github.com/gokhansdortodonti/GSDBRA.git
cd GSDBRA

# 2. Bağımlılıkları yükle
npm install

# 3. Geliştirme sunucusunu başlat
npm run dev

# 4. Tarayıcıda aç
# http://localhost:3000
```

### Diğer Komutlar

```bash
npm run build      # Prodüksiyon derlemesi
npm run start      # Prodüksiyon sunucusu
npm run typecheck  # TypeScript tip denetimi
npm run lint       # ESLint denetimi
```

> **Windows kullanıcıları için:** `start-dev.bat` dosyasını çift tıklayarak geliştirme sunucusunu başlatabilirsiniz.

---

## Geliştirme Yol Haritası

### Kısa Vadeli (Mevcut Sprint)

- [x] STL/OBJ/PLY tarama yükleme
- [x] 3 noktalı oklüzal düzlem seçimi
- [x] Transform gizmo (öteleme + döndürme)
- [x] Ortografik kamera modu
- [x] Model görünürlük / opaklık / renk kontrolleri
- [ ] ICP hizalama algoritması (gerçek implementasyon)
- [ ] Oklüzal temas noktası analizi

### Orta Vadeli

- [ ] Diş numaralandırma (FDI / Universal)
- [ ] Her diş için ayrı braket slot pozisyonu
- [ ] İdeal ark eğrisi görselleştirme
- [ ] Hasta profili ve vaka yönetimi
- [ ] Ölçüm araçları (mesafe, açı)

### Uzun Vadeli

- [ ] Tedavi simülasyonu (tooth movement preview)
- [ ] Raporlama ve PDF dışa aktarma
- [ ] Bulut depolama ve paylaşım
- [ ] DICOM / CBCT entegrasyonu
- [ ] Yapay zeka destekli otomatik diş segmentasyonu

---

## Lisans

Bu proje özel geliştirim aşamasındadır. Lisans bilgisi daha sonra eklenecektir.

---

*OrthoScan Pro — Modern ortodonti için web tabanlı 3D planlama platformu*
