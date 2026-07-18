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

// Messages from boyfriend when she's using blacklisted apps
const CARING_MESSAGES = [
  '又在刷手机。',
  '……你今天学了多久？',
  '玩够了没。',
  '刷了挺久了。不来找我，倒是有空刷这个。',
  '嗯？学完了？',
  '你自己看看时间。',
];

const STRICT_MESSAGES = [
  '放下手机。不说第二遍。',
  '我帮你开专注模式了。别让我失望。',
  '已经提醒你很多次了。锁了，去学习。',
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
