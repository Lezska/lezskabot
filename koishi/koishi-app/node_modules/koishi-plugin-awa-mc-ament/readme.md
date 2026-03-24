# koishi-plugin-awa-mc-ament

[![npm](https://img.shields.io/npm/v/koishi-plugin-awa-mc-ament?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-awa-mc-ament)
[![npm-download](https://img.shields.io/npm/dm/koishi-plugin-awa-mc-ament?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-awa-mc-ament)

🎮 **Koishi 插件：awa-mc-ament - Minecraft 成就生成器**

生成 Minecraft 风格的成就/进度图片，支持自定义标题、描述和图标。

---

## 📦 安装

```bash
npm install koishi-plugin-awa-mc-ament
```

或在 Koishi 控制台的插件市场中搜索 `awa-mc-ament` 安装。

---

## ✨ 功能特性

- 🎨 生成 Minecraft 风格的成就图片
- 🖼️ 支持多种图标来源（游戏图标、用户头像、自定义图片等）
- 🎮 可选的 PyTorch 语义搜索后端支持
- 📸 支持多种图片格式输出（JPEG、PNG、WebP）
- 🔤 自动下载字体文件，无需手动配置

---

## 🔍 图标获取优先级

本插件会按照以下优先级自动选择图标来源：

1. 🎮 **Minecraft 游戏图标**（需要启用 [PyTorch 后端服务](https://gitee.com/vincent-zyu/fastapi-awa-fuzzy-search-backend)）
2. 💬 **引用消息的图片**
3. 🖼️ **参数传入的图片**
4. 👤 **@用户的头像**
5. 🎲 **默认幸运方块图标**（fallback）

---

## 📝 使用示例

### 1️⃣ 使用 Minecraft 游戏图标（需要后端）

```bash
ament -t 挖到钻石！ -d 获得钻石 --mcicon 钻石
```

借助 PyTorch+FastAPI 后端，进行语义相似度检测，选出 Minecraft 图片文件作为 icon。

![mcicon示例](https://gitee.com/vincent-zyu/koishi-plugin-awa-mc-ament/releases/download/example-image/ament-mcicon.jpg)

---

### 2️⃣ 使用引用消息的图片

先引用一条包含图片的消息，然后发送：

```bash
ament -t 标题 -d 介绍
```

使用引用消息的第一张图片作为 icon。

![quote示例](https://gitee.com/vincent-zyu/koishi-plugin-awa-mc-ament/releases/download/example-image/ament-quote.jpg)

---

### 3️⃣ 使用传入的图片参数

```bash
ament -t 标题 -d 介绍 --icon [图片]
```

使用传入的 icon 图片参数作为 icon。

![cmd-arg示例](https://gitee.com/vincent-zyu/koishi-plugin-awa-mc-ament/releases/download/example-image/ament-cmd-arg-image.jpg)

---

### 4️⃣ 使用 @用户的头像

```bash
ament -t 标题 -d 介绍 @某人
```

使用 session 消息中第一个艾特元素的用户头像作为 icon。

![at示例](https://gitee.com/vincent-zyu/koishi-plugin-awa-mc-ament/releases/download/example-image/ament-at.jpg)

---

### 5️⃣ 使用默认幸运方块图标

```bash
ament -t 标题 -d 介绍
```

fallback 到默认准备好的幸运方块问号 icon。

![fallback示例](https://gitee.com/vincent-zyu/koishi-plugin-awa-mc-ament/releases/download/example-image/ament-default-fallback-luckyblock.jpg)

---

## ⚙️ MC 图标后端（可选）

如需使用 `--mcicon` 参数进行 Minecraft 游戏图标搜索，请：

1. 启用配置项中的 **"启用MC图标后端服务"**
2. 自行部署 PyTorch+FastAPI 后端服务
3. 配置后端地址（默认：`http://localhost:8989`）

**后端项目地址：**  
🔗 [https://gitee.com/vincent-zyu/fastapi-awa-fuzzy-search-backend](https://gitee.com/vincent-zyu/fastapi-awa-fuzzy-search-backend)

---

## 🔧 配置项

### Args - 参数相关
- `banAtUserArg`：是否禁止使用 at 用户作为成就图标来源（QQ 官机建议打开）

### Assets - 静态资源相关
- `fontPath`：字体文件绝对路径（自动下载，无需手动配置）
- `bgPath`：背景图绝对路径

### Puppeteer - 浏览器配置
- `browserScreenshotquality`：截图质量参数（0-100）
- `browserScreenshotFormat`：截图输出格式（JPEG/PNG/WebP）

### MCICON - 后端服务相关
- `enableMciconBackend`：是否启用 MC 图标后端服务
- `mciconBackendAddres`：mc 图标后端地址（完整 URL）

### Debug - 调试相关
- `VerboseLoggerMode`：是否开启详细输出

---

## 💬 交流反馈

插件使用问题 / Bug反馈 / 插件开发交流，欢迎加入 QQ 群：**259248174**

---

## 📜 许可声明

本插件为开源免费项目，基于 MIT 协议开放。欢迎修改、分发与二次开发。

---

## 🙏 致谢

- 字体：[Minecraft AE](https://www.fontspace.com/minecraft-font-f28180)
- 灵感来源：Minecraft 游戏成就系统

