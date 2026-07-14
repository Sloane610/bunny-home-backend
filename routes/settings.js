const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

// GET /api/settings
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .single();

    if (error && error.code === 'PGRST116') {
      // No settings row yet, return defaults
      return res.json({
        system_prompt: '',
        temperature: 0.8,
        context_rounds: 20,
        compress_threshold: 4000,
        compress_keep_rounds: 6,
        max_reply_tokens: 1000,
        boyfriend_name: '他'
      });
    }
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/settings
router.put('/', async (req, res) => {
  try {
    const settings = req.body;

    // Upsert - insert if not exists, update if exists
    const { data: existing } = await supabase
      .from('settings')
      .select('id')
      .single();

    let result;
    if (existing) {
      result = await supabase
        .from('settings')
        .update(settings)
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      result = await supabase
        .from('settings')
        .insert(settings)
        .select()
        .single();
    }

    if (result.error) throw result.error;
    res.json(result.data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
