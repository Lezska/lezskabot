#!/bin/bash
set -e
# Copy speedtest_p3_v3.py to server tmp, run with AstrBot venv python
cd /root/lezskabot/AstrBot
source venv/bin/activate
SRC=/tmp/speedtest_p3_v3.py
cat > "$SRC" << 'PYEOF'
"""End-to-end test of _ProxyConn + transaction() against fish.db (copy)."""
import sys, os, shutil, time, sqlite3
sys.path.insert(0, "/root/lezskabot/AstrBot")
sys.path.insert(0, "/root/lezskabot/AstrBot/data/plugins/astrbot_plugin_fishing")

import types
fake = types.ModuleType("astrbot")
fake_api = types.ModuleType("astrbot.api")
class _L:
    def info(self, *a, **k): pass
    def warning(self, *a, **k): pass
    def error(self, *a, **k): pass
fake_api.logger = _L()
fake.api = fake_api
sys.modules["astrbot"] = fake
sys.modules["astrbot.api"] = fake_api

from core.database.connection_manager import DatabaseConnectionManager

SRC = "/root/lezskabot/AstrBot/data/fish.db"
DST = "/tmp/fish_speedtest_v3.db"
if os.path.exists(DST):
    os.remove(DST)
shutil.copy2(SRC, DST)

mgr = DatabaseConnectionManager(DST)

con = sqlite3.connect(DST)
u = con.execute("SELECT user_id, coins, fishing_zone_id FROM users WHERE coins >= 10000 ORDER BY coins DESC LIMIT 1").fetchone()
test_user_id = u[0]
start_coins = u[1]
zid = u[2]
con.close()
print(f"test_user_id={test_user_id} start_coins={start_coins} zone={zid}")

def reset():
    con = sqlite3.connect(DST)
    con.execute("UPDATE users SET coins = ? WHERE user_id = ?", (start_coins, test_user_id))
    con.execute("DELETE FROM fishing_records WHERE user_id = ?", (test_user_id,))
    con.commit()
    con.close()

def simulate_one_fish_via_mgr(mgr):
    with mgr.get_connection() as conn:
        cur = conn.cursor()
        u = cur.execute("SELECT coins, fishing_zone_id FROM users WHERE user_id = ?", (test_user_id,)).fetchone()
        if u is None or u[0] < 8:
            return False
        zid = u[1]
        cur.execute("SELECT daily_rare_fish_quota, rare_fish_caught_today FROM fishing_zones WHERE id = ?", (zid,))
        cur.execute("SELECT rod_instance_id FROM user_rods WHERE user_id = ? AND is_equipped = 1 LIMIT 1", (test_user_id,))
        cur.execute("SELECT fish_id, quality_level, quantity FROM user_fish_inventory WHERE user_id = ?", (test_user_id,))
        cur.execute("UPDATE users SET coins = coins - 8, last_fishing_time = CURRENT_TIMESTAMP WHERE user_id = ?", (test_user_id,))
        cur.execute("INSERT INTO user_fish_inventory (user_id, fish_id, quality_level, quantity) VALUES (?, 1, 0, 1) ON CONFLICT(user_id, fish_id, quality_level) DO UPDATE SET quantity = quantity + 1", (test_user_id,))
        cur.execute("UPDATE fishing_zones SET rare_fish_caught_today = rare_fish_caught_today + 1 WHERE id = ?", (zid,))
        cur.execute("UPDATE users SET total_fishing_count = total_fishing_count + 1 WHERE user_id = ?", (test_user_id,))
        cur.execute("INSERT INTO fishing_records (user_id, fish_id, weight, value, timestamp) VALUES (?, 1, 100, 100, CURRENT_TIMESTAMP)", (test_user_id,))
        cur.execute("UPDATE users SET coins = coins WHERE user_id = ?", (test_user_id,))
        conn.commit()
        return True

N = 99

# BASELINE
times = []
for _ in range(3):
    reset()
    t0 = time.perf_counter()
    for i in range(N):
        simulate_one_fish_via_mgr(mgr)
    times.append(time.perf_counter() - t0)
baseline = min(times)
print(f"BASELINE (per-fish commit):   {baseline*1000:.0f}ms total, {baseline*1000/N:.1f}ms/fish")

# P3-A
times = []
for _ in range(3):
    reset()
    t0 = time.perf_counter()
    with mgr.transaction():
        for i in range(N):
            with mgr.get_connection() as conn:
                cur = conn.cursor()
                u = cur.execute("SELECT coins, fishing_zone_id FROM users WHERE user_id = ?", (test_user_id,)).fetchone()
                if u is None or u[0] < 8:
                    continue
                zid = u[1]
                cur.execute("SELECT daily_rare_fish_quota, rare_fish_caught_today FROM fishing_zones WHERE id = ?", (zid,))
                cur.execute("SELECT rod_instance_id FROM user_rods WHERE user_id = ? AND is_equipped = 1 LIMIT 1", (test_user_id,))
                cur.execute("SELECT fish_id, quality_level, quantity FROM user_fish_inventory WHERE user_id = ?", (test_user_id,))
                cur.execute("UPDATE users SET coins = coins - 8, last_fishing_time = CURRENT_TIMESTAMP WHERE user_id = ?", (test_user_id,))
                cur.execute("INSERT INTO user_fish_inventory (user_id, fish_id, quality_level, quantity) VALUES (?, 1, 0, 1) ON CONFLICT(user_id, fish_id, quality_level) DO UPDATE SET quantity = quantity + 1", (test_user_id,))
                cur.execute("UPDATE fishing_zones SET rare_fish_caught_today = rare_fish_caught_today + 1 WHERE id = ?", (zid,))
                cur.execute("UPDATE users SET total_fishing_count = total_fishing_count + 1 WHERE user_id = ?", (test_user_id,))
                cur.execute("INSERT INTO fishing_records (user_id, fish_id, weight, value, timestamp) VALUES (?, 1, 100, 100, CURRENT_TIMESTAMP)", (test_user_id,))
                cur.execute("UPDATE users SET coins = coins WHERE user_id = ?", (test_user_id,))
    times.append(time.perf_counter() - t0)
p3 = min(times)
print(f"P3-A (1 transaction):         {p3*1000:.0f}ms total, {p3*1000/N:.2f}ms/fish")

# verify
con = sqlite3.connect(DST)
recs = con.execute("SELECT COUNT(*) FROM fishing_records WHERE user_id = ?", (test_user_id,)).fetchone()[0]
con.close()
print(f"fishing_records after P3-A:  {recs} (expected {N})")
print(f"\nSpeedup: {baseline/p3:.1f}x")
print(f"  baseline: {baseline*1000:.0f}ms")
print(f"  P3-A:     {p3*1000:.0f}ms")

os.remove(DST)
PYEOF
python "$SRC" 2>&1
