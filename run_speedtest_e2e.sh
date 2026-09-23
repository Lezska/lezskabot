#!/bin/bash
set -e
# Real end-to-end speedtest: load full fishing plugin stack, run go_fish 99 times via P3 path vs baseline
cd /root/lezskabot/AstrBot
source venv/bin/activate

cat > /tmp/speedtest_e2e.py << 'PYEOF'
"""Real e2e speedtest: instantiate full plugin stack, run 99 go_fish via P3 path vs baseline."""
import sys, os, shutil, time, asyncio, sqlite3, types

# 1. Setup env
SRC = "/root/lezskabot/AstrBot/data/fish.db"
DST = "/tmp/fish_e2e.db"
if os.path.exists(DST):
    os.remove(DST)
shutil.copy2(SRC, DST)

# 2. Patch astrbot.api.logger
fake = types.ModuleType("astrbot")
fake_api = types.ModuleType("astrbot.api")
class _L:
    def info(self, *a, **k): pass
    def warning(self, *a, **k): pass
    def error(self, *a, **k): pass
    def debug(self, *a, **k): pass
fake_api.logger = _L()
fake.api = fake_api
sys.modules["astrbot"] = fake
sys.modules["astrbot.api"] = fake_api

# 3. Load plugin as top-level
sys.path.insert(0, "/root/lezskabot/AstrBot/data/plugins")
import importlib
_plugin_pkg = importlib.import_module("astrbot_plugin_fishing")
sys.modules["astrbot_plugin_fishing"] = _plugin_pkg

# 4. Patch DatabaseConnectionManager to use DST
from astrbot_plugin_fishing.core.database.connection_manager import DatabaseConnectionManager
_orig_init = DatabaseConnectionManager.__init__
def _patched_init(self, db_path, *a, **kw):
    _orig_init(self, DST, *a, **kw)
DatabaseConnectionManager.__init__ = _patched_init

# 5. Build real plugin stack
from astrbot_plugin_fishing.core.repositories.sqlite_inventory_repo import SqliteInventoryRepository
from astrbot_plugin_fishing.core.repositories.sqlite_user_repo import SqliteUserRepository
from astrbot_plugin_fishing.core.repositories.sqlite_user_buff_repo import SqliteUserBuffRepository
from astrbot_plugin_fishing.core.repositories.sqlite_log_repo import SqliteLogRepository
from astrbot_plugin_fishing.core.repositories.sqlite_item_template_repo import SqliteItemTemplateRepository
from astrbot_plugin_fishing.core.services.fishing_zone_service import FishingZoneService
from astrbot_plugin_fishing.core.services.game_mechanics_service import GameMechanicsService
from astrbot_plugin_fishing.core.services.fish_weight_service import FishWeightService
from astrbot_plugin_fishing.core.services.fishing_service import FishingService
from astrbot_plugin_fishing.core.services.item_effects.reset_fishing_cooldown_effect import ResetFishingCooldownEffect
from astrbot_plugin_fishing.core.domain.models import Item

inv_repo = SqliteInventoryRepository(DST)
user_repo = SqliteUserRepository(DST)
buff_repo = SqliteUserBuffRepository(DST)
log_repo = SqliteLogRepository(DST)
item_tpl_repo = SqliteItemTemplateRepository(DST)
game_mech = GameMechanicsService(user_repo=user_repo, log_repo=log_repo, inventory_repo=inv_repo,
                                    item_template_repo=item_tpl_repo, buff_repo=buff_repo, config={})
zone_service = FishingZoneService(item_tpl_repo, inv_repo, config={})
fish_weight = FishWeightService(max_cache_size=1000)
fishing_service = FishingService(
    user_repo=user_repo, inventory_repo=inv_repo, item_template_repo=item_tpl_repo,
    log_repo=log_repo, buff_repo=buff_repo, fishing_zone_service=zone_service,
    fish_weight_service=fish_weight, config={},
)
effect = ResetFishingCooldownEffect(user_repo=user_repo, buff_repo=buff_repo, fishing_service=fishing_service)
print(f"effect.apply is coroutine: {asyncio.iscoroutinefunction(effect.apply)}")

