// 极速模式：更小模型 + 更短输出 + 超时回退
const FREE_AI_MODEL = "onnx-community/Qwen2.5-0.5B-Instruct";
const FAST_AI_TIMEOUT_MS = 1400;

let freeAIPipeline = null;
let freeAIPromise = null;

function setAIStatus(text) {
  const el = document.getElementById("ai-status");
  if (el) el.textContent = text;
}

function extractJSON(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function stripFence(text) {
  return text
    .replace(/^```(?:json|text)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

async function loadPipeline(modelId) {
  const { pipeline } = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1");
  return pipeline("text-generation", modelId, {
    dtype: "q4",
  });
}

async function getFreeAI() {
  if (freeAIPipeline) return freeAIPipeline;
  if (!freeAIPromise) {
    freeAIPromise = (async () => {
      setAIStatus("AI：正在加载极速模型，首次会比较慢");
      try {
        freeAIPipeline = await loadPipeline(FREE_AI_MODEL);
        setAIStatus("AI：极速模型已就绪");
        return freeAIPipeline;
      } catch (error) {
        console.warn("极速模型加载失败，已切回规则引擎：", error);
        setAIStatus("AI：模型加载失败，已使用规则引擎");
        freeAIPipeline = null;
        freeAIPromise = null;
        return null;
      }
    })();
  }

  return freeAIPromise;
}

function buildJudgePrompt(question, answer, memoryText) {
  return [
    "你是中文海龟汤裁判，回答要极短。",
    "你只输出 JSON，不要输出任何多余解释。",
    'JSON 格式必须是: {"text":"...","score":0-5,"tone":"short"}',
    "text 12到20字，score 0-5，tone 固定 short。",
    `真相：${answer}`,
    `玩家当前问题：${question}`,
    `历史提问：${memoryText || "无"}`,
  ].join("\n");
}

function buildHintPrompt(score, question, answer, memoryText) {
  return [
    "你是中文海龟汤提示助手，回答要短，像聊天。",
    "只输出一句中文短提示，不要泄露完整真相。",
    "20字以内。",
    `当前分数：${score}`,
    `当前题目：${question}`,
    `历史提问：${memoryText || "无"}`,
    `真相：${answer}`,
  ].join("\n");
}

async function judgeWithFreeAI(question, answer, memoryText) {
  const pipe = await getFreeAI();
  if (!pipe) return null;

  try {
    const prompt = buildJudgePrompt(question, answer, memoryText);
    const output = await withTimeout(pipe(prompt, {
      max_new_tokens: 32,
      do_sample: false,
      temperature: 0.1,
      top_p: 0.8,
      repetition_penalty: 1.05,
      return_full_text: false,
    }), FAST_AI_TIMEOUT_MS);

    if (!output) return null;

    const generated = stripFence(Array.isArray(output)
      ? (output[0]?.generated_text || "")
      : (output?.generated_text || ""));

    const parsed = extractJSON(generated);
    if (parsed && typeof parsed.text === "string") {
      const score = Number.isFinite(parsed.score) ? parsed.score : 0;
      return {
        text: parsed.text.trim(),
        score: Math.max(0, Math.min(5, Math.round(score))),
      };
    }

    if (generated) {
      return {
        text: generated.split("\n")[0].slice(0, 40),
        score: 2,
      };
    }
  } catch (error) {
    console.warn("免费模型判断失败，已切回规则引擎：", error);
  }

  return null;
}

async function hintWithFreeAI(score, question, answer, memoryText) {
  const pipe = await getFreeAI();
  if (!pipe) return null;

  try {
    const prompt = buildHintPrompt(score, question, answer, memoryText);
    const output = await withTimeout(pipe(prompt, {
      max_new_tokens: 20,
      do_sample: false,
      temperature: 0.1,
      top_p: 0.8,
      repetition_penalty: 1.05,
      return_full_text: false,
    }), FAST_AI_TIMEOUT_MS);

    if (!output) return null;

    const generated = stripFence(Array.isArray(output)
      ? (output[0]?.generated_text || "")
      : (output?.generated_text || ""));

    return generated.trim().replace(/^["'“”]+|["'“”]+$/g, "");
  } catch (error) {
    console.warn("免费模型提示失败，已切回规则引擎：", error);
    return null;
  }
}

// 🧠 语义理解（核心AI模拟，保留作为回退）
function analyze(q) {
  if (/死|杀|自杀/.test(q)) return "death";
  if (/镜子|影子|幻觉/.test(q)) return "illusion";
  if (/身份|存在/.test(q)) return "identity";
  if (/记忆|童年/.test(q)) return "memory";
  if (/系统|数据/.test(q)) return "system";
  return "unknown";
}

// 🤖 AI推理反馈（规则引擎回退）
function aiJudge(type) {
  switch (type) {
    case "identity":
      return { text: "🟢 你正在接近核心真相", score: 4 };
    case "memory":
      return { text: "🔥 关键结构线索", score: 5 };
    case "system":
      return { text: "🧠 高级逻辑方向", score: 5 };
    case "illusion":
      return { text: "🟡 感知层线索", score: 3 };
    case "death":
      return { text: "🟡 部分相关", score: 2 };
    default:
      return { text: "❌ 无关信息", score: -1 };
  }
}

// 🧠 相似度判断（是否猜对）
function checkWin(q, answer) {
  const keywords = answer.split("");
  let hit = 0;
  keywords.forEach((k) => {
    if (q.includes(k)) hit++;
  });
  return hit > 3;
}
