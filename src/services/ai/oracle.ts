/**
 * 星语 AI 服务（可选能力）
 * 核心游戏完全不依赖本模块。没有 Key 时上层应使用本地解读（localReading）。
 * LLM 只产文本，绝不拥有游戏状态写权限。
 */
import type { CardData } from '@/tarot/types';

export interface WhisperRequest {
  question: string;
  cards: CardData[];
  apiKey: string;
  baseUrl: string;
  modelId: string;
}

const SYSTEM_PROMPT = `你是「宵月秘藏」里的守匣魔女：温柔、神秘、言简而意深。
用户会给你一个困惑与三张已抽出的塔罗牌（含关键词与含义）。
请用中文回复：先一句话回应提问者本人，再逐张轻声解读（每张 1-2 句，须引用牌面关键词），
最后给一段 2-3 句的综合指引。总长不超过 260 字。语气诗性但不玄虚，禁止编造牌面之外的信息。`;

export function localReading(question: string, cards: CardData[]): string {
  const lines: string[] = [];
  lines.push(`你问：「${question.trim()}」——魔女听见了。`);
  cards.forEach((c, i) => {
    lines.push(`${['一', '二', '三'][i]}曰 ${c.nameZh}：${c.oracle} ${c.keywords.join('、')}——${c.arcana === 'major' ? c.meaning : c.keywords.join('、')}。`);
  });
  lines.push('三张牌连起来看：问题不在远方，而在你此刻愿意先迈出的那一步。把牌面留给夜，把行动留给白天。');
  lines.push('——魔女手记 · 本地星语');
  return lines.join('\n');
}

/** 调用 DeepSeek 兼容接口增强解读；任何失败抛错，由上层优雅降级到本地解读 */
export async function whisperWithAI(req: WhisperRequest, signal?: AbortSignal): Promise<string> {
  if (!req.apiKey.trim()) throw new Error('未配置 API Key');
  const cardDesc = req.cards
    .map((c) => `${c.nameZh}（${c.keywords.join('、')}；${c.meaning}）`)
    .join('；');
  const url = `${req.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${req.apiKey.trim()}`,
    },
    signal,
    body: JSON.stringify({
      model: req.modelId || 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `我的困惑：${req.question}\n抽到的三张牌：${cardDesc}` },
      ],
      temperature: 0.9,
      max_tokens: 600,
      stream: false,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`AI 服务返回 ${resp.status}${text ? `：${text.slice(0, 120)}` : ''}`);
  }
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('AI 未返回内容');
  return content;
}
