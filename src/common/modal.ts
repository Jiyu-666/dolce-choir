/** 模态框的底座：遮罩 + 盒（标题 / 内容 / 页脚）、Esc 与点遮罩关闭。按钮与内容由调用方给。
 *  `close` 可重复调用，`onClose` 只回一次（不论是按钮、Esc 还是点遮罩关的）。 */
export function openModal(opts: {
  title: string;
  /** `modal-box` 之外再加的类（定宽、定高之类）。 */
  boxClass?: string;
  titleId?: string;
  body: readonly HTMLElement[];
  footer: readonly HTMLElement[];
  onClose?: () => void;
}): { overlay: HTMLElement; close: () => void } {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  const box = document.createElement("div");
  box.className = opts.boxClass ? `modal-box ${opts.boxClass}` : "modal-box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  const h = document.createElement("div");
  h.className = "modal-title";
  h.textContent = opts.title;
  if (opts.titleId) {
    h.id = opts.titleId;
    box.setAttribute("aria-labelledby", h.id);
  }
  const footer = document.createElement("div");
  footer.className = "modal-footer";
  footer.append(...opts.footer);
  box.append(h, ...opts.body, footer);
  overlay.append(box);
  document.body.append(overlay);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    document.removeEventListener("keydown", onKeyDown);
    opts.onClose?.();
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") close();
  };
  document.addEventListener("keydown", onKeyDown);
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  return { overlay, close };
}

