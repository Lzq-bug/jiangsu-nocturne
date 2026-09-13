/**
 * mint/collection.ts — 我的收藏面板
 *
 * 从 Monad 链上读取当前钱包持有的 oracle card NFT,
 * 以全屏面板展示,匹配星月占卜的神秘暗色视觉。
 * 最大读取 50 张以避免公共 RPC 过载。
 */
import {
  connectWallet,
  loadCollection,
  watchAsset,
  shortAddress,
  mintErrorMessage,
} from "./chain";
import { isContractConfigured, NETWORK, CONTRACT_ADDRESS } from "./config";

type OwnedCard = {
  tokenId: string;
  cardName: string;
  rarity: string;
  tagline: string;
  image: string;
};

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

const RARITY_GRADIENT: Record<string, string> = {
  Common:   "linear-gradient(145deg,#1e1e28,#0a0a10)",
  Rare:     "linear-gradient(145deg,#15222e,#060d16)",
  Epic:     "linear-gradient(145deg,#1e1528,#0d0714)",
  Legendary:"linear-gradient(145deg,#281e10,#140e04)",
};

function rarityGradient(r: string): string {
  return RARITY_GRADIENT[r] ?? RARITY_GRADIENT.Common;
}

function rarityBorder(r: string): string {
  const map: Record<string, string> = { Common:"#94a3b8", Rare:"#38bdf8", Epic:"#c084fc", Legendary:"#fbbf24" };
  return map[r] ?? "#555";
}

let styleInjected = false;

function ensureStyle(): void {
  if (styleInjected) return;
  styleInjected = true;
  const s = document.createElement("style");
  s.textContent = `
  .col-overlay{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;
    background:rgba(8,3,20,.72);backdrop-filter:blur(10px);opacity:0;transition:opacity .28s}
  .col-overlay.col-show{opacity:1}
  .col-sheet{width:min(96vw,900px);max-height:88vh;overflow-y:auto;border-radius:24px;
    background:linear-gradient(160deg,#1c1038,#0e0620);border:1px solid rgba(198,129,241,.22);
    box-shadow:0 30px 100px rgba(0,0,0,.6),0 0 60px rgba(100,60,200,.12) inset;
    color:#ede7ff;font-family:"Noto Sans SC",system-ui,sans-serif;
    padding:28px 22px 22px;transform:translateY(12px) scale(.97);
    transition:transform .32s cubic-bezier(.2,.9,.2,1)}
  .col-overlay.col-show .col-sheet{transform:none}
  .col-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
  .col-title{font-size:19px;font-weight:700;letter-spacing:.02em}
  .col-close{width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.06);
    color:#c9bfe6;font-size:18px;cursor:pointer;display:grid;place-items:center}
  .col-close:hover{background:rgba(255,255,255,.12)}
  .col-meta{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;
    font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:.74rem;color:#a99cc9}
  .col-meta span{padding:5px 10px;border-radius:999px;border:1px solid rgba(198,129,241,.18);background:rgba(255,255,255,.03)}
  .col-connect{display:grid;place-items:center;min-height:240px;gap:14px}
  .col-connect p{color:#a99cc9;font-size:13.5px}
  .col-btn{padding:11px 24px;border-radius:12px;border:0;cursor:pointer;
    font-size:14px;font-weight:700;font-family:inherit;color:#fff;
    background:linear-gradient(135deg,#8b5cf6,#c084fc);transition:filter .2s}
  .col-btn:hover{filter:brightness(1.1)}
  .col-btn:disabled{cursor:not-allowed;opacity:.55}
  .col-empty{display:grid;place-items:center;min-height:180px;gap:10px;color:#a99cc9}
  .col-empty-icon{font-size:42px}
  .col-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
  .col-item{overflow:hidden;border-radius:16px;border:1px solid;transition:transform .15s}
  .col-item:hover{transform:translateY(-2px)}
  .col-item img,.col-item-placeholder{display:block;width:100%;aspect-ratio:5/7;object-fit:cover}
  .col-item-placeholder{display:grid;place-items:center;font-size:36px;color:rgba(255,255,255,.08)}
  .col-item-body{padding:13px}
  .col-item-name{font-size:14px;font-weight:700;margin-bottom:4px}
  .col-item-rarity{display:inline-block;padding:2px 8px;border-radius:999px;font-size:10.5px;font-weight:800;color:#09090b}
  .col-item-line{margin:8px 0;font-size:12px;color:#b3a7d1;line-height:1.45}
  .col-item-foot{display:flex;align-items:center;justify-content:space-between;padding-top:8px;
    border-top:1px solid rgba(255,255,255,.06);font-size:11px}
  .col-item-foot a,.col-item-foot button{color:#c4b5fd;font-size:11px;font-weight:700;background:none;border:0;cursor:pointer;font-family:inherit;padding:0}
  .col-item-foot a:hover,.col-item-foot button:hover{color:#e9d5ff}
  .col-item-tid{color:#717182}
  .col-status{margin-top:10px;font-size:12px;color:#a99cc9;text-align:center}
  `;
  document.head.appendChild(s);
}

