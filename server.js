const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// 存储房间信息
const rooms = {};

// 游戏模式定义与编号
const GAME_MODES = {
    GO: '1',      // 围棋编号 1
    GOMOKU: '2',  // 五子棋编号 2
    XIANGQI: '3'  // 象棋编号 3
};

const MODE_NAMES = {
    [GAME_MODES.GO]: '围棋',
    [GAME_MODES.GOMOKU]: '五子棋',
    [GAME_MODES.XIANGQI]: '中国象棋'
};

// 棋盘初始化
const createInitialBoard = (mode, size) => {
    if (mode === GAME_MODES.XIANGQI) {
        // 象棋 9x10 棋盘
        const board = Array(10).fill(null).map(() => Array(9).fill(0));
        // 0:空, 1-7:红方(帅仕相马车炮兵), 8-14:黑方(将士象马车炮卒)
        // 红方初始化
        const redInit = [5, 4, 3, 2, 1, 2, 3, 4, 5];
        board[9] = [...redInit];
        board[7][1] = 6; board[7][7] = 6;
        for (let i = 0; i < 9; i += 2) board[6][i] = 7;
        // 黑方初始化
        const blackInit = [12, 11, 10, 9, 8, 9, 10, 11, 12];
        board[0] = [...blackInit];
        board[2][1] = 13; board[2][7] = 13;
        for (let i = 0; i < 9; i += 2) board[3][i] = 14;
        return board;
    }
    return Array(size).fill(null).map(() => Array(size).fill(0));
};

// 检查棋盘是否为空
const isBoardEmpty = (room) => {
    if (room.gameMode === GAME_MODES.XIANGQI) {
        return room.history.length === 0;
    }
    return room.board.every(row => row.every(cell => cell === 0));
};

