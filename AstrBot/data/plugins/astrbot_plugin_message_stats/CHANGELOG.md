# 更新日志

## v2.0.2 (2026-05-21)

### ✨ 新功能
- **手绘卡通主题系列**：`premium_light` / `premium_dark` 替换为 `cartoon_light` / `cartoon_dark` 两款手绘卡通风格排行榜主题，采用 ZCOOL KuaiLe 卡通字体、不规则圆角、粗边框阴影偏移、星星装饰等手绘元素

## v2.0.1 (2026-05-21)

### 🐛 Bug 修复
- **修复 `#设置发言榜数量` 命令报错**：`MAX_RANK_COUNT` 类常量缺失导致 `self.MAX_RANK_COUNT` 触发 `AttributeError`，现已补全
- **修复 WebUI 排行榜输出模式选项不可选**：`_conf_schema.json` 中 `if_send_pic` 使用了不支持的 `value`/`label` 对象格式且 `default` 类型不匹配，改用标准 `options` 数组格式

## v2.0.0 (2026-05-20)

### ✨ 新功能
- **Premium 高级主题系列**：新增 `premium_light` / `premium_dark` 两款毛玻璃质感排行榜主题，支持七彩渐变标题、发光阴影、阶梯式前三名放大效果、发言占比填充条等高级视觉特性
- **自动主题切换双向映射**：`_get_auto_theme()` 新增 `light_theme_map` 深→浅映射表，`premium_dark` / `liquid_glass_dark` 在浅色时段自动切回对应的浅色版本，实现与 `liquid_glass` 一致的双向对称切换
- **Header 排版全面升级**：标题字号 32px → 40px，发言总数 36px → 44px，标签样式增强，Header 内边距和间距优化，垂直居中更完美

### 🐛 Bug 修复
- **修复表情包/语音/图片不计数**：`auto_message_listener` 使用 `if not message_str or ...` 判断导致非文本消息（`message_str` 为空）被直接跳过统计，改为 `if message_str and ...` 后只跳过命令消息，表情包/语音/图片等非文本消息正常计数
- **修复定时触发时多重发送问题**：将 `utils/timer_manager.py` 的文件锁机制修改为跨进程唯的 UUID，彻底解决了当插件存在多个实例时，锁失效导致发送重复图片的问题
- **去除多余的排行榜前缀标题**：移除了 `main.py` 和 `timer_manager.py` 生成标题时如"今日"、"本周"等前缀字样，消除与日期的重复

## v1.9.8 (2026-05-10)

### 🐛 Bug 修复

- **修复 `#设置发言榜数量` 命令报错**：`MAX_RANK_COUNT` 类常量缺失导致 `self.MAX_RANK_COUNT` 触发 `AttributeError`，现已补全
- **修复 WebUI 排行榜输出模式选项不可选**：`_conf_schema.json` 中 `if_send_pic` 使用了不支持的 `value`/`label` 对象格式且 `default` 类型不匹配，改用标准 `options` 数组格式

## v1.9.7 (2026-05-10)

### ✨ 新功能

- **Web 面板全新 UI 升级**：发言统计面板新增 Dock 栏时段切换（总/日/周/月/年）、群组迷你折线图（近7天发言趋势）、群组按总发言数排序、切换动画优化

### 🐛 Bug 修复

- **LLM 头衔频繁触发**：`llm_title` 存为空字符串 `""` 时被 `not u.llm_title` 误判为无头衔，导致每次都重新生成。已修复：改用 `bool(u.llm_title and u.llm_title.strip())` 判断有效头衔
- **`page_stats` API 群组列表顺序随机**：已修复：按总发言数降序排序

## v1.9.4 (2026-05-09)


### 🐛 Bug 修复

- **定时/手动推送排行榜类型硬编码**：`_push_to_group()` 中硬编码 `RankType.DAILY`，导致用户在 WebUI 设置的 `timer_rank_type` 配置完全无效。已修复：改为读取 `config.timer_rank_type`，定时推送和手动推送均可使用用户配置的排行榜类型。
- **`#手动推送发言榜` 群组ID格式解析错误**：当 `timer_target_groups` 中存储 `Amy:GroupMessage:1081839722` 格式时，`manual_push()` 直接传入 `_push_to_group()` 导致 `get_group_data()` 校验失败。已修复：统一添加 unified_msg_origin 格式的群组 ID 提取逻辑。
- **LLM 头衔生成重复调用浪费 Tokens**：`_push_to_group()` 中先对全体用户调用 `llm_analyzer.analyze_users()` 后才筛选已有持久化头衔的用户，导致每次推送都浪费一次 LLM 调用。已修复：先筛选出无头衔用户，只对这部分用户调用 LLM。

### 🧹 代码清理

- **移除冗余 `pydantic` 依赖**：插件中未使用 pydantic，且 AstrBot 框架已自带，`requirements.txt` 中已移除。
- **`metadata.yaml` 添加 `astrbot_version` 声明**：添加 `astrbot_version: ">=4.16"`，确保版本兼容性检查。

## v1.9.3 (2026-05-07)

### 🔐 安全改进

- **管理命令增加管理员权限限制**：为发言榜配置、清空数据、刷新缓存、手动推送和定时推送管理命令添加 `@filter.permission_type(filter.PermissionType.ADMIN)`，避免普通群成员修改配置或清除统计数据。

