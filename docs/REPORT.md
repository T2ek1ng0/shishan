# 打鸟图鉴 (Birdwatching Handbook) - 项目报告与设计思路

## 1. 项目概述
**打鸟图鉴** 是一款专为观鸟爱好者设计的桌面应用程序。它集成了智能鸟类识别、鸟类知识查询、观鸟记录管理以及社交分享地图等功能，旨在为用户提供一站式的观鸟辅助体验。

### 技术栈
- **前端/主框架**: Electron, HTML5, CSS3, JavaScript (Vanilla)
- **后端/云服务**: Supabase (PostgreSQL, Auth, Storage)
- **AI/算法**: Python (PyTorch, ResNet), 阿里云 DashScope (LLM)
- **进程通信**: Electron IPC (Inter-Process Communication)

---

## 2. 功能模块与设计思路

### 2.1 智能认鸟 (Bird Classification)
- **功能**: 用户上传鸟类图片，系统自动识别鸟类名称。
- **设计**:
  - 采用 **Python 子进程** 模式。Electron 主进程通过 `spawn` 启动一个 Python 脚本 (`model_predict.exe`)。
  - Python 脚本加载预训练的 ResNet 模型，通过标准输入输出 (stdin/stdout) 与 Electron 通信。
  - **优势**: 将繁重的 AI 推理任务与 UI 线程分离，避免界面卡顿，同时利用了 Python 丰富的 AI 生态。

### 2.2 图鉴查询与今日推荐 (Knowledge & Recommendation)
- **功能**:
  - **按地区/名称查询**: 用户输入地区或鸟名，获取相关鸟类分布或习性介绍。
  - **今日推荐**: 根据当前时间和用户所在地区，推荐适合的观鸟地点。
- **设计**:
  - 接入 **阿里云 DashScope (通义千问)** 大模型 API。
  - 通过构造特定的 Prompt（提示词），让 LLM 扮演鸟类专家的角色返回结构化或总结性的文本。
  - **优势**: 相比传统数据库查询，LLM 能提供更灵活、更人性化的自然语言回答。

### 2.3 我的记录 (Personal Records)
- **功能**: 用户可以添加、查看和删除个人的观鸟记录（文本+图片）。
- **设计**:
  - **双模存储**: 支持本地 JSON 文件存储（离线可用）和 Supabase 云端存储（登录后同步）。
  - **数据同步**: 登录状态下优先读取云端数据，保证多设备间的数据一致性。

### 2.4 观鸟地图 (Social Map)
- **功能**: 一个基于地理位置的社交平台。用户可以在地图上分享观鸟点，查看他人的记录，并进行点赞和评论。
- **设计**:
  - **地图引擎**: 使用 Leaflet.js 展示地图和标记点。
  - **社交互动**:
    - **点赞/评论**: 数据实时存储于 Supabase 的 `likes` 和 `comments` 表。
    - **个人资料**: 用户可以设置昵称和头像，这些信息会在评论区和记录详情中展示。
  - **多图支持**: 记录支持上传多张图片，存储于 Supabase Storage，并在前端以画廊形式展示。

### 2.5 用户系统 (User System)
- **功能**: 注册、登录、个人信息管理。
- **设计**:
  - 基于 **Supabase Auth** 实现安全的身份认证。
  - **个人资料**: 独立的 `profiles` 表存储用户昵称和头像，通过 RLS (Row Level Security) 策略保障数据安全（用户只能修改自己的资料）。

---

## 3. 关键技术实现

### 3.1 进程间通信 (IPC)
项目大量使用了 Electron 的 `ipcMain` 和 `ipcRenderer`。前端页面不直接操作数据库或文件系统，而是发送 IPC 消息给主进程，主进程处理完毕后返回结果。这种架构提高了应用的安全性。

### 3.2 网络弹性设计
针对国内访问 Supabase 可能不稳定的情况，封装了 `supabaseWithRetry` 函数。
- **机制**: 当请求失败或超时时，自动进行指数退避重试（Exponential Backoff）。
- **效果**: 显著降低了因网络波动导致的请求失败率，提升了用户体验。

### 3.3 数据库设计 (Schema)
主要数据表结构：
- `profiles`: 用户资料 (id, username, avatar_url)
- `map_records`: 地图记录 (id, lat, lng, title, images[], user_id)
- `likes`: 点赞关联 (record_id, user_id)
- `comments`: 评论数据 (record_id, user_id, content)
- **外键约束**: 严格的外键约束（Foreign Keys）确保了数据的一致性（例如删除用户会自动清理其关联的评论）。

---

## 4. 总结
本项目通过结合 Electron 的跨平台能力、Python 的 AI 处理能力以及 Supabase 的云端服务，构建了一个功能完备的观鸟应用。设计上注重模块化和用户体验，特别是在网络稳定性和社交互动方面做了针对性的优化。