/** 打开"我的收藏"面板。返回一个 remove 函数,调用即可关闭。 */
export function showCollectionPanel(): () => void {
  ensureStyle();

  const overlay = document.createElement("div");
  overlay.className = "col-overlay";
  overlay.innerHTML = `
    <div class="col-sheet" role="dialog" aria-modal="true">
      <div class="col-head">
        <div class="col-title">✦ 我的收藏</div>
        <button class="col-close" type="button" aria-label="关闭">&times;</button>
      </div>
      <div class="col-meta">
        <span>${NETWORK.name}</span>
        <span>Chain ${NETWORK.chainId}</span>
        ${isContractConfigured() ? `<span>${shortAddress(CONTRACT_ADDRESS)}</span>` : "<span>合约未配置</span>"}
      </div>
      <div class="col-body"></div>
      <div class="col-status"></div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("col-show"));

  const body = overlay.querySelector<HTMLElement>(".col-body")!;
  const status = overlay.querySelector<HTMLElement>(".col-status")!;

  // 初始渲染连接提示
  renderConnectHint(body, () => void doLoadCollection(body, status));

  const close = () => {
    overlay.classList.remove("col-show");
    setTimeout(() => overlay.remove(), 300);
  };
  overlay.querySelector(".col-close")!.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

  return close;
}

function renderConnectHint(body: HTMLElement, onConnect: () => void): void {
  body.innerHTML = `
    <div class="col-connect">
      <div class="col-empty-icon">🌙</div>
      <p>连接 MetaMask 后，星月将为你读取链上收藏。</p>
      <button class="col-btn" type="button">连接钱包</button>
    </div>`;
  body.querySelector("button")!.addEventListener("click", onConnect);
}

async function doLoadCollection(body: HTMLElement, status: HTMLElement): Promise<void> {
  const btn = body.querySelector<HTMLButtonElement>(".col-btn");
  if (btn) { btn.disabled = true; btn.textContent = "连接中…"; }
  status.textContent = "";

  try {
    await connectWallet();

    if (!isContractConfigured()) {
      body.innerHTML = `<div class="col-empty"><div class="col-empty-icon">⛓</div><p>尚未配置合约地址（VITE_CONTRACT_ADDRESS），无法读取链上收藏。</p></div>`;
      return;
    }

    body.innerHTML = `<div class="col-empty"><div class="col-empty-icon">⏳</div><p>正在从 Monad 链上读取收藏……</p></div>`;
    const result = await loadCollection();

    const totalStr = result.total > 50 ? `最多显示 50 / 共 ${result.total} 张` : `共 ${result.total} 张`;
    status.textContent = `${shortAddress(result.account)} · ${totalStr}`;

    if (result.cards.length === 0) {
      body.innerHTML = `
        <div class="col-empty">
          <div class="col-empty-icon">◇</div>
          <p>收藏还是一片空白。</p>
          <p style="font-size:12px;color:#8a7fa6">完成一次占卜后，铸造第一张 oracle card。</p>
        </div>`;
      return;
    }

    renderCards(body, result.cards);
  } catch (error) {
    body.innerHTML = `
      <div class="col-empty">
        <div class="col-empty-icon">⚠</div>
        <p>${esc(mintErrorMessage(error))}</p>
      </div>`;
  }
}

function renderCards(body: HTMLElement, cards: OwnedCard[]): void {
  const grid = document.createElement("div");
  grid.className = "col-grid";

  for (const c of cards) {
    const item = document.createElement("div");
    item.className = "col-item";
    item.style.background = rarityGradient(c.rarity);
    item.style.borderColor = rarityBorder(c.rarity);

    const imgPart = c.image
      ? `<img src="${esc(c.image)}" alt="${esc(c.cardName)}" loading="lazy" />`
      : `<div class="col-item-placeholder">🔮</div>`;

    const explorerUrl = `${NETWORK.explorerUrl}/token/${CONTRACT_ADDRESS}?a=${c.tokenId}`;
    const rarityBg = rarityBorder(c.rarity);

    item.innerHTML = `
      ${imgPart}
      <div class="col-item-body">
        <div class="col-item-name">${esc(c.cardName)}</div>
        <span class="col-item-rarity" style="background:${rarityBg}">${esc(c.rarity)}</span>
        <div class="col-item-line">${esc(c.tagline)}</div>
        <div class="col-item-foot">
          <span class="col-item-tid">#${esc(c.tokenId)}</span>
          <a href="${explorerUrl}" target="_blank" rel="noreferrer">浏览器 ↗</a>
          <button type="button" class="col-watch-btn">添加钱包</button>
        </div>
      </div>`;

    item.querySelector<HTMLButtonElement>(".col-watch-btn")!.addEventListener("click", (e) => {
      e.preventDefault();
      void watchAsset(c.tokenId).then((added) => {
        const b = e.target as HTMLButtonElement;
        b.textContent = added ? "已添加 ✓" : "重试";
      });
    });

    grid.appendChild(item);
  }

  body.innerHTML = "";
  body.appendChild(grid);
}
