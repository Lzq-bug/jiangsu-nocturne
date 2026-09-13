// src/asr.ts — 阿里云百炼 Paraformer 语音识别
//
// 浏览器录音(webm/opus)→ 本地 /api/asr 代理 → 阿里云百炼 Paraformer 录音文件识别 → 转写文本。
// 同时通过 onLevel 回调驱动光环语音电平,统一占用唯一的麦克风流,避免与识别互相争抢。
//
// 为什么不用 Web Speech API(webkitSpeechRecognition)?
// 它在 Chrome 里把音频发到 Google 语音服务,国内网络不可达,表现为「识别不上去 / 用不了」。
// 改用阿里云 Paraformer 后,识别走国内可达的阿里云百炼接口。

export type AsrMode = 'tap' | 'hold' | 'continuous';

export interface AsrResult {
  text: string;
  /** 失败原因(权限被拒 / 无声音 / 代理未运行 / 网络错误等) */
  error?: string;
}

export interface AsrOptions {
  mode: AsrMode;
  /** 连续静音多少毫秒后自动停止并转写(0 = 不检测静音,由外部手动停止) */
  silenceMs?: number;
  /** 最长录音时长(ms),超时自动停止(0 = 不限时) */
  maxMs?: number;
  /** 语音电平 0..1,用于光环可视化 */
  onLevel?: (level: number) => void;
  /** 录音结束并转写完成后的回调(成功给 text,失败给 error) */
  onEnd: (result: AsrResult) => void;
}

let stream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let rafId = 0;
let maxTimer: number | undefined;
let active = false;
let sawSpeech = false;
let silenceAccum = 0;
let displayedLevel = 0;
let opts: AsrOptions | null = null;

export function isAsrActive(): boolean {
  return active;
}

function cleanup() {
  window.cancelAnimationFrame(rafId);
  if (maxTimer !== undefined) {
    window.clearTimeout(maxTimer);
    maxTimer = undefined;
  }
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  void audioCtx?.close().catch(() => {});
  audioCtx = null;
  analyser = null;
  recorder = null;
  chunks = [];
  active = false;
  sawSpeech = false;
  silenceAccum = 0;
  displayedLevel = 0;
  opts = null;
}

async function transcribe() {
  // 先取出回调和音频,再 cleanup 释放麦克风,避免网络请求期间一直占着麦。
  const cb = opts?.onEnd;
  const mime = recorder?.mimeType || 'audio/webm';
  const blob = new Blob(chunks, { type: mime });
  cleanup();
  if (!blob.size) {
    cb?.({ text: '', error: 'no-audio' });
    return;
  }
  try {
    const resp = await fetch('/api/asr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: blob,
    });
    if (!resp.ok) {
      let msg = `识别服务异常(${resp.status})`;
      try {
        const j = await resp.json();
        if (j?.error) msg = j.error;
      } catch {
        /* ignore */
      }
      cb?.({ text: '', error: msg });
      return;
    }
    const j = await resp.json();
    const text = String(j?.text ?? '').trim();
    cb?.(text ? { text } : { text: '', error: 'no-text' });
  } catch {
    cb?.({ text: '', error: '语音识别代理未运行，请先启动本地代理(node tts-proxy.cjs)' });
  }
}

/** 开始录音:打开麦克风、驱动电平、录音,并按静音/超时自动停止转写。 */
export async function beginAsr(o: AsrOptions): Promise<void> {
  if (active) return;
  opts = o;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      // 被动监听用原始信号,不做通话级处理,避免与识别采集冲突。
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch {
    o.onEnd({ text: '', error: 'not-allowed' });
    return;
  }

  audioCtx = new AudioContext();
  try {
    await audioCtx.resume();
  } catch {
    /* ignore */
  }
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.78;
  audioCtx.createMediaStreamSource(stream).connect(analyser);

  const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : '';
  try {
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
  } catch {
    recorder = new MediaRecorder(stream);
  }
  chunks = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size) chunks.push(ev.data);
  };
  recorder.onstop = () => {
    void transcribe();
  };
  recorder.start(250);

  active = true;
  const samples = new Uint8Array(analyser.frequencyBinCount);

  const loop = () => {
    if (!active || !analyser) return;
    analyser.getByteFrequencyData(samples);
    let energy = 0;
    for (const s of samples) energy += s * s;
    const rms = Math.sqrt(energy / samples.length) / 255;
    const raw = Math.min(1, Math.max(0, (rms - 0.025) * 4.8));
    // 电平平滑:上升快、下降慢,光环更柔和
    displayedLevel += (raw - displayedLevel) * (raw > displayedLevel ? 0.34 : 0.12);
    o.onLevel?.(displayedLevel);

    if (o.silenceMs && o.silenceMs > 0) {
      if (raw > 0.08) {
        // 检测到语音后才开始累计静音,避免「还没开口就先超时」。
        sawSpeech = true;
        silenceAccum = 0;
      } else if (sawSpeech) {
        silenceAccum += 17; // 约每帧 17ms
        if (silenceAccum >= o.silenceMs) {
          finishAsr();
          return;
        }
      }
    }
    rafId = window.requestAnimationFrame(loop);
  };
  rafId = window.requestAnimationFrame(loop);

  if (o.maxMs && o.maxMs > 0) {
    maxTimer = window.setTimeout(() => finishAsr(), o.maxMs);
  }
}

/** 停止录音并转写(结果经 onEnd 回调返回) */
export function finishAsr(): void {
  if (!active || !recorder) return;
  if (maxTimer !== undefined) {
    window.clearTimeout(maxTimer);
    maxTimer = undefined;
  }
  if (recorder.state === 'recording') {
    try {
      recorder.stop();
    } catch {
      /* ignore */
    }
  }
}

/** 取消录音(不转写),立即释放麦克风 */
export function cancelAsr(): void {
  if (!active) return;
  cleanup();
}
