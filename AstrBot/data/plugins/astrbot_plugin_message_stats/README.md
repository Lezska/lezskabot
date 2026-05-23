![:name](https://count.getloli.com/@astrbot_plugin_message_stats?name=astrbot_plugin_message_stats&theme=green&padding=7&offset=0&align=top&scale=1&pixelated=1&darkmode=auto&prefix=0)

# AstrBot 群发言统计插件

> 🤖 **此插件由AI辅助生成**

一个功能强大的AstrBot群消息统计插件，支持自动统计群成员发言次数并生成排行榜。

![Preview](https://github.com/xiaoruange39/Plugin-Preview-Image/blob/main/image/E2EB0A38BA876A2227FA99D997CA1969.jpg) 

## 🚀 安装说明

### 方式一：直接下载
1. 下载插件压缩包 `astrbot_plugin_message_stats.zip`
2. 解压到AstrBot插件目录：`/AstrBot/data/plugins/`
3. 重启AstrBot

### 方式二：Git克隆
```bash
cd /AstrBot/data/plugins/
git clone https://github.com/xiaoruange39/astrbot_plugin_message_stats.git
```

## 📖 使用方法

### 基础命令

#### 查看排行榜
- `#发言榜` - 查看总发言排行榜
- `#今日发言榜` - 查看今日发言排行榜  
- `#本周发言榜` - 查看本周发言排行榜
- `#本月发言榜` - 查看本月发言排行榜
- `#本年发言榜` - 查看本年发言排行榜
- `#去年发言榜` - 查看去年发言排行榜

#### 管理命令
- `#设置发言榜数量 [数量]` - 设置排行榜显示人数（1-100）
- `#设置发言榜图片 [模式]` - 设置显示模式（1=图片，0=文字）
- `#清除发言榜单` - 清除本群发言统计数据

#### 缓存管理命令
- `#刷新发言榜群成员缓存` - 手动刷新群成员缓存
- `#发言榜缓存状态` - 查看缓存状态

#### 定时功能命令
- `#发言榜定时状态` - 查看定时任务状态
- `#手动推送发言榜` - 手动推送排行榜
- `#设置发言榜定时时间 [时间]` - 设置定时推送时间
- `#设置发言榜定时群组 [群号]` - 添加定时推送群组
- `#设置发言榜定时群组 [群号1] [群号2]` - 添加多个定时推送群组
- `#删除发言榜定时群组 [群号]` - 删除定时推送群组
- `#启用发言榜定时` - 启用定时推送
- `#禁用发言榜定时` - 禁用定时推送
- `#设置发言榜定时类型 [类型]` - 设置定时推送类型

### 使用示例

```
#发言榜
总发言排行榜
发言总数: 156
━━━━━━━━━━━━━━
第1名：小明·45次（占比28.85%）
第2名：小红·32次（占比20.51%）
第3名：小刚·28次（占比17.95%）
```

```
#设置发言榜数量 10
排行榜显示人数已设置为 10 人！
```

```
#设置发言榜图片 1
排行榜显示模式已设置为 图片模式！
```

```
#设置发言榜定时时间 20:00
定时推送时间已设置为 20:00
```

## ⚙️ 配置说明

### 插件配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `theme` | string | `default` | 排行榜主题风格：`default`（手绘卡通浅色）、`cartoon_light`（手绘卡通浅色）、`cartoon_dark`（手绘卡通深色）、`liquid_glass`（液态玻璃）、`liquid_glass_dark`（液态玻璃暗色） |
| `auto_theme_switch` | bool | `false` | 是否根据时间自动切换主题（浅色/深色），启用后会覆盖手动设置的 theme |
| `theme_switch_light_time` | string | `06:00` | 浅色主题开始时间，格式 HH:MM |
| `theme_switch_dark_time` | string | `18:00` | 深色主题开始时间，格式 HH:MM |
| `rand` | int | `20` | 排行榜显示人数（1-100） |
| `if_send_pic` | string | `图片` | 排行榜输出模式：`图片` 或 `文字` |
| `detailed_logging_enabled` | bool | `true` | 是否开启详细日志记录 |
| `timer_enabled` | bool | `false` | 是否启用定时推送排行榜功能 |
| `timer_push_time` | string | `09:00` | 定时推送时间（支持 HH:MM 或 cron 格式） |
| `timer_target_groups` | list | `[]` | 定时推送目标群组ID列表（支持群号或 unified_msg_origin 格式） |
| `timer_rank_type` | string | `daily` | 定时推送排行榜类型：`daily`/`total`/`weekly`/`monthly`/`yearly`/`lastyear` |
| `milestone_enabled` | bool | `false` | 发言里程碑推送，用户发言达到里程碑次数时自动推送排行榜 |
| `milestone_targets` | list | `[666, 1000, 2333, 5000, 6666, 10000, 23333]` | 触发推送的发言次数里程碑列表 |
| `blocked_users` | list | `[]` | 屏蔽用户列表 |
| `blocked_groups` | list | `[]` | 屏蔽群聊列表 |
| `tg_bot_token` | string | `` | Telegram Bot Token，填写后可获取TG用户真实头像 |
| `dc_bot_token` | string | `` | Discord Bot Token，填写后可获取DC用户真实头像 |
| `llm_enabled` | bool | `false` | 启用 LLM 发言头衔分析，定时推送排行榜时生成个性化头衔 |
| `llm_provider_id` | string | `` | LLM Provider ID，留空使用默认 |
| `llm_system_prompt` | text | 默认提示词 | 头衔生成提示词模板，可自定义风格和颜色 |
| `llm_max_retries` | int | `2` | LLM 调用失败时的重试次数 |
| `llm_min_daily_messages` | int | `0` | 每日发言次数最小值，低于此值不生成头衔 |
| `llm_enable_on_manual` | bool | `false` | 手动查询排行榜时也调用LLM分析（会产生Token消耗） |

### 配置方式
1. 通过AstrBot Web面板配置（推荐）
2. 通过命令配置
3. 编辑配置文件：`data/config.json`

## 📁 文件结构

```
astrbot_plugin_message_stats/
├── main.py                 # 主程序文件
├── metadata.yaml          # 插件元数据
├── README.md              # 说明文档
├── requirements.txt       # 依赖包
├── config.yaml           # 配置文件
├── example_config.json   # 配置示例
├── _conf_schema.json     # 配置架构（Web面板配置定义）
├── data/                 # 数据目录
│   ├── config.json       # 用户配置
│   └── cmd_config.json   # 命令配置
├── templates/            # 模板目录
│   ├── __init__.py
│   ├── rank_template.html # 排行榜默认模板
│   ├── rank_template_cartoon_light.html # 手绘卡通浅色主题
│   ├── rank_template_cartoon_dark.html # 手绘卡通深色主题
│   ├── rank_template_liquid_glass.html # 液态玻璃主题模板
│   └── rank_template_liquid_glass_dark.html # 液态玻璃暗色主题模板
└── utils/                # 工具模块
    ├── __init__.py
    ├── data_manager.py   # 数据管理
    ├── data_stores.py    # 数据存储
    ├── date_utils.py     # 日期工具
    ├── file_utils.py     # 文件工具
    ├── image_generator.py # 图片生成
    ├── models.py         # 数据模型
    ├── platform_helper.py # 跨平台兼容辅助
    ├── timer_manager.py  # 定时管理
    └── validators.py     # 数据验证
```

## 🌐 跨平台支持

本插件现已支持以下平台：
- **QQ（OneBot）** - 完整功能支持
- **Telegram** - 完整功能支持
- **Discord** - 完整功能支持
- **飞书（Lark/Feishu）** - 完整功能支持

## 📝 更新日志

### v2.0.2 (2026-05-21)
- ✅ 手绘卡通主题（cartoon_light/cartoon_dark）

### v2.0.1 (2026-05-21)
- ✅ 修复 #设置发言榜数量 命令报错
- ✅ 修复 WebUI 排行榜输出模式选项不可选

### v1.9.1 (2026-05-07)
- ✅ 跨平台真实头像获取
- ✅ i18n 国际化文件全面优化
- ✅ 新增 tg_bot_token/dc_bot_token 配置
- ✅ LLM 头衔持久化

### v1.9.0 (2026-05-05)
- ✅ 新增插件Pages页面
- ✅ 新增群组数据删除功能(Pages页面)
- ✅ 群名称持久化缓存
- ✅ 多项错误修复

### v1.8.7 (2026-05-04)
- ✅ LLM 头衔配色大师

### v1.8.2 (2026-05-03)
- ✅ 优化浏览器资源占用
- ✅ 修复数据丢失问题
- ✅ 新增发言里程碑推送
- ✅ 新增更新日志文档

### v1.7.4 (2026-01-02)
- ✅ 屏蔽群聊列表配置
- ✅ 本年/去年发言榜指令

### v1.6.5 (2025-11-24)
- ✅ 指令别名支持
- ✅ 昵称同步修复
- ✅ 屏蔽用户列表配置

### v1.6.0 (2025-11-05)
- ✅ 完善定时推送
- ✅ 增强缓存管理

### v1.0 (2025-11-02)
- ✅ 完整功能发布

### v0.9 (之前版本)
- 基础消息统计与排行榜

## 🤝 贡献指南

欢迎提交Issue和Pull Request！

## 📄 许可证

本项目采用 MIT 许可证。

## 👨‍💻 作者

**xiaoruange39**
- GitHub: [@xiaoruange39](https://github.com/xiaoruange39)
- 插件开发：AstrBot生态贡献者
- QQ群：[QQ群](https://qm.qq.com/q/8kdJ2Bzf6S)

## 🙏 致谢

感谢以下项目和插件的参考：
- [AstrBot框架](https://astrbot.app/) - 强大的多平台聊天机器人框架
- [yunzai-plugin-example](https://github.com/KaedeharaLu/yunzai-plugin-example) - 原始插件基础架构参考

---

**如果这个插件对您有帮助，请给个⭐支持一下！**
