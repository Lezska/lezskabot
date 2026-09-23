#!/bin/bash
set -e
cd /root/lezskabot/AstrBot
source venv/bin/activate

cat > /tmp/profile_go_fish.py << 'PYEOF'
"""Profile go_fish: where does the 99x latency go? cProfile + breakdown by section."""
import sys, os, shutil, time, cProfile, pstats, io, asyncio, sqlite3, types

SRC = "/root/lezskabot/AstrBot/data/fish.db"
DST = "/tmp/fish_profile.db"
if os.path.exists(DST):
    os.remove(DST)
shutil.copy2(SRC, DST)

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

sys.path.insert(0, "/root/lezskabot/AstrBot/data/plugins")
import importlib
importlib.import_module("astrbot_plugin_fishing")

from astrbot_plugin_fishing.core.database.connection_manager import DatabaseConnectionManager
conn_mgr = DatabaseConnectionManager(DST)

from astrbot_plugin_fishing.core.repositories.sqlite_inventory_repo import SqliteInventoryRepository
from astrbot_plugin_fishing.core.repositories.sqlite_user_repo import SqliteUserRepository
from astrbot_plugin_fishing.core.repositories.sqlite_user_buff_repo import SqliteUserBuffRepository
from astrbot_plugin_fishing.core.repositories.sqlite_log_repo import SqliteLogRepository
from astrbot_plugin_fishing.core.repositories.sqlite_item_template_repo import SqliteItemTemplateRepository
from astrbot_plugin_fishing.core.services.fishing_zone_service import FishingZoneService
from astrbot_plugin_fishing.core.services.game_mechanics_service import GameMechanicsService
from astrbot_plugin_fishing.core.services.fish_weight_service import FishWeightService
from astrbot_plugin_fishing.core.services.fishing_service import FishingService

inv_repo = SqliteInventoryRepository(DST, conn_mgr)
user_repo = SqliteUserRepository(DST, conn_mgr)
buff_repo = SqliteUserBuffRepository(DST, conn_mgr)
log_repo = SqliteLogRepository(DST, conn_mgr)
item_tpl_repo = SqliteItemTemplateRepository(DST)
game_mech = GameMechanicsService(user_repo=user_repo, log_repo=log_repo, inventory_repo=inv_repo,
                                    item_template_repo=item_tpl_repo, buff_repo=buff_repo, config={})
zone_service = FishingZoneService(item_tpl_repo, inv_repo, config={})
fish_weight = FishWeightService(max_cache_size=1000)
fishing_service = FishingService(
    user_repo=user_repo, inventory_repo=inv_repo, item_template_repo=item_tpl_repo,
    log_repo=log_repo, buff_repo=buff_repo, fishing_zone_service=zone_service,
    fish_weight_service=fish_weight, config={}, conn_mgr=conn_mgr,
)

# Find user
con = sqlite3.connect(DST)
con.row_factory = sqlite3.Row
u = con.execute("SELECT user_id, coins, fishing_zone_id FROM users WHERE coins >= 1000000 ORDER BY coins DESC LIMIT 1").fetchone()
test_user_id = u["user_id"]
start_coins = u["coins"]
con.execute("UPDATE users SET fishing_zone_id = 1 WHERE user_id = ?", (test_user_id,))
con.execute("DELETE FROM fishing_records WHERE user_id = ?", (test_user_id,))
con.commit()
con.close()

def reset():
    con = sqlite3.connect(DST)
    con.execute("UPDATE users SET coins = ? WHERE user_id = ?", (start_coins, test_user_id))
    con.execute("DELETE FROM fishing_records WHERE user_id = ?", (test_user_id,))
    con.execute("UPDATE user_fish_inventory SET quantity = 0 WHERE user_id = ?", (test_user_id,))
    con.execute("UPDATE users SET total_fishing_count = 0 WHERE user_id = ?", (test_user_id,))
    con.commit()
    con.close()

reset()

# 1. Profile a single go_fish
print("=== profile single go_fish ===")
pr = cProfile.Profile()
pr.enable()
for _ in range(5):
    fishing_service.go_fish(test_user_id)
pr.disable()
s = io.StringIO()
ps = pstats.Stats(pr, stream=s).sort_stats("cumulative")
ps.print_stats(40)
print(s.getvalue())

# 2. Count SQL ops per go_fish by hooking execute
print("\n=== count SQL per go_fish ===")
sql_count = 0
real_execute = None
def hooked_execute(self, *a, **kw):
    global sql_count
    sql_count += 1
    return real_execute(self, *a, **kw)
import sqlite3 as _sq
real_execute = _sq.Connection.execute
_sq.Connection.execute = hooked_execute
fishing_service.go_fish(test_user_id)
print(f"SQL ops in 1 go_fish: {sql_count}")
_sq.Connection.execute = real_execute

# 3. Time 99x go_fish in isolation
print("\n=== 99x go_fish timing (5 trials) ===")
times = []
for trial in range(5):
    reset()
    t0 = time.perf_counter()
    for _ in range(99):
        fishing_service.go_fish(test_user_id)
    times.append(time.perf_counter() - t0)
print(f"  best: {min(times):.3f}s, median: {sorted(times)[2]:.3f}s, worst: {max(times):.3f}s")
print(f"  per fish: {min(times)*1000/99:.2f}ms")

# 4. Time 99x with transaction wrapper
print("\n=== 99x go_fish WITH transaction wrapper (P3 path) ===")
times = []
for trial in range(3):
    reset()
    t0 = time.perf_counter()
    with conn_mgr.transaction():
        for _ in range(99):
            fishing_service.go_fish(test_user_id)
    times.append(time.perf_counter() - t0)
print(f"  best: {min(times):.3f}s, median: {sorted(times)[1]:.3f}s, worst: {max(times):.3f}s")
print(f"  per fish: {min(times)*1000/99:.2f}ms")

os.remove(DST)
PYEOF

python /tmp/profile_go_fish.py 2>&1 | tail -80