// 广播在线玩家信息给所有客户端
function broadcastOnlinePlayers() {
    const onlineData = [];
    for (const roomID in rooms) {
        const room = rooms[roomID];
        const modeName = MODE_NAMES[room.gameMode] || '未知模式';
        room.players.forEach(p => {
            onlineData.push({
                username: p.username,
                roomID: roomID,
                gameMode: room.gameMode,
                gameModeName: modeName,
                role: p.role
            });
        });
    }
    io.emit('onlinePlayers', onlineData);
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 发送当前在线玩家数据给新连接的客户端
    const onlineData = [];
    for (const roomID in rooms) {
        const room = rooms[roomID];
        const modeName = MODE_NAMES[room.gameMode] || '未知模式';
        room.players.forEach(p => {
            onlineData.push({
                username: p.username,
                roomID: roomID,
                gameMode: room.gameMode,
                gameModeName: modeName,
                role: p.role
            });
        });
    }
    socket.emit('onlinePlayers', onlineData);


    socket.on('joinRoom', ({ roomID, username, gameMode, boardSize }) => {
        if (!roomID || !username) return;

        // 规范化输入的 roomID
        const normalizedRoomID = String(roomID).trim();
        const incomingMode = String(gameMode || GAME_MODES.GOMOKU).trim(); // 默认五子棋

        if (rooms[normalizedRoomID]) {
            // 校验游戏模式是否匹配
            const room = rooms[normalizedRoomID];

            // 按照用户逻辑：如果房间号相同，校验游戏编号是否相同
            if (String(room.gameMode).trim() !== incomingMode) {
                console.log(`Mode mismatch: room=${room.gameMode}, join=${incomingMode} in room ${normalizedRoomID}`);
                return socket.emit('gameModeMismatch', {
                    requiredMode: room.gameMode,
                    requiredModeName: MODE_NAMES[room.gameMode] || '未知模式'
                });
            }
            // 如果房间号相同且游戏编号相同，逻辑继续，进入该房间
        }
        // 如果房间号不同说明是一个新的房间，由下面 !rooms[normalizedRoomID] 逻辑创建

        socket.join(normalizedRoomID);

        if (!rooms[normalizedRoomID]) {
            const size = parseInt(boardSize) || 15;

            rooms[normalizedRoomID] = {
                players: [],
                gameMode: incomingMode,
                boardSize: size,
                board: createInitialBoard(incomingMode, size),
                history: [],
                lastMove: null,
                turn: 1, // 1 为黑/红, 2 为白/黑
                resetVotes: new Set(),
                undoVotes: new Set(),
                hostId: socket.id,
                undoRequesterId: null,
                capturedStones: { 1: 0, 2: 0 }, // 围棋提子数
                previousBoardState: null, // 围棋劫争检测
                gameOver: false, // 游戏结束标志
                pendingRequests: new Map(), // 待审批的加入请求
            };
        }

        const room = rooms[normalizedRoomID];

        // 确保房主 ID 在 players 中有对应的 isHost 标记
        room.hostId = room.players.length > 0 ? room.hostId : socket.id;

        // 检查用户是否已在房间
        let player = room.players.find(p => p.id === socket.id);
        if (!player) {
            let role = 0; // 默认观众
            if (room.players.filter(p => p.role !== 0).length < 2) {
                const takenRoles = room.players.map(p => p.role);
                role = takenRoles.includes(1) ? 2 : 1;
            }
            player = { id: socket.id, username, role, isHost: room.hostId === socket.id };
            room.players.push(player);
        }

        // 发送初始化信息给新进入的用户
        socket.emit('initData', {
            myId: socket.id,
            roomID: normalizedRoomID,
            gameMode: room.gameMode,
            boardSize: room.boardSize,
            players: room.players,
            board: room.board,
            lastMove: room.lastMove,
            turn: room.turn,
            isHost: room.hostId === socket.id,
            isStarted: !isBoardEmpty(room)
        });

        // 广播房间人员变动
        io.to(normalizedRoomID).emit('updatePlayers', room.players);
        socket.emit('updateBoard', {
            board: room.board,
            turn: room.turn,
            lastMove: room.lastMove,
            isStarted: !isBoardEmpty(room)
        });

        console.log(`User ${username} joined ${room.gameMode} room ${normalizedRoomID}`);
        broadcastOnlinePlayers();
    });

    // 房主设置玩家角色
    socket.on('setPlayerRole', ({ roomID, targetId, role }) => {
        const room = rooms[roomID];
        if (!room || room.hostId !== socket.id) return;

        // 开局后禁止设置角色
        if (!isBoardEmpty(room)) {
            return socket.emit('errorMsg', '游戏进行中，无法更改角色');
        }

        const player = room.players.find(p => p.id === targetId);
        if (player) {
            // 如果目标要设为黑/白，先检查该角色是否已被占用
            if (role !== 0) {
                const otherPlayer = room.players.find(p => p.role === role && p.id !== targetId);
                if (otherPlayer) otherPlayer.role = 0; // 原占有者变为观众
            }
            player.role = role;
            io.to(roomID).emit('updatePlayers', room.players);
        }
    });

    socket.on('pass', (roomID) => {
        const room = rooms[roomID];
        if (!room || room.gameOver) return;
        if (room.gameMode !== GAME_MODES.GO) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.role === 0) return;
        if (room.turn !== player.role) return;

        const lastHistory = room.history.length > 0 ? room.history[room.history.length - 1] : null;
        room.history.push({ type: 'pass', role: player.role });
        room.turn = player.role === 1 ? 2 : 1;

        io.to(roomID).emit('updateBoard', {
            board: room.board, turn: room.turn, lastMove: room.lastMove, isStarted: true, capturedStones: room.capturedStones
        });
        io.to(roomID).emit('playerPassed', { username: player.username });

        // 连续两次pass，游戏结束
        if (lastHistory && lastHistory.type === 'pass') {
            // 简易计算：比较提子数
            const score1 = room.capturedStones[1];
            const score2 = room.capturedStones[2] + 6.5; // 黑先贴6.5目
            let winner, winnerName;
            if (score1 > score2) {
                winner = 1;
                winnerName = room.players.find(p => p.role === 1)?.username || '黑棋';
            } else {
                winner = 2;
                winnerName = room.players.find(p => p.role === 2)?.username || '白棋';
            }
            io.to(roomID).emit('gameOver', { winner, winnerName, score: { black: score1, white: score2 } });
            resetRoomAfterGame(room, roomID);
        }
    });

    socket.on('makeMove', ({ roomID, row, col, role, targetRow, targetCol }) => {
        const room = rooms[roomID];
        if (!room) return;
        if (room.gameOver) return; // 游戏已结束，等待重置

        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.role !== role) return;

        if (room.turn !== role) return;

        if (room.gameMode === GAME_MODES.GOMOKU) {
            handleGomokuMove(room, row, col, role, player, roomID);
        } else if (room.gameMode === GAME_MODES.GO) {
            handleGoMove(room, row, col, role, player, roomID);
        } else if (room.gameMode === GAME_MODES.XIANGQI) {
            handleXiangqiMove(room, row, col, targetRow, targetCol, role, player, roomID);
        }
    });

    // --- 游戏逻辑处理函数 ---

    function handleGomokuMove(room, row, col, role, player, roomID) {
        if (room.board[row][col] === 0) {
            const wasEmpty = isBoardEmpty(room);
            room.board[row][col] = role;
            room.lastMove = { row, col };
            room.history.push({ type: 'move', row, col, role });
            room.turn = role === 1 ? 2 : 1;

            io.to(roomID).emit('updateBoard', {
                board: room.board, turn: room.turn, lastMove: room.lastMove, isStarted: true
            });

            if (wasEmpty) io.to(roomID).emit('updatePlayers', room.players);

            const winData = checkGomokuWin(room.board, row, col, role, room.boardSize);
            if (winData) {
                io.to(roomID).emit('gameOver', { winner: role, winnerName: player.username, winLine: winData.line });
                resetRoomAfterGame(room, roomID);
            }
        }
    }

    function handleGoMove(room, row, col, role, player, roomID) {
        if (room.board[row][col] === 0) {
            // 尝试落子并检查提子
            const newBoard = JSON.parse(JSON.stringify(room.board));
            newBoard[row][col] = role;
            const captured = findCapturedStones(newBoard, row, col, role);

            // 检查自杀
            if (captured.length === 0 && !hasLiberties(newBoard, row, col)) {
                return socket.emit('errorMsg', '此处是禁着点（自杀）');
            }

            // 提子
            captured.forEach(pos => {
                newBoard[pos.r][pos.c] = 0;
            });

            // 打劫检测：不能重现上一步之前的局面
            const newBoardStr = JSON.stringify(newBoard);
            if (room.previousBoardState && newBoardStr === room.previousBoardState) {
                return socket.emit('errorMsg', '禁止全局同形（打劫）');
            }

            // 保存当前局面用于下次劫争检测
            room.previousBoardState = JSON.stringify(room.board);
            // 更新棋盘
            room.board = newBoard;
            captured.forEach(pos => {
                room.capturedStones[role] += 1;
            });

            room.lastMove = { row, col };
            room.history.push({ type: 'move', row, col, role, captured });
            room.turn = role === 1 ? 2 : 1;

            io.to(roomID).emit('updateBoard', {
                board: room.board, turn: room.turn, lastMove: room.lastMove, isStarted: true, capturedStones: room.capturedStones
            });
        }
    }

    function handleXiangqiMove(room, row, col, targetRow, targetCol, role, player, roomID) {
        const piece = room.board[row][col];
        if (!piece) return;
        // 校验：必须移动自己的棋子
        if (role === 1 && !(piece >= 1 && piece <= 7)) return;
        if (role === 2 && !(piece >= 8 && piece <= 14)) return;
        // 不能吃自己的棋子
        const targetPiece = room.board[targetRow][targetCol];
        if (role === 1 && targetPiece >= 1 && targetPiece <= 7) return;
        if (role === 2 && targetPiece >= 8 && targetPiece <= 14) return;
        // 不能原地不动
        if (row === targetRow && col === targetCol) return;
        // 走子规则校验
        if (!isValidXiangqiMove(room.board, piece, row, col, targetRow, targetCol)) {
            return socket.emit('errorMsg', '不符合走子规则');
        }

        // 模拟走子后检查是否被将军（送将检查）
        const tempBoard = room.board.map(r => [...r]);
        tempBoard[targetRow][targetCol] = piece;
        tempBoard[row][col] = 0;
        if (isKingInCheck(tempBoard, role)) {
            return socket.emit('errorMsg', '不能送将');
        }

        room.board[targetRow][targetCol] = piece;
        room.board[row][col] = 0;

        room.lastMove = { row: targetRow, col: targetCol, fromRow: row, fromCol: col };
        room.history.push({ type: 'move', fromRow: row, fromCol: col, toRow: targetRow, toCol: targetCol, piece, targetPiece, role });
        room.turn = role === 1 ? 2 : 1;

        io.to(roomID).emit('updateBoard', {
            board: room.board, turn: room.turn, lastMove: room.lastMove, isStarted: true
        });

        // 检查对方是否被将死
        const nextRole = role === 1 ? 2 : 1;
        if (isCheckmate(room.board, nextRole)) {
            io.to(roomID).emit('gameOver', { winner: role, winnerName: player.username });
            resetRoomAfterGame(room, roomID);
        }
    }

    function resetRoomAfterGame(room, roomID) {
        room.gameOver = true;
        room.players.forEach(p => {
            if (p.role === 1) p.role = -1;
            else if (p.role === 2) p.role = 1;
        });
        room.players.forEach(p => {
            if (p.role === -1) p.role = 2;
        });
        setTimeout(() => {
            room.board = createInitialBoard(room.gameMode, room.boardSize);
            room.history = [];
            room.lastMove = null;
            room.turn = 1;
            room.gameOver = false;
            room.capturedStones = { 1: 0, 2: 0 };
            room.previousBoardState = null;
            room.resetVotes.clear();
            room.undoVotes.clear();
            io.to(roomID).emit('updatePlayers', room.players);
            io.to(roomID).emit('updateBoard', { board: room.board, turn: room.turn, lastMove: null });
            io.to(roomID).emit('gameReset', '游戏结束，已重置并调换角色');
        }, 3000);
    }

    // 悔棋逻辑
    socket.on('requestUndo', (roomID) => {
        const room = rooms[roomID];
        if (!room || room.history.length === 0 || room.gameOver) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.role === 0) return;

        // 记录是谁发起的悔棋，以便在确认时知道回退几步
        room.undoRequesterId = socket.id;
        room.undoVotes.clear();
        room.undoVotes.add(socket.id);
        // 广播给房间内其他对弈玩家
        const opponent = room.players.find(p => p.role !== 0 && p.id !== socket.id);
        if (opponent) {
            // 直接向对手的 socket ID 发送消息，不再校验 socket 实例是否存在
            io.to(opponent.id).emit('undoRequested', { username: player.username });
        } else {
            room.undoVotes.clear();
            room.undoRequesterId = null;
            socket.emit('errorMsg', '没有对手可以响应悔棋请求');
        }
    });

    socket.on('confirmUndo', ({ roomID, accept }) => {
        const room = rooms[roomID];
        if (!room) return;

        // 防止发起者自己确认/拒绝自己的悔棋请求
        if (socket.id === room.undoRequesterId) return;

        // 只有对弈玩家（非观众）才能响应
        const responder = room.players.find(p => p.id === socket.id);
        if (!responder || responder.role === 0) return;

        if (accept) {
            const requester = room.players.find(p => p.id === room.undoRequesterId);
            if (!requester) {
                room.undoVotes.clear();
                room.undoRequesterId = null;
                return;
            }

            const targetRole = requester.role;

            if (room.gameMode === GAME_MODES.XIANGQI) {
                let lastAction = room.history[room.history.length - 1];
                if (!lastAction) return;

                if (room.turn !== targetRole) {
                    const last = room.history.pop();
                    room.board[last.fromRow][last.fromCol] = last.piece;
                    room.board[last.toRow][last.toCol] = last.targetPiece;
                    room.turn = last.role;
                } else {
                    if (room.history.length > 0) {
                        const last1 = room.history.pop();
                        room.board[last1.fromRow][last1.fromCol] = last1.piece;
                        room.board[last1.toRow][last1.toCol] = last1.targetPiece;
                        room.turn = last1.role;
                    }
                    if (room.history.length > 0) {
                        const last2 = room.history.pop();
                        room.board[last2.fromRow][last2.fromCol] = last2.piece;
                        room.board[last2.toRow][last2.toCol] = last2.targetPiece;
                        room.turn = last2.role;
                    }
                }
            } else {
                if (room.turn !== targetRole) {
                    const last = room.history.pop();
                    undoStandardMove(room, last);
                    room.turn = last.role;
                } else {
                    for (let i = 0; i < 2; i++) {
                        if (room.history.length > 0) {
                            const last = room.history.pop();
                            undoStandardMove(room, last);
                            room.turn = last.role;
                        }
                    }
                }
            }

            function undoStandardMove(room, last) {
                if (last.type === 'pass') return;
                room.board[last.row][last.col] = 0;
                if (room.gameMode === GAME_MODES.GO && last.captured) {
                    last.captured.forEach(pos => {
                        room.board[pos.r][pos.c] = last.role === 1 ? 2 : 1;
                        room.capturedStones[last.role] -= 1;
                    });
                }
            }

            if (room.gameMode === GAME_MODES.XIANGQI) {
                const last = room.history.length > 0 ? room.history[room.history.length - 1] : null;
                room.lastMove = last ? { row: last.toRow, col: last.toCol, fromRow: last.fromRow, fromCol: last.fromCol } : null;
            } else {
                const last = room.history.length > 0 ? room.history[room.history.length - 1] : null;
                room.lastMove = last ? { row: last.row, col: last.col } : null;
            }

            if (room.gameMode === GAME_MODES.GO) {
                room.previousBoardState = null;
            }

            io.to(roomID).emit('updateBoard', {
                board: room.board,
                turn: room.turn,
                lastMove: room.lastMove,
                isStarted: !isBoardEmpty(room),
                capturedStones: room.capturedStones
            });
            io.to(roomID).emit('undoSuccess');

            room.undoVotes.clear();
            room.undoRequesterId = null;
        } else {
            const savedRequesterId = room.undoRequesterId;
            room.undoVotes.clear();
            room.undoRequesterId = null;
            // 只通知发起悔棋的人被拒绝，而不是广播给所有人
            if (savedRequesterId) {
                const requesterSocket = io.sockets.sockets.get(savedRequesterId);
                if (requesterSocket) {
                    requesterSocket.emit('undoDeclined');
                }
            }
        }
    });

    // 认输逻辑
    socket.on('surrender', (roomID) => {
        const room = rooms[roomID];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.role === 0) return;

        const winnerRole = player.role === 1 ? 2 : 1;
        const winner = room.players.find(p => p.role === winnerRole);

        room.gameOver = true;
        io.to(roomID).emit('gameOver', {
            winner: winnerRole,
            winnerName: winner ? winner.username : (winnerRole === 1 ? (room.gameMode === GAME_MODES.XIANGQI ? '红方' : '黑棋') : (room.gameMode === GAME_MODES.XIANGQI ? '黑方' : '白棋')),
            isSurrender: true,
            loserName: player.username
        });

        // 重置逻辑
        room.players.forEach(p => {
            if (p.role === 1) p.role = -1;
            else if (p.role === 2) p.role = 1;
        });
        room.players.forEach(p => {
            if (p.role === -1) p.role = 2;
        });
        setTimeout(() => {
            room.board = createInitialBoard(room.gameMode, room.boardSize);
            room.history = [];
            room.lastMove = null;
            room.turn = 1;
            room.gameOver = false;
            room.capturedStones = { 1: 0, 2: 0 };
            room.previousBoardState = null;
            room.resetVotes.clear();
            room.undoVotes.clear();
            io.to(roomID).emit('updatePlayers', room.players);
            io.to(roomID).emit('updateBoard', { board: room.board, turn: room.turn, lastMove: null });
            io.to(roomID).emit('gameReset', '对方已认输，角色已调换！');
        }, 2000);
    });

    socket.on('requestReset', (roomID) => {
        const room = rooms[roomID];
        if (!room || room.gameOver) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player || player.role === 0) return;

        if (room.players.filter(p => p.role !== 0).length < 2) {
            room.board = createInitialBoard(room.gameMode, room.boardSize);
            room.history = [];
            room.lastMove = null;
            room.turn = 1;
            room.capturedStones = { 1: 0, 2: 0 };
            room.previousBoardState = null;
            room.resetVotes.clear();
            room.undoVotes.clear();
            io.to(roomID).emit('updateBoard', { board: room.board, turn: room.turn, lastMove: null });
            io.to(roomID).emit('gameReset', '棋盘已重置');
            return;
        }

        room.resetVotes.add(socket.id);
        const opponent = room.players.find(p => p.role !== 0 && p.id !== socket.id);
        if (opponent) {
            const opponentSocket = io.sockets.sockets.get(opponent.id);
            if (opponentSocket) {
                opponentSocket.emit('resetRequested', { role: player.role, username: player.username });
            }
        }
    });

    socket.on('confirmReset', ({ roomID, accept }) => {
        const room = rooms[roomID];
        if (!room) return;

        // 防止发起者自己响应自己的重置请求
        if (room.resetVotes.has(socket.id)) return;

        if (accept) {
            room.resetVotes.add(socket.id);
            if (room.resetVotes.size >= 2) {
                room.board = createInitialBoard(room.gameMode, room.boardSize);
                room.history = [];
                room.lastMove = null;
                room.turn = 1;
                room.capturedStones = { 1: 0, 2: 0 };
                room.previousBoardState = null;
                room.resetVotes.clear();
                room.undoVotes.clear();
                io.to(roomID).emit('updateBoard', { board: room.board, turn: room.turn, lastMove: null });
                io.to(roomID).emit('gameReset', '棋盘已重置');
            }
        } else {
            const resetRequesterIds = [...room.resetVotes];
            room.resetVotes.clear();
            // 只通知发起重置的人被拒绝
            resetRequesterIds.forEach(id => {
                const s = io.sockets.sockets.get(id);
                if (s) s.emit('resetDeclined');
            });
        }
    });

    // 申请加入房间（需要房主审批）
    socket.on('requestJoinRoom', ({ roomID, username, gameMode: reqGameMode }) => {
        if (!roomID || !username) return;
        const normalizedRoomID = String(roomID).trim();
        const room = rooms[normalizedRoomID];
        if (!room) {
            return socket.emit('joinRequestDeclined', { reason: '房间不存在' });
        }

        // 校验游戏模式
        const incomingMode = String(reqGameMode || GAME_MODES.GOMOKU).trim();
        if (String(room.gameMode).trim() !== incomingMode) {
            return socket.emit('joinRequestDeclined', { reason: `游戏模式不匹配，该房间为${MODE_NAMES[room.gameMode] || '未知模式'}` });
        }

        // 检查是否已在房间
        if (room.players.find(p => p.id === socket.id)) {
            return socket.emit('joinRequestDeclined', { reason: '你已在该房间中' });
        }

        // 检查是否已有待处理的请求
        if (room.pendingRequests && room.pendingRequests.has(socket.id)) {
            return socket.emit('joinRequestDeclined', { reason: '你的申请正在等待审批' });
        }

        // 存储待审批请求
        if (!room.pendingRequests) room.pendingRequests = new Map();
        room.pendingRequests.set(socket.id, { username, gameMode: incomingMode });

        // 通知房主
        const hostSocket = io.sockets.sockets.get(room.hostId);
        if (hostSocket) {
            hostSocket.emit('joinRequestReceived', {
                requesterId: socket.id,
                username: username,
                roomID: normalizedRoomID
            });
        } else {
            // 如果房主不在线，直接拒绝
            room.pendingRequests.delete(socket.id);
            socket.emit('joinRequestDeclined', { reason: '房主不在线' });
        }
    });

    // 房主响应加入请求
    socket.on('respondJoinRequest', ({ roomID, requesterId, accept }) => {
        const room = rooms[roomID];
        if (!room) return;
        if (room.hostId !== socket.id) return; // 只有房主能响应

        if (!room.pendingRequests) return;
        const requestData = room.pendingRequests.get(requesterId);
        if (!requestData) return;

        room.pendingRequests.delete(requesterId);

        const requesterSocket = io.sockets.sockets.get(requesterId);
        if (!requesterSocket) return; // 请求者已断线

        if (accept) {
            // 让请求者加入房间
            requesterSocket.join(roomID);

            let role = 0; // 默认观众
            if (room.players.filter(p => p.role !== 0).length < 2) {
                const takenRoles = room.players.map(p => p.role);
                role = takenRoles.includes(1) ? 2 : 1;
            }
            const player = { id: requesterId, username: requestData.username, role, isHost: false };
            room.players.push(player);

            // 发送初始化信息给新玩家
            requesterSocket.emit('initData', {
                myId: requesterId,
                roomID: roomID,
                gameMode: room.gameMode,
                boardSize: room.boardSize,
                players: room.players,
                board: room.board,
                lastMove: room.lastMove,
                turn: room.turn,
                isHost: false,
                isStarted: !isBoardEmpty(room)
            });

            io.to(roomID).emit('updatePlayers', room.players);
            requesterSocket.emit('updateBoard', {
                board: room.board,
                turn: room.turn,
                lastMove: room.lastMove,
                isStarted: !isBoardEmpty(room)
            });

            broadcastOnlinePlayers();
            console.log(`User ${requestData.username} approved to join room ${roomID}`);
        } else {
            requesterSocket.emit('joinRequestDeclined', { reason: '房主拒绝了你的加入请求' });
        }
    });

    // 踢出玩家
    socket.on('kickPlayer', ({ roomID, targetId }) => {
        const room = rooms[roomID];
        if (!room) return;
        if (room.hostId !== socket.id) return; // 只有房主能踢人
        if (targetId === socket.id) return; // 不能踢自己

        const targetIndex = room.players.findIndex(p => p.id === targetId);
        if (targetIndex === -1) return;

        const targetPlayer = room.players[targetIndex];
        room.players.splice(targetIndex, 1);

        // 让被踢玩家离开 socket 房间
        const targetSocket = io.sockets.sockets.get(targetId);
        if (targetSocket) {
            targetSocket.leave(roomID);
            targetSocket.emit('kicked', { reason: '你已被房主移出房间' });
        }

        io.to(roomID).emit('updatePlayers', room.players);
        broadcastOnlinePlayers();
        console.log(`User ${targetPlayer.username} was kicked from room ${roomID}`);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        for (const roomID in rooms) {
            const room = rooms[roomID];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);

            if (playerIndex !== -1) {
                const wasHost = room.players[playerIndex].isHost;
                room.players.splice(playerIndex, 1);

                if (room.players.length === 0) {
                    delete rooms[roomID];
                } else {
                    // 如果房主离开了，转移房主权限给下一个人
                    if (wasHost) {
                        room.hostId = room.players[0].id;
                        room.players[0].isHost = true;
                    }
                    io.to(roomID).emit('updatePlayers', room.players);
                }
            }
        }
        broadcastOnlinePlayers();
    });
});

