/**
 * mint/config.ts — Monad 链上铸造配置
 *
 * 从 monad-nft-card-demo 移植:网络参数、MonadCardNFT ABI、合约地址(来自 Vite env)。
 * 保持与 demo 合约完全一致的接口,占卜结尾即可直接铸造。
 */

export type NetworkKey = "testnet" | "mainnet";

export interface NetworkConfig {
  key: NetworkKey;
  name: string;
  chainId: number;
  chainIdHex: `0x${string}`;
  rpcUrl: string;
  explorerUrl: string;
  currencySymbol: string;
}

export const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  testnet: {
    key: "testnet",
    name: "Monad Testnet",
    chainId: 10143,
    chainIdHex: "0x279f",
    rpcUrl: "https://testnet-rpc.monad.xyz",
    explorerUrl: "https://testnet.monadvision.com",
    currencySymbol: "MON",
  },
  mainnet: {
    key: "mainnet",
    name: "Monad Mainnet",
    chainId: 143,
    chainIdHex: "0x8f",
    rpcUrl: "https://rpc.monad.xyz",
    explorerUrl: "https://monadvision.com",
    currencySymbol: "MON",
  },
};

const configuredNetwork = (import.meta.env.VITE_NETWORK || "testnet") as NetworkKey;

export const NETWORK: NetworkConfig = NETWORKS[configuredNetwork] || NETWORKS.testnet;

/** 已部署合约地址;为空字符串时链上铸造功能优雅降级。 */
export const CONTRACT_ADDRESS: string = (import.meta.env.VITE_CONTRACT_ADDRESS || "").trim();

/** 与 MonadCardNFT.sol 完全一致的最小 ABI(铸造 + 只读 + 事件/错误)。 */
export const CARD_NFT_ABI = [
  "function mintCard(string cardName, string rarity, string tagline) payable returns (uint256 tokenId)",
  "function getCard(uint256 tokenId) view returns ((string cardName, string rarity, string tagline))",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function mintPrice() view returns (uint256)",
  "function maxMintsPerWallet() view returns (uint256)",
  "function mintedBy(address minter) view returns (uint256)",
  "function owner() view returns (address)",
  "error IncorrectMintPayment(uint256 required, uint256 received)",
  "error WalletMintLimitReached(uint256 limit)",
  "event CardMinted(address indexed owner, uint256 indexed tokenId, string cardName, string rarity, string tagline)",
] as const;

/** 合约铸造价格兜底(0.00145 MON),仅在链上读取失败时用于展示。 */
export const DEFAULT_MINT_PRICE = 1_450_000_000_000_000n;

/** agent 使用的中文稀有度 → 合约链上 SVG 认可的英文稀有度。 */
const RARITY_CN_TO_EN: Record<string, string> = {
  普通: "Common",
  稀有: "Rare",
  史诗: "Epic",
  传说: "Legendary",
};

export function toContractRarity(rarityCn: string): string {
  return RARITY_CN_TO_EN[rarityCn.trim()] ?? "Rare";
}

/** 合约字段字节上限(与 MonadCardNFT.sol 一致),用于铸造前截断保护。 */
export const FIELD_LIMITS = { cardName: 72, rarity: 32, tagline: 180 } as const;

/** 按 UTF-8 字节长度截断,避免中文超出合约限制导致 revert。 */
export function clampBytes(input: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(input).length <= maxBytes) return input;
  let out = input;
  while (out.length > 0 && encoder.encode(out).length > maxBytes) {
    out = out.slice(0, -1);
  }
  return out;
}

export function isContractConfigured(): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);
}
