/**
 * 可选能力接口（本轮为清晰的 stub + 优雅降级说明）
 *
 * · 语音（ASR/TTS）：原 Demo 的 asr.ts / aliyun-tts.ts / tts-proxy.cjs 依赖本地代理与
 *   阿里云百炼 Key，迁移成本高；本轮按审计建议只保留接口位与设置说明，
 *   后续可按 VoiceCapability 契约接回（见 docs/ARCHITECTURE.md）。
 * · Web3（Monad NFT）：链上模块完整保留于 mingrate/monad-nft-card-demo（归档），
 *   不进入核心游戏；此处仅定义未来接入的 capability 形状。
 */

export interface VoiceCapability {
  readonly available: boolean;
  reason?: string;
  startListening?: () => Promise<void>;
  stopListening?: () => void;
  speak?: (text: string) => Promise<void>;
  stopSpeaking?: () => void;
}

export const voiceCapability: VoiceCapability = {
  available: false,
  reason: '语音识别与朗读需要本地代理与阿里云百炼密钥；当前版本以文字为主，语音能力已预留接口（见 ARCHITECTURE.md）。',
};

export interface Web3Capability {
  readonly available: boolean;
  reason?: string;
  /** 未来接入：将一张已获得的牌铸造为链上纪念 NFT（可选收藏，不影响游戏状态） */
  mintCard?: (cardId: string) => Promise<{ txHash: string }>;
}

export const web3Capability: Web3Capability = {
  available: false,
  reason: '链上纪念收藏为实验性可选能力。ERC-721 合约与部署脚本已完整归档于 mingrate/monad-nft-card-demo，待后续版本以适配器接入；核心玩法永不依赖钱包。',
};