# 6. Find test user with lots of coins
con = sqlite3.connect(DST)
con.row_factory = sqlite3.Row
u = con.execute("SELECT user_id, coins, fishing_zone_id FROM users WHERE coins >= 1000000 AND fishing_zone_id IS NOT NULL ORDER BY coins DESC LIMIT 1").fetchone()
test_user_id = u["user_id"]
start_coins = u["coins"]
saved_zone = u["fishing_zone_id"]
con.execute("UPDATE users SET fishing_zone_id = 1 WHERE user_id = ?", (test_user_id,))
con.execute("DELETE FROM fishing_records WHERE user_id = ?", (test_user_id,))
con.commit()
con.close()
print(f"test_user_id={test_user_id} start_coins={start_coins} saved_zone={saved_zone}")

# 7. Reset state
def reset():
    con = sqlite3.connect(DST)
    con.row_factory = sqlite3.Row
    con.execute("UPDATE users SET coins = ? WHERE user_id = ?", (start_coins, test_user_id))
    con.execute("DELETE FROM fishing_records WHERE user_id = ?", (test_user_id,))
    con.execute("UPDATE user_fish_inventory SET quantity = 0 WHERE user_id = ?", (test_user_id,))
    con.execute("UPDATE users SET total_fishing_count = 0 WHERE user_id = ?", (test_user_id,))
    con.commit()
    con.close()

# 8. Build user/item
user = user_repo.get_by_id(test_user_id)
item = Item(item_id=3, name="时运沙漏", rarity=1, effect_type="RESET_FISHING_COOLDOWN", effect_payload=None, is_consumable=True)

# 9. Warmup
print("warmup...")
asyncio.run(effect.apply(user, item, {}, 3))
print("warmup done")

N = 99

# 10. BASELINE: simulate P0+P1 path (no transaction, just to_thread)
async def baseline_path():
    results = []
    success_count = 0
    fail_count = 0
    for i in range(N):
        r = await asyncio.to_thread(fishing_service.go_fish, test_user_id)
        results.append(r)
        if r and r.get("success"):
            success_count += 1
        else:
            fail_count += 1
    return results, success_count, fail_count

reset()
print(f"\n[BASELINE] running {N}x go_fish (P0+P1 path)...")
t0 = time.perf_counter()
res = asyncio.run(baseline_path())
baseline = time.perf_counter() - t0
print(f"  time: {baseline:.2f}s, success={res[1]}, fail={res[2]}")

# 11. P3 path: real effect.apply with quantity=99
reset()
print(f"\n[P3-A] running effect.apply(user, item, qty={N})...")
t0 = time.perf_counter()
res = asyncio.run(effect.apply(user, item, {}, N))
p3 = time.perf_counter() - t0
print(f"  time: {p3:.2f}s")
print(f"  result: {res}")

# 12. Verify
con = sqlite3.connect(DST)
recs = con.execute("SELECT COUNT(*) FROM fishing_records WHERE user_id = ?", (test_user_id,)).fetchone()[0]
coins = con.execute("SELECT coins FROM users WHERE user_id = ?", (test_user_id,)).fetchone()[0]
con.close()

print(f"\nResults:")
print(f"  BASELINE (P0+P1): {baseline:.2f}s")
print(f"  P3-A (proxy txn): {p3:.2f}s")
print(f"  Speedup: {baseline/p3:.2f}x")
print(f"  fishing_records after P3: {recs}")
print(f"  coins left: {coins}")

# restore
con = sqlite3.connect(DST)
con.execute("UPDATE users SET fishing_zone_id = ? WHERE user_id = ?", (saved_zone, test_user_id))
con.commit()
con.close()
os.remove(DST)
PYEOF

python /tmp/speedtest_e2e.py 2>&1
