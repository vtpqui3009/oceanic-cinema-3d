# Abyssal Light — Oceanic Cinema 3D

Một "thước phim tài liệu" 3D về sinh vật biển sâu phát quang, dựng bằng
Vite + React + TypeScript + React Three Fiber.

> **Trạng thái: Bước 1 / 5** — scene demo cảnh IV (vực thẳm): cá câu vực thẳm,
> dàn đèn 3 điểm với đèn mồi phát quang làm key light, bóng đổ mềm.

## Chạy

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # bản production trong dist/
```

Tham số URL hữu ích khi duyệt:

- `?quality=low` / `?quality=high` — ép cấu hình di động / desktop
- `?autorotate=0` — tắt tự xoay camera

## Stack

| Việc                   | Thư viện                                          |
| ---------------------- | ------------------------------------------------- |
| Render                 | three r186, @react-three/fiber 9                  |
| Helper                 | @react-three/drei 10 (Environment, ContactShadows, useGLTF, useAnimations, useProgress…) |
| Hậu kỳ (bước 4)        | @react-three/postprocessing 3 + postprocessing 6  |
| Camera theo scroll (bước 2) | GSAP 3 + ScrollTrigger                       |
| State                  | Zustand 5                                         |

## Cấu trúc

```
src/
  creatures/
    CreatureModel.tsx          # loader .glb chung: chuẩn hoá scale, shadow, crossfade clip
    anglerfish/
      buildAnglerfish.ts       # cá câu procedural có bộ xương (skinned mesh)
      Anglerfish.tsx           # chọn .glb của người dùng hoặc bản procedural + animation
  lib/
    noise.ts                   # Perlin 3D, fBm, ridged, profile spline
    geometry.ts                # taperedTube (ống thuôn theo đường cong), fanFin (vây xếp nếp)
    textures.ts                # bake map PBR trên CPU: da, vây, emissive mồi, trầm tích
    bioluminescence.ts         # hàm nhịp sáng sinh học + registry nguồn sáng
    models.ts                  # danh sách sinh vật + tra cứu .glb người dùng
    useProcedural.ts           # build asset procedural trong Suspense + báo tiến độ
  scene/
    Experience.tsx             # Canvas, renderer, shadow map
    AbyssScene.tsx             # cảnh IV: dàn đèn key/fill/rim, sàn, phù du
    BioLight.tsx               # PointLight phát quang: nhấp nháy, đổ bóng mềm
    DeepEnvironment.tsx        # environment map xanh sâu (HDR cube dựng bằng Lightformer)
    Seabed.tsx                 # đáy biển displace + đá procedural
    MarineSnow.tsx             # tuyết biển: điểm GPU sáng lên gần nguồn phát quang + mảnh vụn nhận bóng
  state/                       # Zustand: scene/chất lượng/reduced-motion, tiến độ tải
  ui/                          # Loader (tiến độ thật), HUD, bảng duyệt ánh sáng
```

## Model 3D & license

Mạng của môi trường dựng chỉ truy cập được GitHub/npm (Sketchfab, Poly Haven,
Quaternius bị chặn), và không có mô hình cá câu/sứa/mực CC0 nào tải được từ
đó. Vì vậy các sinh vật được **tự dựng bằng procedural geometry nâng cao**
(không phải hình khối cơ bản):

- **Cá câu vực thẳm** — một bề mặt loft liên tục đi từ da ngoài → môi cuộn →
  khoang miệng → họng kín (miệng mở có chiều sâu thật). Silhouette theo
  spline đơn điệu, displace hữu cơ bằng fBm + ridged noise. Bộ xương sinh tự
  động (5 đốt sống + hàm) với trọng số skin mượt. Răng/cần câu/sợi phát quang
  là `taperedTube` theo đường cong Bézier/Catmull-Rom; vây là màng xếp nếp
  theo tia vây với alpha map rách mép; bầu mồi là `LatheGeometry` hình giọt.
- Vật liệu `MeshPhysicalMaterial`: da có clearcoat (nhớt ướt) + sheen (nhung)
  + normal/roughness map bake procedural; vây, răng và bầu mồi dùng
  `transmission + thickness + attenuationColor` để giả lập tán xạ dưới bề mặt;
  bầu mồi có **emissive map riêng** (lõi phát quang + mạch dẫn sáng).

Nguồn model đã xác định cho các bước sau:

| Sinh vật           | Nguồn                                                                 | License |
| ------------------ | --------------------------------------------------------------------- | ------- |
| Cá nhỏ (cảnh 1)    | [BarramundiFish — Khronos glTF-Sample-Assets](https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/BarramundiFish) (Microsoft) | CC0 1.0 |
| Cá câu, sứa, mực   | Procedural (dự án này)                                                | —       |
| Environment map    | Procedural (Lightformer → cube map HDR)                               | —       |

### Dùng model .glb của bạn

Thả file vào `public/models/` với tên trùng id sinh vật — scene tự load và
thay model mặc định (dev server tự reload khi thêm/xoá file):

| File              | Sinh vật                 |
| ----------------- | ------------------------ |
| `anglerfish.glb`  | Cá câu vực thẳm (cảnh 4) |
| `jellyfish.glb`   | Sứa (cảnh 2)             |
| `squid.glb`       | Mực khổng lồ (cảnh 3)    |
| `fish.glb`        | Cá trong đàn (cảnh 1)    |

Model được tự chuẩn hoá kích thước, bật `castShadow/receiveShadow`, phát
animation clip khớp `swim|idle|move` (crossfade). Nếu model có node tên chứa
`lure|esca|glow|light|bulb`, đèn phát quang sẽ gắn vào node đó.

## Ánh sáng & bóng

- `renderer.shadowMap.enabled = true`. **Lưu ý:** three r182+ đã bỏ
  `PCFSoftShadowMap` (gán vào sẽ bị cảnh báo và tự chuyển sang
  `PCFShadowMap`). `PCFShadowMap` hiện lọc mềm bằng Vogel-disk theo
  `shadow.radius`, nên dự án dùng trực tiếp `PCFShadowMap` + `shadow.radius`
  để có bóng mềm.
- Key light = `PointLight` nằm **bên trong bầu mồi**, nhấp nháy theo nhịp sinh
  học (`bioPulse`), đổ bóng mềm (cube shadow map). Fill xanh lạnh không đổ
  bóng; rim ngược sáng xanh đậm có đổ bóng. `ContactShadows` dưới sinh vật.