// --- 辅助逻辑 ---

function checkGomokuWin(board, row, col, role, size) {
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of directions) {
        let count = 1;
        let line = [{ row, col }];
        let r = row + dr; let c = col + dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === role) {
            count++; line.push({ row: r, col: c }); r += dr; c += dc;
        }
        r = row - dr; c = col - dc;
        while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === role) {
            count++; line.push({ row: r, col: c }); r -= dr; c -= dc;
        }
        if (count >= 5) return { line };
    }
    return null;
}

function findCapturedStones(board, row, col, role) {
    const opponent = role === 1 ? 2 : 1;
    const captured = [];
    const visitedGroups = new Set();
    const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    const size = board.length;

    directions.forEach(([dr, dc]) => {
        const nr = row + dr, nc = col + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === opponent) {
            const key = `${nr},${nc}`;
            if (visitedGroups.has(key)) return;
            const group = getGroup(board, nr, nc);
            group.forEach(pos => visitedGroups.add(`${pos.r},${pos.c}`));
            if (!hasLibertiesInGroup(board, group)) {
                group.forEach(pos => captured.push(pos));
            }
        }
    });
    return captured;
}

function getGroup(board, r, c) {
    const color = board[r][c];
    const group = [];
    const visited = new Set();
    const stack = [{ r, c }];
    const size = board.length;

    while (stack.length > 0) {
        const curr = stack.pop();
        const key = `${curr.r},${curr.c}`;
        if (visited.has(key)) continue;
        visited.add(key);
        group.push(curr);

        [[0, 1], [0, -1], [1, 0], [-1, 0]].forEach(([dr, dc]) => {
            const nr = curr.r + dr, nc = curr.c + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === color) {
                stack.push({ r: nr, c: nc });
            }
        });
    }
    return group;
}

