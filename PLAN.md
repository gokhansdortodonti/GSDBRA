# ICP Alignment Implementation Plan

## Mevcut Durum

`autoOcclusalPlane.ts` oklüzal düzlemi tek geçişte (PCA) buluyor:
- Brute-force en yakın nokta çiftleri → ağırlıklı midpoint'ler → PCA → normal

ICP adımı UI'da görünüyor ama implement edilmemiş.

## Hedef

Gerçek bir **Point-to-Point ICP** algoritması ekle:
1. `src/core/ICP.ts` → bağımsız ICP modülü (SVD tabanlı optimal transform)
2. `src/components/autoOcclusalPlane.ts` → ICP entegrasyonu
3. `src/components/ThreeViewer.tsx` → progress callback desteği
4. `src/components/OcclusalAlignment.tsx` → ICP adımı progress göster

---

## Dosya Değişiklikleri

### 1. `src/core/ICP.ts` (YENİ DOSYA, ~280 satır)

```
Interfaces:
  ICPResult { rotation: THREE.Quaternion, translation: THREE.Vector3, rmsError, iterations, converged }
  ICPOptions { maxIterations=50, tolerance=1e-6, trimFraction=0.08, maxPoints=2000 }

Fonksiyonlar:
  - subsamplePoints(pts, maxCount) → Float32Array
  - findClosestPoints(src, tgt) → pairs sorted by distance
  - computeOptimalTransform(srcPts, tgtPts) → { R (Quaternion), t (Vector3) }
      • centroid hesapla: μ_src, μ_tgt
      • cross-covariance H = Σ (p_i - μ_src)^T (q_i - μ_tgt)
      • SVD via H^T H eigendecomp → V, ardından U = H V S^-1
      • R = V U^T  (det kontrolü ile)
      • t = μ_tgt - R * μ_src
  - applyTransform(pts, R, t) → transformed Float32Array
  - runICP(sourcePts, targetPts, options) → ICPResult
      • Loop: findClosest → trim outliers → computeTransform → apply → MSE check
      • Convergence: |MSE_prev - MSE_curr| < tolerance
```

### 2. `src/components/autoOcclusalPlane.ts` (GÜNCELLEME, ~50 satır eklenti)

```typescript
export interface AutoPlaneResultWithICP extends AutoPlaneResult {
  icpResult?: { rmsError: number; iterations: number; converged: boolean };
}

export function computeAutoOcclusalPlaneWithICP(
  maxillaGeom: THREE.BufferGeometry,
  mandibleGeom: THREE.BufferGeometry,
  onProgress?: (step: 'plane' | 'icp', progress: number) => void
): AutoPlaneResultWithICP
```

İç akış:
1. Mevcut `computeAutoOcclusalPlane()` → ilk düzlem tahmini
2. ICP refinement: mandible'ı source, maxilla'yı target olarak kullan
3. ICP result'tan rotation uygula → yeni centroid hesapla
4. Final normal/center döndür + ICP meta verisi

### 3. `src/components/ThreeViewer.tsx` (KÜÇÜK GÜNCELLEME)

`computeAutoOcclusalPlane()` imperative method'unda:
- `computeAutoOcclusalPlaneWithICP()` çağır (mevcut fonksiyon yerine)
- `onProgress` callback'ini OrthoApp'e köprüle

### 4. `src/components/OcclusalAlignment.tsx` (KÜÇÜK UI GÜNCELLEMESİ)

Hesaplama butonu altına ICP progress bar veya adım göstergesi:
```
[Düzlem Tespiti ✓] → [ICP Refinement ...]
```
`autoComputeStatus` state'i genişletilecek veya yeni `icpProgress` prop eklenir.

### 5. `src/components/OrthoApp.tsx` (KÜÇÜK GÜNCELLEME)

ICP progress bilgisini state'de tutmak için güncelleme.

---

## Algoritma Detayı (ICP)

```
Input: source (mandible vertices), target (maxilla vertices)
Output: rotation R, translation t

Başlangıç:
  src = subsample(source, 2000)
  tgt = subsample(target, 2000)
  cumR = identity, cumT = zero

Her iterasyon:
  1. Her src[i] için tgt'de en yakın noktayı bul
  2. Pairs'leri distance'a göre sırala, en yakın %8'i tut (trimmed ICP)
  3. Optimal (R, t) hesapla (SVD yöntemi):
       H = Σ (src_i - μ_src)(tgt_i - μ_tgt)^T
       [U, S, V] = SVD(H)
       R = V U^T   (det(R) < 0 ise V son sütununu negate et)
       t = μ_tgt - R * μ_src
  4. src = apply(R, t, src)
  5. cumR = R * cumR, cumT = R * cumT + t
  6. rms = sqrt(mean(dist^2))
  7. |rms_prev - rms| < 1e-6 → converged, dur

Return: cumR (Quaternion), cumT (Vector3), rmsError, iterations, converged
```

---

## Kapsam Dışı (Bu PR'da yapılmayacak)

- Mandible'ı maxilla'dan ayrı hareket ettirme (scene graph refactor gerektirir)
- KD-tree ile hız optimizasyonu (2000 nokta için brute-force yeterli)
- ICP parametrelerini UI'dan ayarlama
