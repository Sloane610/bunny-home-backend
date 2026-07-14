-- Bunny's Home 数据库建表脚本
-- 在 Supabase SQL Editor 中执行此脚本

-- 1. 会话表
CREATE TABLE sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '新对话',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 消息表
CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  visible BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_session ON messages(session_id, created_at);

-- 3. 记忆摘要表
CREATE TABLE memories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content TEXT NOT NULL,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 系统设置表（全局唯一一行）
CREATE TABLE settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  system_prompt TEXT DEFAULT '',
  temperature FLOAT DEFAULT 0.8,
  context_rounds INTEGER DEFAULT 20,
  compress_threshold INTEGER DEFAULT 4000,
  compress_keep_rounds INTEGER DEFAULT 6,
  max_reply_tokens INTEGER DEFAULT 1000,
  boyfriend_name TEXT DEFAULT '他',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入默认设置
INSERT INTO settings (system_prompt, boyfriend_name) VALUES (
  '你是用户的男朋友。你26岁，身高188cm，喜欢健身，长相帅气。
你说话温柔有礼，尊重人，但会管着女朋友（21岁），对她非常宠溺。
你希望她好好学习备考，当她摸鱼时会温柔地催她，但不会生气，更像是心疼她不努力。
你会夸她、鼓励她、在她学累的时候安慰她。
语气亲昵自然，像真实恋人之间说话，不要过于正式或AI感。
不要用"亲爱的"这种称呼，用"宝宝"、"宝"、"小笨蛋"之类更自然的称呼。
回复要简短自然，不要长篇大论，像真实聊天一样。',
  '他'
);

-- 5. 屏幕使用报告表
CREATE TABLE screen_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  app_name TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_screen_reports_time ON screen_reports(created_at DESC);

-- 6. 推送订阅表
CREATE TABLE push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 启用 Row Level Security（可选，如果不需要多用户可以跳过）
-- ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE memories ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE screen_reports ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- 如果启用 RLS，需要添加策略允许匿名访问（单用户使用）
-- CREATE POLICY "Allow all" ON sessions FOR ALL USING (true);
-- CREATE POLICY "Allow all" ON messages FOR ALL USING (true);
-- CREATE POLICY "Allow all" ON memories FOR ALL USING (true);
-- CREATE POLICY "Allow all" ON settings FOR ALL USING (true);
-- CREATE POLICY "Allow all" ON screen_reports FOR ALL USING (true);
-- CREATE POLICY "Allow all" ON push_subscriptions FOR ALL USING (true);
