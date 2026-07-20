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

// Study time periods (Beijing time)
function isStudyTime() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const h = now.getHours();
  const m = now.getMinutes();
  const time = h * 60 + m;
  // 8:00-12:00, 14:00-18:00, 19:30-22:00
  return (time >= 480 && time < 720) || (time >= 840 && time < 1080) || (time >= 1170 && time < 1320);
}

// His "mood" determines tolerance (10-30 min)
function getMoodAllowance() {
  // Random mood each time — 10, 15, 20, 25, or 30 minutes
  const options = [10, 15, 20, 25, 30];
  return options[Math.floor(Math.random() * options.length)];
}

const STUDY_TIME_MESSAGES = [
  '现在是学习时间。放下手机。',
  '几点了？该学习了。',
  '你在干什么。',
  '锁了。去学。',
];

// POST /api/screen/report - 接收屏幕使用报告（来自快捷指令）
router.post('/report', async (req, res) => {
  try {
    const { app_name, event_type } = req.body;

    // Record the event
    await supabase.from('screen_reports').insert({
      app_name: app_name || 'unknown',
      event_type: event_type || 'open',
    });

    let action = 'none';
    let message = '';

    // Study time = immediate lockdown
    if (isStudyTime()) {
      action = 'focus_mode';
      message = STUDY_TIME_MESSAGES[Math.floor(Math.random() * STUDY_TIME_MESSAGES.length)];
      await sendPushToAll(message, action);
      return res.json({ action, message, usage_minutes: 0 });
    }

    // Free time = allow some usage based on "mood"
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: recentReports } = await supabase
      .from('screen_reports')
      .select('*')
      .gte('created_at', thirtyMinutesAgo)
      .order('created_at', { ascending: false });

    const usageMinutes = recentReports ? recentReports.length * 5 : 0;
    const allowance = getMoodAllowance();

    if (usageMinutes >= allowance) {
      action = 'focus_mode';
      message = STRICT_MESSAGES[Math.floor(Math.random() * STRICT_MESSAGES.length)];
      await sendPushToAll(message, action);
    } else if (usageMinutes >= allowance - 5) {
      action = 'remind';
      message = CARING_MESSAGES[Math.floor(Math.random() * CARING_MESSAGES.length)];
      await sendPushToAll(message, action);
    }

    res.json({ action, message, usage_minutes: usageMinutes, allowance });
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
      } else {
        console.error('Push error:', err.statusCode, err.body);
      }
    }
  }
}

// GET /api/screen/test-push - 测试推送
router.get('/test-push', async (req, res) => {
  try {
    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('subscription');

    if (!subscriptions || subscriptions.length === 0) {
      return res.json({ error: 'No subscriptions found' });
    }

    const payload = JSON.stringify({
      title: '测试',
      body: '如果你看到这条通知，推送功能正常。',
      action: 'none',
    });

    const results = [];
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(JSON.parse(sub.subscription), payload);
        results.push({ status: 'ok' });
      } catch (err) {
        results.push({ status: 'error', code: err.statusCode, message: err.body || err.message });
      }
    }
    res.json({ subscriptions: subscriptions.length, results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
