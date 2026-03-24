<div align="center">
<img style="width:70%" src="https://count.getloli.com/@astrbot_plugin_GroupMemberQuery?name=astrbot_plugin_GroupMemberQuery&theme=booru-lewd&padding=5&offset=0&align=top&scale=1&pixelated=1&darkmode=auto" alt=":name">
</div>


# AstrBot 群成员查询插件

一款为AstrBot机器人框架设计的QQ群成员信息获取插件，支持自动响应LLM查询需求与手动触发测试，仅适配aiocqhttp平台。

## 插件概览

| 项目                | 说明                                                                 |
|---------------------|----------------------------------------------------------------------|
| 插件名称            | 群成员查询                                                       |
| 作者                | 糯米茨                                                               |
| 版本                | v0.1.0                                                               |
| 支持平台            | 仅支持aiocqhttp（QQ群聊）                                            |
| 核心功能            | 获取QQ群成员信息（QQ号、群昵称、QQ名、身份角色）并交由LLM处理        |
| 项目地址            | [https://github.com/糯米茨/astrbot_plugin_group_member](https://github.com/糯米茨/astrbot_plugin_group_member) |


## 功能介绍

插件提供两类核心能力，覆盖自动响应与手动操作场景：

### 1. LLM工具自动调用
当LLM识别到用户的相关提问时，会自动触发`get_group_members_info`工具获取数据，支持的典型场景包括：
- 询问群成员数量（如：“这个群有多少人？”）
- 查询群内成员列表（如：“群里都有哪些人？”）
- 确认特定成员是否在群内（如：“XXX在这个群里吗？”）
- 获取成员的QQ号或群昵称（如：“XXX的QQ号是多少？”）

工具返回的信息包含：群ID、成员总数、成员详情（QQ号、群昵称、QQ名、身份角色）。

### 2. 手动命令辅助
提供两条手动命令，用于测试插件可用性与查看帮助：
- `测试群成员` / `test_members`：手动触发成员查询，格式化显示前300名成员信息（避免消息过长）。
- `群成员帮助`：显示插件功能说明、使用方法与版本信息。


## 安装方法

### 前提条件
- 已部署AstrBot机器人框架。
- 机器人已配置aiocqhttp适配器（仅支持QQ平台）。
- 机器人账号具备目标QQ群的成员信息查看权限。

### 安装步骤
- 直接在astrbot的插件市场搜索“糯米茨”找到目标插件，点击安装，等待完成即可

- 也可以克隆源码到插件文件夹：

```bash
# 克隆仓库到插件目录
cd /AstrBot/data/plugins
git clone https://github.com/nuomicici/astrbot_plugin_GroupMemberQuery

# 控制台重启AstrBot
```


## 使用说明

### 1. 自动调用（LLM驱动）
无需手动触发，直接向机器人提问即可，示例：
- 用户：“咱们群现在有多少成员？”
- 机器人：（自动调用工具后回答）“当前群（群ID：123456）共有89名成员。”

### 2. 手动命令使用
在QQ群内发送以下命令即可触发对应功能：

#### 命令1：测试群成员
- 用法：发送 `测试群成员` 或 `test_members`
- 输出示例：
  ```
  该命令仅用于测试工具可用性
  工具调用耗时 0.32s

  群成员信息 (共89人，显示前89人):
  糯米茨(糯米团子)(123456)[群主]
  小明(明明)(654321)[管理]
  小红(红红)(789012)[成员]
  ...
  ```

#### 命令2：群成员帮助
- 用法：发送 `群成员帮助`
- 输出：插件版本、功能说明、可用命令等帮助信息。


## 数据格式说明

### 工具返回JSON结构
`get_group_members_info`工具返回的JSON数据格式如下（已格式化）：

```json
{
  "group_id": "123456",
  "member_count": 89,
  "members": [
    {
      "user_id": "123456",
      "display_name": "糯米茨",
      "username": "糯米团子",
      "role": "owner"
    },
    {
      "user_id": "654321",
      "display_name": "小明",
      "username": "明明",
      "role": "admin"
    },
    {
      "user_id": "789012",
      "display_name": "小红",
      "username": "红红",
      "role": "member"
    }
  ]
}
```

### 字段说明
| 字段名         | 含义                                                                 |
|----------------|----------------------------------------------------------------------|
| `group_id`     | 群聊的QQ群ID                                                         |
| `member_count` | 群内成员总数                                                         |
| `members`      | 成员详情数组                                                         |
| `user_id`      | 成员的QQ号（字符串格式）                                             |
| `display_name` | 成员的群昵称（若未设置则显示QQ名，均未设置则显示“用户+QQ号”）         |
| `username`     | 成员的QQ昵称（若未设置则显示“用户+QQ号”）                           |
| `role`         | 成员身份（`owner`：群主，`admin`：管理员，`member`：普通成员）        |

### 错误返回格式
当出现异常时，工具返回包含`error`字段的JSON：
```json
{
  "error": "获取群成员信息失败，可能是权限不足或网络问题"
}
```


## 注意事项
1. **平台限制**：插件仅支持aiocqhttp平台（QQ群聊），其他平台调用会返回“不支持的平台”错误。
2. **权限问题**：若机器人无群成员查看权限，会返回“获取失败”错误，请检查机器人在群内的身份。
3. **数量限制**：`测试群成员`命令仅显示前300名成员，避免消息超出QQ的字数限制。
4. **性能提示**：群成员数量较多时，查询可能耗时稍长（插件会记录耗时并输出到日志）。


## 常见问题（FAQ）

### Q1：为什么调用工具后返回“这不是群聊”？
A：插件仅支持群聊场景，在私聊窗口调用会触发此错误，请在目标QQ群内使用。

### Q2：获取成员信息失败，提示“权限不足”怎么办？
A：确保机器人账号已加入目标群聊，且群设置未限制“群成员列表”的查看权限。

### Q3：LLM为什么没有自动调用工具？
A：LLM需要支持函数调用。



## 更新日志

终于端上来啦！

---

**作者**: 糯米茨  
**联系方式**: 
- [GitHub Issues](https://github.com/nuomicici/astrbot_plugin_GroupMemberQuery/issues)  
- [QQ](https://qm.qq.com/q/wMGXYfKKoS)