function hasLiberties(board, r, c) {
    return hasLibertiesInGroup(board, getGroup(board, r, c));
}

function hasLibertiesInGroup(board, group) {
    const size = board.length;
    for (const pos of group) {
        const neighbors = [[0, 1], [0, -1], [1, 0], [-1, 0]];
        for (const [dr, dc] of neighbors) {
            const nr = pos.r + dr, nc = pos.c + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] === 0) return true;
        }
    }
    return false;
}

function isValidXiangqiMove(board, piece, fr, fc, tr, tc) {
    const dr = tr - fr, dc = tc - fc;
    const adr = Math.abs(dr), adc = Math.abs(dc);
    const pieceType = piece <= 7 ? piece : piece - 7; // 1帅2仕3相4马5车6炮7兵

    switch (pieceType) {
        case 1: // 帅/将
            if (adr + adc !== 1) {
                // 飞将：同一列，对方将帅之间无棋子
                const target = board[tr][tc];
                if (dc === 0 && (target === 1 || target === 8)) {
                    const minR = Math.min(fr, tr), maxR = Math.max(fr, tr);
                    let blocked = false;
                    for (let r = minR + 1; r < maxR; r++) {
                        if (board[r][fc] !== 0) { blocked = true; break; }
                    }
                    if (!blocked) return true;
                }
                return false;
            }
            if (piece <= 7) { // 红帅：7-9行，3-5列
                return tr >= 7 && tr <= 9 && tc >= 3 && tc <= 5;
            } else { // 黑将：0-2行，3-5列
                return tr >= 0 && tr <= 2 && tc >= 3 && tc <= 5;
            }

        case 2: // 仕/士
            if (adr !== 1 || adc !== 1) return false;
            if (piece <= 7) {
                return tr >= 7 && tr <= 9 && tc >= 3 && tc <= 5;
            } else {
                return tr >= 0 && tr <= 2 && tc >= 3 && tc <= 5;
            }

        case 3: // 相/象
            if (adr !== 2 || adc !== 2) return false;
            // 不能过河
            if (piece <= 7 && tr < 5) return false;
            if (piece > 7 && tr > 4) return false;
            // 塞象眼
            if (board[fr + dr / 2][fc + dc / 2] !== 0) return false;
            return true;

        case 4: // 马
            if (adr === 2 && adc === 1) {
                // 蹩马腿
                if (board[fr + (dr > 0 ? 1 : -1)][fc] !== 0) return false;
                return true;
            }
            if (adr === 1 && adc === 2) {
                if (board[fr][fc + (dc > 0 ? 1 : -1)] !== 0) return false;
                return true;
            }
            return false;

        case 5: // 车
            if (dr !== 0 && dc !== 0) return false;
            return countBetween(board, fr, fc, tr, tc) === 0;

        case 6: // 炮
            if (dr !== 0 && dc !== 0) return false;
            {
                const cnt = countBetween(board, fr, fc, tr, tc);
                const target = board[tr][tc];
                if (target === 0) return cnt === 0; // 移动：无阻挡
                return cnt === 1; // 吃子：翻山
            }

        case 7: // 兵/卒
            if (piece <= 7) { // 红兵：向上走（行号减小）
                if (fr >= 5) { // 未过河：只能前进
                    return dc === 0 && dr === -1;
                } else { // 过河：可前进或横走
                    return (dc === 0 && dr === -1) || (adc === 1 && dr === 0);
                }
            } else { // 黑卒：向下走（行号增大）
                if (fr <= 4) { // 未过河
                    return dc === 0 && dr === 1;
                } else { // 过河
                    return (dc === 0 && dr === 1) || (adc === 1 && dr === 0);
                }
            }

        default:
            return false;
    }
}

