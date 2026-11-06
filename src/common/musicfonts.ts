import { asset } from "./asset";

// 注册 Bravura 与 Bravura Text @font-face（替代 styles.css 里的静态声明），按 Vite base
// 解析字体 URL。和弦内的 csym 字形必须走真实 Text 变体，不能用普通 Bravura 等比模拟。
// Text 变体用的是只含 6 个 csym 字形的子集 BravuraText.otf（2.6 KB）。**别换回完整的那份**：
// 从前随仓库带的 BravuraText.woff2 浏览器根本加载不了（OTS：cmap 末段不是 0xFFFF-0xFFFF，
// Chromium/Edge 一律拒绝，`FontFace.load()` 抛 SyntaxError，boot 一路失败），
// 何况整份 500 KB 只为这 6 个字形也不值得。子集的 advance/bbox 与原字体逐字形相同。
export async function registerBravura() {
  if (typeof FontFace === "undefined") return;
  const faces = [
    new FontFace("Bravura", `url(${asset("redist/Bravura.woff2")}) format("woff2")`),
    new FontFace("Bravura Text", `url(${asset("redist/BravuraText.otf")}) format("opentype")`),
  ];
  await Promise.all(faces.map((face) => face.load()));
  for (const face of faces) (document.fonts as FontFaceSet).add(face);
}

