/**
 * mint/chain.ts — Monad 链上铸造控制器
 *
 * 封装 ethers 与 MetaMask 的所有交互,供占卜结尾的 mint 卡片与"我的收藏"页复用:
 *   - connectWallet:请求授权 + 切换到 Monad 网络
 *   - mintCard:支付 mintPrice 铸造,解析 CardMinted 事件拿 tokenId
 *   - watchAsset:请求 MetaMask 展示该 NFT
 *   - loadCollection:从链上读取当前钱包持有的 oracle card
 *
 * 全部为纯逻辑,不触碰 DOM;UI 层(session.ts / collection.ts)通过回调渲染。
 */
import {
  BrowserProvider,
  Contract,
  Interface,
  formatEther,
  type ContractTransactionReceipt,
} from "ethers";
import {
  CARD_NFT_ABI,
  CONTRACT_ADDRESS,
  DEFAULT_MINT_PRICE,
  NETWORK,
  clampBytes,
  FIELD_LIMITS,
  isContractConfigured,
} from "./config";

export interface MintInput {
  cardName: string;
  rarity: string; // 已映射为英文
  tagline: string;
}

export interface MintResult {
  tokenId: string | null;
  txHash: string;
  explorerTxUrl: string;
}

export interface OwnedCard {
  tokenId: string;
  cardName: string;
  rarity: string;
  tagline: string;
  image: string;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export { formatEther, isContractConfigured, NETWORK };

/** 把各种钱包/合约错误翻译成用户可读的中文。 */
export function mintErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      code?: number;
      shortMessage?: string;
      reason?: string;
      message?: string;
      info?: { error?: { message?: string } };
    };
    if (candidate.code === 4001) return "你取消了钱包操作。";
    const message =
      candidate.shortMessage ||
      candidate.reason ||
      candidate.info?.error?.message ||
      candidate.message ||
      "发生未知错误";
    if (message.includes("WalletMintLimitReached")) return "该钱包已达到累计铸造上限。";
    if (message.includes("IncorrectMintPayment")) return "发送的铸造费用与合约价格不一致。";
    if (message.includes("insufficient funds")) return "钱包中的 MON 不足以支付铸造费和 Gas。";
    return message;
  }
  return String(error);
}

function requireEthereum(): EthereumProvider {
  if (!window.ethereum) throw new Error("未检测到 MetaMask,请先安装浏览器钱包扩展。");
  return window.ethereum;
}

/** 确保钱包处于目标 Monad 网络,必要时请求添加。 */
async function ensureMonadNetwork(): Promise<void> {
  const ethereum = requireEthereum();
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: NETWORK.chainIdHex }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw error;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: NETWORK.chainIdHex,
          chainName: NETWORK.name,
          nativeCurrency: { name: NETWORK.currencySymbol, symbol: NETWORK.currencySymbol, decimals: 18 },
          rpcUrls: [NETWORK.rpcUrl],
          blockExplorerUrls: [NETWORK.explorerUrl],
        },
      ],
    });
  }
}

/** 请求授权并切换网络,返回已连接的地址。 */
export async function connectWallet(): Promise<string> {
  const ethereum = requireEthereum();
  const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
  await ensureMonadNetwork();
  return accounts[0] || "";
}

/** 读取当前已连接地址(不触发授权弹窗)。 */
export async function getConnectedAccount(): Promise<string> {
  if (!window.ethereum) return "";
  try {
    const accounts = (await window.ethereum.request({ method: "eth_accounts" })) as string[];
    return accounts[0] || "";
  } catch {
    return "";
  }
}

/** 读取铸造价格(失败时回退默认值)。 */
export async function readMintPrice(): Promise<bigint> {
  if (!window.ethereum || !isContractConfigured()) return DEFAULT_MINT_PRICE;
  try {
    const provider = new BrowserProvider(window.ethereum as never);
    const contract = new Contract(CONTRACT_ADDRESS, CARD_NFT_ABI, provider);
    return (await contract.mintPrice()) as bigint;
  } catch {
    return DEFAULT_MINT_PRICE;
  }
}