function countBetween(board, fr, fc, tr, tc) {
    let count = 0;
    if (fr === tr) {
        const min = Math.min(fc, tc), max = Math.max(fc, tc);
        for (let c = min + 1; c < max; c++) {
            if (board[fr][c] !== 0) count++;
        }
    } else {
        const min = Math.min(fr, tr), max = Math.max(fr, tr);
        for (let r = min + 1; r < max; r++) {
            if (board[r][fc] !== 0) count++;
        }
    }
    return count;
}

function isKingInCheck(board, role) {
    // 找到己方的将/帅位置
    const kingPiece = role === 1 ? 1 : 8;
    let kr = -1, kc = -1;
    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            if (board[r][c] === kingPiece) {
                kr = r; kc = c;
                break;
            }
        }
        if (kr !== -1) break;
    }

    if (kr === -1) return false;

    // 检查对方所有棋子是否能吃到这个将/帅
    const opponentRole = role === 1 ? 2 : 1;
    const minOpponent = opponentRole === 1 ? 1 : 8;
    const maxOpponent = opponentRole === 1 ? 7 : 14;

    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 9; c++) {
            const p = board[r][c];
            if (p >= minOpponent && p <= maxOpponent) {
                if (isValidXiangqiMove(board, p, r, c, kr, kc)) {
                    return true;
                }
            }
        }
    }
    return false;
}

