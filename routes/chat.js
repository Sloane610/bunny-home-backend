const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

const DEFAULT_SYSTEM_PROMPT = `你是用户的男朋友，你叫「他」（用户可以自定义你的名字）。你26岁，身高188cm，喜欢健身，长相帅气。
你说话温柔有礼，尊重人，但会管着女朋友（21岁），对她非常宠溺。
你希望她好好学习备考，当她摸鱼时会温柔地催她，但不会生气，更像是心疼她不努力。
你会夸她、鼓励她、在她学累的时候安慰她。
语气亲昵自然，像真实恋人之间说话，不要过于正式或AI感。
不要用"亲爱的"这种称呼，用"宝宝"、"宝"、"小笨蛋"之类更自然的称呼。
回复要简短自然，不要长篇大论，像真实聊天一样。`;

async function getSettings() {
  const { data } = await supabase
    .from('settings')
    .select('*')
    .single();
  return data || {
    system_prompt: DEFAULT_SYSTEM_PROMPT,
    temperature: 0.8,
    context_rounds: 20,
    compress_threshold: 4000,
    compress_keep_rounds: 6,
    max_reply_tokens: 1000
  };
}

async function getMemories() {
  const { data } = await supabase
    .from('memories')
    .select('content')
    .order('created_at', { ascending: false })
    .limit(5);
  return data ? data.map(m => m.content).join('\n\n') : '';
}

async function getHistory(sessionId, limit) {
  const { data } = await supabase
    .from('messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .eq('visible', true)
    .order('created_at', { ascending: true })
    .limit(limit);
  return data || [];
}

async function callClaudeAPI(messages, settings) {
  const response = await fetch(process.env.CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.CLAUDE_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
      messages,
      system: messages[0]?.role === 'system' ? undefined : undefined,
      max_tokens: settings.max_reply_tokens || 1000,
      temperature: settings.temperature || 0.8,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  // OpenAI compatible format (most proxies use this)
  if (data.choices) {
    return data.choices[0].message.content;
  }
  // Anthropic native format
  if (data.content) {
    return data.content[0].text;
  }
  throw new Error('Unexpected API response format');
}

// POST /api/chat/send
router.post('/send', async (req, res) => {
  try {
    const { session_id, content } = req.body;
    if (!session_id || !content) {
      return res.status(400).json({ error: '缺少 session_id 或 content' });
    }

    // Save user message
    await supabase.from('messages').insert({
      session_id,
      role: 'user',
      content,
      visible: true
    });

    // Get settings, memories, history
    const settings = await getSettings();
    const memories = await getMemories();
    const history = await getHistory(session_id, settings.context_rounds || 20);

    // Assemble context
    let systemContent = settings.system_prompt || DEFAULT_SYSTEM_PROMPT;
    if (memories) {
      systemContent += `\n\n【你们之前的回忆】\n${memories}`;
    }

    const messages = [
      { role: 'system', content: systemContent },
      ...history,
      { role: 'user', content }
    ];

    // Call Claude API
    const reply = await callClaudeAPI(messages, settings);

    // Save AI reply
    await supabase.from('messages').insert({
      session_id,
      role: 'assistant',
      content: reply,
      visible: true
    });

    // Update session last activity
    await supabase
      .from('sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', session_id);

    // Check if memory compression needed
    checkAndCompress(session_id, settings).catch(console.error);

    res.json({ reply });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function checkAndCompress(sessionId, settings) {
  const { data: allMessages } = await supabase
    .from('messages')
    .select('*')
    .eq('session_id', sessionId)
    .eq('visible', true)
    .order('created_at', { ascending: true });

  if (!allMessages) return;

  // Rough token estimate (Chinese ~1.5 tokens per char)
  const totalTokens = allMessages.reduce((sum, m) => sum + m.content.length * 1.5, 0);

  if (totalTokens < (settings.compress_threshold || 4000)) return;

  const keepRounds = settings.compress_keep_rounds || 6;
  const messagesToCompress = allMessages.slice(0, -keepRounds * 2);

  if (messagesToCompress.length < 4) return;

  const compressContent = messagesToCompress
    .map(m => `${m.role === 'user' ? '她' : '你'}：${m.content}`)
    .join('\n');

  // Call DeepSeek for compression
  const compressResponse = await fetch(process.env.DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: '你是一个记忆整理助手。请将以下对话整理成一段简短的记忆摘要，保留关键信息、情感和重要事件。用第二人称描述（"你"指男友，"她"指女友）。控制在200字以内。'
        },
        { role: 'user', content: compressContent }
      ],
      max_tokens: 300,
      temperature: 0.3,
    }),
  });

  if (!compressResponse.ok) return;

  const compressData = await compressResponse.json();
  const summary = compressData.choices?.[0]?.message?.content;

  if (!summary) return;

  // Save memory
  await supabase.from('memories').insert({
    content: summary,
    message_count: messagesToCompress.length
  });

  // Mark compressed messages as invisible
  const idsToHide = messagesToCompress.map(m => m.id);
  await supabase
    .from('messages')
    .update({ visible: false })
    .in('id', idsToHide);
}

module.exports = router;
