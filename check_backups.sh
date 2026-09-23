#!/bin/bash
echo "=== P0+P1 backup ==="
ls -la /root/lezskabot/backups/fishing_p0p1_20260726/ 2>&1 | head -20
echo ""
echo "=== P3 backup ==="
ls -la /root/lezskabot/backups/fishing_p3_20260726/ 2>&1 | head -20
echo ""
echo "=== P0+P1 reset_fishing_cooldown_effect.py async apply? ==="
grep -c "async def apply" /root/lezskabot/backups/fishing_p0p1_20260726/reset_fishing_cooldown_effect.py
echo "=== P0+P1 reset_fishing_cooldown_effect.py conn_mgr.transaction? ==="
grep -c "conn_mgr.transaction" /root/lezskabot/backups/fishing_p0p1_20260726/reset_fishing_cooldown_effect.py
echo ""
echo "=== P3 reset_fishing_cooldown_effect.py async apply? ==="
grep -c "async def apply" /root/lezskabot/backups/fishing_p3_20260726/reset_fishing_cooldown_effect.py
echo "=== P3 reset_fishing_cooldown_effect.py conn_mgr.transaction? ==="
grep -c "conn_mgr.transaction" /root/lezskabot/backups/fishing_p3_20260726/reset_fishing_cooldown_effect.py
echo ""
echo "=== diff reset_fishing_cooldown_effect.py P0+P1 vs P3 backup ==="
diff /root/lezskabot/backups/fishing_p0p1_20260726/reset_fishing_cooldown_effect.py /root/lezskabot/backups/fishing_p3_20260726/reset_fishing_cooldown_effect.py | head -40
echo ""
echo "=== working reset_fishing_cooldown_effect.py == P0+P1 backup? ==="
diff /root/lezskabot/backups/fishing_p0p1_20260726/reset_fishing_cooldown_effect.py /root/lezskabot/AstrBot/data/plugins/astrbot_plugin_fishing/core/services/item_effects/reset_fishing_cooldown_effect.py | head -30
