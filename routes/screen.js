const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const webpush = require('web-push');

// Configure web push if VAPID keys exist
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'example@example.com'}`,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Caring messages from boyfriend when she's using blacklisted apps
const CARING_MESSAGES = [
  '宝宝，刷手机刷了好久了哦，眼睛会累的，休息一下吧～',
  '小笨蛋，是不是又在摸鱼啦？今天的学习任务完成了吗？',
  '宝，我知道你想放松一下，但是别刷太久了好不好？我心疼你的眼睛',
  '嘿，该学习啦～完成今天的任务我们再一起聊天好不好？',
  '宝宝乖，先把手机放下学一会儿，学完了我陪你聊天～',
  '又在刷手机了对不对？我可要生气了哦（才怪），快去学习吧宝',
];

const STRICT_MESSAGES = [
  '宝，我说认真的，你已经玩了很久了。为了你的考试，先把手机放下好吗？我帮你开专注模式了。',
  '小笨蛋，都提醒你好几次了还在玩...我要帮你锁手机了哦，好好学习，学完了再来找我。',
  '宝宝，你知道我是为你好的对吧？专注模式开起来，认真学一会儿，我等你回来。',
];

// POST /api/screen/report - 接收屏幕使用报告（来自快捷指令）
router.post('/report', async (req, res) => {
  try {
    const { app_name, event_type } = req.body;
    // event_type: 'open' | 'still_using' | 'close'

    // Record the event
    await supabase.from('screen_reports').insert({
      app_name: app_name || 'unknown',
      event_type: event_type || 'open',
    });

    // Check how long they've been using blacklisted apps
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recentReports } = await supabase
      .from('screen_reports')
      .select('*')
      .gte('created_at', thirtyMinutesAgo)
      .order('created_at', { ascending: false });

    const usageMinutes = recentReports ? recentReports.length * 5 : 0; // Each report ~5 min apart

    let action = 'none';
    let message = '';

    if (usageMinutes >= 20) {
      // Strict mode - trigger focus mode
      action = 'focus_mode';
      message = STRICT_MESSAGES[Math.floor(Math.random() * STRICT_MESSAGES.length)];
    } else if (usageMinutes >= 10) {
      // Gentle reminder
      action = 'remind';
      message = CARING_MESSAGES[Math.floor(Math.random() * CARING_MESSAGES.length)];
    }

    // Send push notification if needed
    if (action !== 'none') {
      await sendPushToAll(message, action);
    }

    res.json({ action, message, usage_minutes: usageMinutes });
  } catch (error) {
    console.error('Screen report error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/screen/subscribe - 注册推送订阅
router.post('/subscribe', async (req, res) => {
  try {
    const subscription = req.body;
    await supabase.from('push_subscriptions').insert({
      subscription: JSON.stringify(subscription)
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/screen/vapid-key - 获取公钥
router.get('/vapid-key', (req, res) => {
  res.json({ key: process.env.VAPID_PUBLIC_KEY || '' });
});

async function sendPushToAll(message, action) {
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('subscription');

  if (!subscriptions) return;

  const payload = JSON.stringify({
    title: '💕 来自他的消息',
    body: message,
    action,
  });

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(JSON.parse(sub.subscription), payload);
    } catch (err) {
      if (err.statusCode === 410) {
        // Subscription expired, remove it
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('subscription', sub.subscription);
      }
    }
  }
}

module.exports = router;
