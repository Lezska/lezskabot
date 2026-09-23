#!/bin/bash
set -e
cd /root/lezskabot/AstrBot
source venv/bin/activate

cat > /tmp/profile_go_fish2.py << 'PYEOF'
"""Time 99x go_fish with realistic AstrBot-style DB contention."""
import sys, os, shutil, time, sqlite3, types, threading, random

SRC = "/root/lezskabot/AstrBot/data/fish.db"
DST = "/tmp/fish_profile2.db"
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

# Get multiple test users
con = sqlite3.connect(DST)
con.row_factory = sqlite3.Row
users = con.execute("SELECT user_id, coins, fishing_zone_id FROM users WHERE coins >= 10000 AND fishing_zone_id IS NOT NULL ORDER BY coins DESC LIMIT 5").fetchall()
con.close()
test_user_id = users[0]["user_id"]
start_coins = users[0]["coins"]
print(f"primary user: {test_user_id} start_coins={start_coins}")

def reset():
    con = sqlite3.connect(DST)
    con.execute("UPDATE users SET coins = ? WHERE user_id = ?", (start_coins, test_user_id))
    con.execute("DELETE FROM fishing_records WHERE user_id = ?", (test_user_id,))
    con.execute("UPDATE user_fish_inventory SET quantity = 0 WHERE user_id = ?", (test_user_id,))
    con.execute("UPDATE users SET total_fishing_count = 0 WHERE user_id = ?", (test_user_id,))
    con.commit()
    con.close()

# Contention simulator: 5 background threads doing random SQL (mimic other plugins)
def make_contender(idx):
    def work():
        c = sqlite3.connect(DST, timeout=5)
        c.execute("PRAGMA journal_mode = WAL")
        rng = random.Random(idx)
        for _ in range(50):
            # Simulate message_stats / koishi / other plugin doing read+write
            r = c.execute("SELECT user_id, coins FROM users ORDER BY RANDOM() LIMIT 1").fetchone()
            if r and r[1] > 100:
                c.execute("UPDATE users SET coins = coins - 1 WHERE user_id = ?", (r[0],))
            c.commit()
        c.close()
    return work

# Trial 1: no contention (best case for current code)
reset()
print("\n=== trial 1: NO contention ===")
t0 = time.perf_counter()
for _ in range(99):
    fishing_service.go_fish(test_user_id)
t1 = time.perf_counter() - t0
print(f"  99 go_fish: {t1:.2f}s, per fish: {t1*1000/99:.2f}ms")

# Trial 2: with 5 background threads
reset()
print("\n=== trial 2: 5 bg threads contention ===")
threads = [threading.Thread(target=make_contender(i)) for i in range(5)]
for t in threads:
    t.start()
t0 = time.perf_counter()
for _ in range(99):
    fishing_service.go_fish(test_user_id)
t1 = time.perf_counter() - t0
for t in threads:
    t.join()
print(f"  99 go_fish: {t1:.2f}s, per fish: {t1*1000/99:.2f}ms")

# Trial 3: with 5 bg threads + P3 transaction
reset()
print("\n=== trial 3: 5 bg threads + P3 transaction ===")
threads = [threading.Thread(target=make_contender(i)) for i in range(5)]
for t in threads:
    t.start()
t0 = time.perf_counter()
with conn_mgr.transaction():
    for _ in range(99):
        fishing_service.go_fish(test_user_id)
t1 = time.perf_counter() - t0
for t in threads:
    t.join()
print(f"  99 go_fish (P3 txn): {t1:.2f}s, per fish: {t1*1000/99:.2f}ms")

# Trial 4: with 5 bg threads, but no transaction (just to confirm P3 helps)
reset()
print("\n=== trial 4: 5 bg threads, no transaction (re-verify P3 helps) ===")
threads = [threading.Thread(target=make_contender(i)) for i in range(5)]
for t in threads:
    t.start()
t0 = time.perf_counter()
for _ in range(99):
    fishing_service.go_fish(test_user_id)
t1 = time.perf_counter() - t0
for t in threads:
    t.join()
print(f"  99 go_fish: {t1:.2f}s, per fish: {t1*1000/99:.2f}ms")

os.remove(DST)
PYEOF

python /tmp/profile_go_fish2.py 2>&1 | tail -40