function isCheckmate(board, role) {
    // 如果当前没被将军，不算将死
    if (!isKingInCheck(board, role)) return false;

    // 尝试己方所有合法走法，看是否能解将
    const minPiece = role === 1 ? 1 : 8;
    const maxPiece = role === 1 ? 7 : 14;

    for (let fr = 0; fr < 10; fr++) {
        for (let fc = 0; fc < 9; fc++) {
            const p = board[fr][fc];
            if (p < minPiece || p > maxPiece) continue;

            for (let tr = 0; tr < 10; tr++) {
                for (let tc = 0; tc < 9; tc++) {
                    if (fr === tr && fc === tc) continue;
                    const target = board[tr][tc];
                    // 不能吃自己的子
                    if (target >= minPiece && target <= maxPiece) continue;

                    if (isValidXiangqiMove(board, p, fr, fc, tr, tc)) {
                        // 模拟走子
                        const tempBoard = board.map(r => [...r]);
                        tempBoard[tr][tc] = p;
                        tempBoard[fr][fc] = 0;
                        if (!isKingInCheck(tempBoard, role)) {
                            return false; // 找到一步能解将的棋，未被将死
                        }
                    }
                }
            }
        }
    }
    return true; // 无合法走法能解将，将死
}

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

const shutdown = () => {
    console.log('\nStopping server...');
    server.close(() => { process.exit(0); });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
