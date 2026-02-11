---

# 🎮 在线五子棋对弈平台 / Online Gomoku

[English](#english-version) | [中文说明](#chinese-version)

---

<a name="chinese-version"></a>

## 🇨🇳 中文说明

这是一个轻量级的实时在线五子棋对弈平台，支持多人远程联机。本项目采用 **Node.js** 开发，利用 **WebSocket** 实现零延迟同步。

### 🚀 运行步骤

#### 1. 环境准备
在使用本项目前，请确保你的电脑已经安装了 [Node.js](https://nodejs.org/)。

#### 2. 安装项目依赖（重要）
下载代码后，请在终端（命令行）进入项目根目录，运行以下命令安装环境：

```bash
npm install
```

#### 3. 启动服务
安装完成后，执行以下命令开启服务器：

```bash
node server.js
```
*或者使用 `npm start`（如果你在 package.json 中配置了启动脚本）。*
此时，程序会启动并默认占用 **3000** 端口。

#### 4. 开启内网穿透（实现公网对战）
推荐使用 **cpolar** 将本地 3000 端口映射到公网，将生成的网址发给好友即可对战。

---

### 🕹️ 如何开始对弈
1. **创建/加入房间**：输入任意用户名和房间号，选择一种玩法进入。
2. **好友联机须知**：
   * **房间号**：好友必须输入和你完全一致的房间号。
   * **用户名**：好友的用户名**不能**和你重复。

---

<a name="english-version"></a>

## 🇺🇸 English Version

A lightweight real-time online Gomoku platform built with **Node.js** and **WebSocket**.

### 🚀 Deployment Guide

#### 1. Prerequisites
Ensure that **Node.js** is installed on your system.

#### 2. Install Dependencies
Open your terminal in the project root directory and run:

```bash
npm install
```

#### 3. Start the Server
Run the following command to start:

```bash
node server.js
```
The server will start on port **3000** by default.

#### 4. Public Access
Use tools like **cpolar** to map local port 3000 to a public URL and share it with your opponent.

---

### 🕹️ How to Play
1. **Join a Room**: Enter any Username and Room ID.
2. **Rules for Multiplayer**:
   * **Room ID**: Must be the **same** as the host.
   * **Username**: Must be **unique** to avoid connection conflicts.

---
