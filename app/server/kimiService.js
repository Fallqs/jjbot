import { getConfig } from './novelDao.js';

const BASE_URL = 'https://api.moonshot.cn/v1';
const MODEL = 'kimi-k2-turbo-preview';

function getApiKey() {
  return getConfig('kimi_api_key');
}

async function chatCompletion(messages) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Kimi API Key 未配置');
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 1,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Kimi API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

function parseJsonResponse(content) {
  // Try direct parse
  try {
    const parsed = JSON.parse(content);
    if (parsed && Array.isArray(parsed.novels)) {
      return { novels: parsed.novels };
    }
  } catch {}

  // Try extract from markdown code block
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1]);
      if (parsed && Array.isArray(parsed.novels)) {
        return { novels: parsed.novels };
      }
    } catch {}
  }

  // Fallback: if content looks like plain text, return it
  return { text: content };
}

function formatCandidates(novels) {
  return novels.map((n, idx) => {
    const tags = Array.isArray(n.tags) ? n.tags.join(' ') : '';
    return `[${idx + 1}] ID:${n.id} 《${n.title}》作者：${n.author} | 标签：${tags} | 简介：${(n.summary || '').substring(0, 120)}`;
  }).join('\n');
}

export async function searchNovels(query, candidates) {
  const candidatesText = formatCandidates(candidates);

  const prompt = `用户正在搜索小说，需求如下："${query}"。
以下是本地书库中的候选小说：
${candidatesText}

请根据用户需求，从候选小说中选出最匹配的 1-5 本，按匹配度降序排列。
必须严格按以下 JSON 格式返回，不要包含任何 Markdown 代码块、解释或其他文字：
{"novels":[{"novel_id":"候选列表中的ID","reason":"一句话推荐理由"}]}
如果没有明显匹配的，返回 {"novels":[]}。`;

  const content = await chatCompletion([
    { role: 'system', content: '你是一个专业的小说推荐助手，熟悉晋江文学城的小说分类和标签体系。你只会输出JSON，不会输出其他内容。' },
    { role: 'user', content: prompt },
  ]);

  return parseJsonResponse(content);
}

export async function recommendNovels(readingHistory, candidates) {
  const historyText = readingHistory.map((n, idx) => {
    const tags = Array.isArray(n.tags) ? n.tags.join(' ') : '';
    return `[${idx + 1}] ID:${n.id} 《${n.title}》作者：${n.author} | 标签：${tags}`;
  }).join('\n');

  const candidatesText = formatCandidates(candidates);

  const prompt = `用户最近阅读过以下小说：
${historyText}

本地书库中还有其他候选小说：
${candidatesText}

请根据用户的阅读偏好，从候选小说中推荐 1-5 本，按推荐度降序排列。
必须严格按以下 JSON 格式返回，不要包含任何 Markdown 代码块、解释或其他文字：
{"novels":[{"novel_id":"候选列表中的ID","reason":"结合阅读历史的一句话推荐理由"}]}
如果没有合适的推荐，返回 {"novels":[]}。`;

  const content = await chatCompletion([
    { role: 'system', content: '你是一个专业的小说推荐助手，擅长根据用户的阅读历史推断其喜好并给出精准推荐。你只会输出JSON，不会输出其他内容。' },
    { role: 'user', content: prompt },
  ]);

  return parseJsonResponse(content);
}
