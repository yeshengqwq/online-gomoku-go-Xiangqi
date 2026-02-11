🎮 在线五子棋对弈平台 (Online Gomoku Platform)
English | 中文说明
<a name="chinese"></a>
🇨🇳 中文说明
这是一个轻量级的实时在线五子棋对弈平台，支持多人远程联机。本项目采用 Node.js 开发，利用 WebSocket 实现零延迟同步。
🚀 运行步骤
1. 环境准备
在使用本项目前，请确保你的电脑已经安装了 Node.js。
2. 安装项目依赖（重要）
下载代码后，请先打开终端（命令行），进入本项目根目录，执行以下命令来安装必要的运行环境：
npm install
3. 启动服务
安装完成后，执行以下命令开启服务器：
node server.js
或者使用：
npm start
此时，程序会启动并默认占用 3000 端口。
4. 开启内网穿透（实现公网对战）
为了让不在同一局域网的朋友也能加入房间，你需要将本地端口映射到公网。
推荐工具：cpolar（开源、免费且稳定）。
操作：将本地 3000 端口映射后，你会获得一个公网网址，将该网址发给你的好友即可。
🕹️ 如何开始对弈
创建/加入房间：
打开网址后，用户名和房间号均可根据喜好自由填写。
系统提供 3 种玩法模式供选择，请根据兴趣选择进入。
好友联机须知：
房间号：房客必须填写与房主完全一致的房间号。
用户名：房客的用户名不能与房主重复，否则可能导致连接冲突。
<a name="english"></a>
🇺🇸 English Version
A lightweight real-time online Gomoku (Five in a Row) platform for multiplayer battles. Built with Node.js and WebSocket for seamless synchronization.
🚀 Deployment Guide
1. Prerequisites
Ensure that Node.js is installed on your system before running the project.
2. Install Dependencies (Crucial)
After downloading the code, open your terminal, navigate to the project root directory, and run:
npm install
3. Start the Server
Once dependencies are installed, run:
node server.js
or
npm start
The server will start on port 3000 by default.
4. Public Access (Intranet Mapping)
To play with friends over the internet, you need to expose your local port.
Recommended Tool: cpolar (Open-source, free, and stable).
Action: Map local port 3000 to a public URL and share it with your opponent.
🕹️ How to Play
Create/Join a Room:
Enter any Username and Room ID you like.
There are 3 gameplay modes available.
Multiplayer Rules:
Room ID: The guest must enter the exact same Room ID as the host.
Username: The guest's username must be unique (different from the host's) to avoid connection conflicts.