function extractMintedTokenId(receipt: ContractTransactionReceipt): string | null {
  const iface = new Interface(CARD_NFT_ABI);
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "CardMinted") return parsed.args.tokenId.toString();
    } catch {
      // 忽略其他合约日志
    }
  }
  return null;
}

/**
 * 执行链上铸造:精确支付 mintPrice,等待确认,解析 tokenId。
 * 调用前必须已连接钱包。字段按合约字节上限截断保护。
 */
export async function mintCard(input: MintInput): Promise<MintResult> {
  const ethereum = requireEthereum();
  if (!isContractConfigured()) {
    throw new Error("尚未配置合约地址(VITE_CONTRACT_ADDRESS),无法链上铸造。");
  }
  await ensureMonadNetwork();

  const provider = new BrowserProvider(ethereum as never);
  const signer = await provider.getSigner();
  const contract = new Contract(CONTRACT_ADDRESS, CARD_NFT_ABI, signer);

  const price = (await contract.mintPrice()) as bigint;
  const cardName = clampBytes(input.cardName.trim() || "Oracle", FIELD_LIMITS.cardName);
  const rarity = clampBytes(input.rarity.trim() || "Rare", FIELD_LIMITS.rarity);
  const tagline = clampBytes(input.tagline.trim() || "命运的回声。", FIELD_LIMITS.tagline);

  const transaction = await contract.mintCard(cardName, rarity, tagline, { value: price });
  const txHash: string = transaction.hash;
  const receipt = (await transaction.wait()) as ContractTransactionReceipt;
  const tokenId = extractMintedTokenId(receipt);

  return { tokenId, txHash, explorerTxUrl: `${NETWORK.explorerUrl}/tx/${txHash}` };
}

/** 请求 MetaMask 把该 NFT 加入钱包展示。 */
export async function watchAsset(tokenId: string): Promise<boolean> {
  if (!window.ethereum || !isContractConfigured()) return false;
  try {
    return Boolean(
      await window.ethereum.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC721",
          options: { address: CONTRACT_ADDRESS, tokenId },
        } as unknown as Record<string, unknown>,
      }),
    );
  } catch {
    return false;
  }
}

function decodeMetadataImage(tokenUri: string): string {
  const marker = "data:application/json;base64,";
  if (!tokenUri.startsWith(marker)) return "";
  try {
    const bytes = Uint8Array.from(atob(tokenUri.slice(marker.length)), (c) => c.charCodeAt(0));
    const meta = JSON.parse(new TextDecoder().decode(bytes)) as { image?: string };
    return meta.image || "";
  } catch {
    return "";
  }
}

export interface CollectionResult {
  account: string;
  total: number;
  cards: OwnedCard[];
}

/** 从链上读取当前钱包持有的 oracle card(最多 50 张,避免公共 RPC 过载)。 */
export async function loadCollection(): Promise<CollectionResult> {
  const account = await getConnectedAccount();
  if (!account) throw new Error("请先连接钱包。");
  if (!isContractConfigured()) throw new Error("尚未配置合约地址(VITE_CONTRACT_ADDRESS)。");
  await ensureMonadNetwork();

  const provider = new BrowserProvider(requireEthereum() as never);
  const contract = new Contract(CONTRACT_ADDRESS, CARD_NFT_ABI, provider);
  const balance = (await contract.balanceOf(account)) as bigint;
  const total = Number(balance);
  const visible = Math.min(total, 50);
  const cards: OwnedCard[] = [];

  for (let index = 0; index < visible; index += 1) {
    const tokenId = await contract.tokenOfOwnerByIndex(account, index);
    const card = await contract.getCard(tokenId);
    const tokenUri = (await contract.tokenURI(tokenId)) as string;
    cards.push({
      tokenId: tokenId.toString(),
      cardName: card.cardName ?? card[0],
      rarity: card.rarity ?? card[1],
      tagline: card.tagline ?? card[2],
      image: decodeMetadataImage(tokenUri),
    });
  }

  return { account, total, cards: cards.reverse() };
}