## v1.9.2 (2026-05-07)

### 🐛 Bug 修复

- **临时文件泄漏全面修复**：`_check_milestone()`、`show_my_milestone()`、`_push_to_group()` 三处清理代码不在 try/finally 中，send_message 抛异常时跳过清理导致 tmp 文件残留。已修复：全部改用 try/finally 确保清理。
- **异常关闭时 tmp 文件残留**：插件被 kill -9/OOM/断电时 finally 不会执行。已修复：新增 `_cleanup_stale_temp_files()`，启动时扫描清理。
- **删除冗余的 `_calculate_daily_rank` 方法**：与 `_calculate_period_rank_optimized` 逻辑重复，统一走批量优化路径。
- **`image_generator.py` 缺少 `await`**：`_load_user_item_macro_template()` 调用缺少 `await`，导致用户条目宏模板无法正确加载。
- **`data_manager.py` 不完整语句**：`cleanup_old_data()` 方法中 `except (ValueError, TypeError): self` 为无意义语句。
- **`image_generator.py` `await` 在同步方法中**：`_generate_user_item_html_safe()` 是同步方法，错误地使用了 `await`，导致插件加载报错 `await outside async function`。
- **Web 面板头衔为空**：`page_stats` API 读取了运行时字段 `display_title`，持久化存储的是 `llm_title`，Web 页面直接读文件时头衔为空。
- **Web 面板头衔颜色缺失**：`page_stats` 未返回 `title_color` 字段，前端用固定 CSS 颜色渲染，与排行榜图片不一致。
- **Web 设置中 llm_system_prompt 为空**：用户保存配置后空值被持久化，升级插件也不会被 schema 默认值覆盖。

### 🔧 性能优化

- **`_is_blocked_user/group` 改用 set 缓存**：将屏蔽用户/群聊列表预缓存为 `set`，O(n) 列表遍历 → O(1) 集合查找。
- **`_check_milestone` 里程碑 set 缓存**：将 `milestone_targets` 缓存为 `_milestone_set`，避免每次创建 O(n) 的 set。
- **切换为 orjson**：替换标准库 `json` 为 `orjson`，序列化/反序列化性能提升 2-5 倍。

### 🧹 代码简化与清理

- **简化命令方法的异常处理**：将 `_record_message_stats`、`set_rank_count` 等方法的 11 个 `except` 子句合并为统一的 `except Exception`，代码缩减 60+ 行。
- **删除未使用的 `_handle_command_exception` 方法**：该公共异常处理方法从未被调用，已删除。
- **清理重复的局部 import**：删除 `_load_unified_msg_origins`、`_save_unified_msg_origins`、`_load_group_names`、`_save_group_names` 中的 `import json`，以及 `_check_milestone` 中的 `import aiofiles`。
- **`_conf_schema.json` 类型统一**：`if_send_pic` 配置项改用 `{value, label}` 格式，默认值改为 int 类型 0/1。

### ✅ 新增测试

- **添加单元测试**：新增 `test_plugin.py`，覆盖数据模型、验证器、缓存状态等核心逻辑。

## v1.9.1 (2026-05-07)

- 跨平台真实头像获取（TG Bot API / Discord CDN）
- i18n 国际化文件全面优化
- 新增 `tg_bot_token` / `dc_bot_token` 配置项
- 新增 `aiohttp>=3.9.0` 依赖
- LLM 头衔持久化，重启后保留
- LLM 头衔稳定不变，新增用户才触发 LLM
- 头像跨平台支持（QQ qlogo / TG/DC 彩色文字回退）
- 定时任务改用文件锁防止重复推送
- 国际化文案覆盖问题修复

## v1.9.0 (2026-05-05)


- Web 数据管理面板大升级
- 群组数据删除功能
- 群名称持久化缓存
- 多项 Bug 修复
- Web 面板支持跟随系统深色/浅色模式

## v1.8.8 (2026-05-05)

- 放宽排行榜昵称显示限制
- 修复图片生成失败时 tmp 文件积累
- 修复手动查询里程碑后 tmp 文件不清理
- unified_msg_origin 持久化

## v1.8.7 (2026-05-04)

- LLM 头衔配色大师
- 修复定时推送头衔颜色丢失
- 修复 LLM 头衔不显示的问题
- 修复头衔显示为字典字符串
- 修复头衔颜色硬编码
- 修复头衔徽章垂直不对齐
- LLM 分析范围与排行榜显示人数绑定
- 修复 Fallback 渲染路径忽略头衔颜色
- 优化 Web 面板配置文案

## v1.8.5 (2026-05-04)

- 修复 `_handle_command_exception` 缺少 yield
- 修复昵称双重 HTML 转义
- 修复 TG 负数用户 ID 崩溃
- 修复定时推送没有数据
- 修复群组锁清理条件缺陷
- dirty_cache 添加大小上限

## v1.8.2 (2026-05-03)

- 修复数据丢失问题
- 修复今日发言榜无法使用
- 浏览器懒加载与高并发支持
- 按天聚合字典存储优化
- 延迟批量写入优化
- 发言里程碑推送
- 新增更新日志文档
- 紧凑 JSON 格式，文件体积减少约 50%
