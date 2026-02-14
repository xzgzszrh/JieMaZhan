"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useGameSocket } from "@/hooks/useGameSocket";

const DIGITS = [1, 2, 3, 4] as const;

export default function Page() {
  const {
    state,
    availableRooms,
    error,
    debugMultiPlayer,
    createRoom,
    joinRoom,
    startGame,
    leaveRoom,
    disbandRoom,
    submitClues,
    submitGuess,
    aiAction,
    refreshJoinableRooms
  } = useGameSocket();
  const [nickname, setNickname] = useState("");
  const [playerCount, setPlayerCount] = useState<4 | 6 | 8>(4);
  const [clues, setClues] = useState<[string, string, string]>(["", "", ""]);
  const [guess, setGuess] = useState<[1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4]>([1, 2, 3]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  const myTeam = useMemo(() => state?.teams.find((t) => t.id === state.me.teamId), [state]);
  const winnerLabels = useMemo(() => {
    if (!state) {
      return [];
    }
    return (state.winnerTeamIds ?? []).map((id) => state.teams.find((t) => t.id === id)?.label ?? id);
  }, [state]);
  const isSpeaker = Boolean(state?.currentAttempt && state.me.id === state.currentAttempt.speakerPlayerId);
  const isHost = Boolean(state?.me.isHost);
  const canSubmitClues = state?.status === "IN_GAME" && state.phase === "SPEAKING" && isSpeaker;
  const canGuess = state?.status === "IN_GAME" && state.phase === "GUESSING" && Boolean(state.currentAttempt?.clues);

  useEffect(() => {
    if (!state?.currentAttempt || state.phase !== "SPEAKING") {
      setSecondsLeft(60);
      return;
    }
    const timer = window.setInterval(() => {
      const delta = Date.now() - state.currentAttempt!.startedAt;
      const left = Math.max(0, 60 - Math.floor(delta / 1000));
      setSecondsLeft(left);
    }, 500);
    return () => window.clearInterval(timer);
  }, [state?.currentAttempt, state?.phase]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!nickname.trim()) {
      return;
    }
    await createRoom(nickname.trim(), playerCount);
  };

  const handleJoinRoom = async (targetRoomId: string) => {
    if (!nickname.trim()) {
      return;
    }
    await joinRoom(nickname.trim(), targetRoomId.toUpperCase());
  };

  const fillByAI = async () => {
    if (!state?.me.teamId) {
      return;
    }
    const aiClues = await aiAction(state.me.teamId);
    setClues(aiClues);
  };

  const submitMyGuess = async () => {
    if (!state?.currentAttempt) {
      return;
    }
    if (new Set(guess).size !== 3) {
      return;
    }
    await submitGuess(state.currentAttempt.targetTeamId, guess);
  };

  const toggleDebugMode = () => {
    const params = new URLSearchParams(window.location.search);
    if (debugMultiPlayer) {
      params.delete("debug_multi_player");
    } else {
      params.set("debug_multi_player", "1");
    }
    const nextQuery = params.toString();
    window.location.search = nextQuery ? `?${nextQuery}` : "";
  };

  return (
    <main className="main-wrap">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <p className="muted" style={{ margin: 0 }}>
          调试模式：{debugMultiPlayer ? "开（多标签独立身份）" : "关（多标签共享身份）"}
        </p>
        <button className="btn secondary" style={{ width: "auto", minHeight: 34 }} onClick={toggleDebugMode}>
          {debugMultiPlayer ? "关闭调试" : "开启调试"}
        </button>
      </div>
      <p className="muted">Decrypto Online</p>
      <h1 className="big-title">截码战</h1>
      <p className="muted">移动端优先 · 极简黑白 · 实时对局</p>

      {!state && (
        <>
          <section className="card" style={{ marginTop: 12 }}>
            <h2 className="title">创建房间</h2>
            <form onSubmit={handleCreate}>
              <div className="row wrap">
                <input className="input" placeholder="你的昵称" value={nickname} onChange={(e) => setNickname(e.target.value)} />
                <select className="select" value={playerCount} onChange={(e) => setPlayerCount(Number(e.target.value) as 4 | 6 | 8)}>
                  <option value={4}>4人 / 2队</option>
                  <option value={6}>6人 / 3队</option>
                  <option value={8}>8人 / 4队</option>
                </select>
                <button type="submit" className="btn">
                  创建
                </button>
              </div>
            </form>
          </section>

          <section className="card" style={{ marginTop: 10 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h2 className="title">可用房间</h2>
              <button className="btn secondary" style={{ width: "auto", minHeight: 34 }} onClick={() => refreshJoinableRooms()}>
                刷新
              </button>
            </div>
            <div className="row wrap" style={{ marginBottom: 10 }}>
              <input className="input" placeholder="你的昵称（加入房间时使用）" value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </div>

            {availableRooms.length === 0 && <p className="muted">当前没有可加入的房间。</p>}
            {availableRooms.map((room) => (
              <div key={room.roomId} style={{ borderTop: "1px solid #2a2a2a", paddingTop: 8, marginTop: 8 }}>
                <p style={{ margin: "0 0 6px" }}>
                  <strong>{room.roomName}</strong>
                </p>
                <p className="muted" style={{ margin: "0 0 8px" }}>
                  房间号 #{room.roomId} · 房主 {room.hostNickname} · 人数 {room.currentPlayerCount}/{room.targetPlayerCount}
                </p>
                <button className="btn secondary" onClick={() => handleJoinRoom(room.roomId)}>
                  加入该房间
                </button>
              </div>
            ))}
          </section>
        </>
      )}

      {state && (
        <>
          <section className="card" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong>{state.roomName}</strong>
              <span className="badge">Round {state.round}</span>
            </div>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              房间号 #{state.roomId}
            </p>
            <p className="muted" style={{ margin: "8px 0 0" }}>
              {state.status === "LOBBY" ? "等待房主开始" : state.status === "IN_GAME" ? `${state.phase === "SPEAKING" ? "发言阶段" : "猜测阶段"}` : "对局结束"}
            </p>
            {winnerLabels.length > 0 && <p>胜者：{winnerLabels.join("、")}</p>}
            {state.status === "LOBBY" && (
              <div className="row" style={{ marginTop: 10 }}>
                {isHost ? (
                  <>
                    <button className="btn" onClick={() => startGame()}>
                      开始游戏
                    </button>
                    <button
                      className="btn secondary"
                      onClick={async () => {
                        if (!window.confirm("确定解散房间吗？")) {
                          return;
                        }
                        await disbandRoom();
                      }}
                    >
                      解散房间
                    </button>
                  </>
                ) : (
                  <button
                    className="btn secondary"
                    onClick={async () => {
                      if (!window.confirm("确定退出房间吗？")) {
                        return;
                      }
                      await leaveRoom();
                    }}
                  >
                    退出房间
                  </button>
                )}
              </div>
            )}
          </section>

          <section className="card" style={{ marginTop: 10 }}>
            <h2 className="title">队伍状态</h2>
            {state.teams.map((team) => (
              <div key={team.id} style={{ borderTop: "1px solid #2a2a2a", paddingTop: 8, marginTop: 8 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{team.label}</strong>
                  <span className="muted">积分 {team.score}</span>
                </div>
                <p className="muted" style={{ margin: "5px 0" }}>
                  {team.players.map((p) => `${p.nickname}${p.online ? "" : "(离线)"}`).join(" · ")}
                </p>
                {team.secretWords && (
                  <div className="secret-grid">
                    {team.secretWords.map((word) => (
                      <div key={word.index} className="secret-item">
                        <span>{word.index}</span>
                        <span>{word.zh}</span>
                        <span className="muted">{word.en}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>

          {canSubmitClues && state.currentAttempt && (
            <section className="card" style={{ marginTop: 10 }}>
              <h2 className="title">发言面板</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                当前编码：{state.currentAttempt.code?.join("-")} · 剩余 {secondsLeft}s
              </p>
              <div className="grid-3">
                {clues.map((item, idx) => (
                  <input
                    key={idx}
                    className="input"
                    value={item}
                    maxLength={10}
                    placeholder={`线索 ${idx + 1}`}
                    onChange={(e) => {
                      const next = [...clues] as [string, string, string];
                      next[idx] = e.target.value;
                      setClues(next);
                    }}
                  />
                ))}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn secondary" onClick={fillByAI}>
                  AI 生成线索
                </button>
                <button className="btn" onClick={() => submitClues(clues)}>
                  提交发言
                </button>
              </div>
            </section>
          )}

          {canGuess && state.currentAttempt && (
            <section className="card" style={{ marginTop: 10 }}>
              <h2 className="title">猜测面板</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                目标：{state.teams.find((t) => t.id === state.currentAttempt?.targetTeamId)?.label} · 线索：
                {(state.currentAttempt.clues ?? []).join(" / ")}
              </p>
              <div className="grid-3">
                {[0, 1, 2].map((idx) => (
                  <select
                    key={idx}
                    className="select"
                    value={guess[idx]}
                    onChange={(e) => {
                      const next = [...guess] as [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4];
                      next[idx] = Number(e.target.value) as 1 | 2 | 3 | 4;
                      setGuess(next);
                    }}
                  >
                    {DIGITS.map((digit) => (
                      <option key={digit} value={digit}>
                        {digit}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
              <button className="btn" style={{ marginTop: 8 }} onClick={submitMyGuess}>
                提交猜测
              </button>
            </section>
          )}

          <div className="drawer-wrapper">
            <section className={`drawer ${drawerOpen ? "open" : ""}`}>
              <header className="drawer-header" onClick={() => setDrawerOpen((v) => !v)}>
                <strong>记录区（Deduction）</strong>
                <span className="muted">{drawerOpen ? "收起" : "展开"}</span>
              </header>
              <div className="drawer-body">
                {state.deductionRows.map((row, index) => (
                  <div key={`${row.teamId}-${row.round}-${index}`} style={{ marginBottom: 14 }}>
                    <p className="muted" style={{ margin: "0 0 6px" }}>
                      {state.teams.find((t) => t.id === row.teamId)?.label} · Round {row.round}
                    </p>
                    {(() => {
                      const matched = state.history.find((item) => item.round === row.round && item.targetTeamId === row.teamId);
                      if (!matched || matched.scoreDeltas.length === 0) {
                        return <p className="muted" style={{ margin: "0 0 6px" }}>本轮加分：无</p>;
                      }
                      const summary = matched.scoreDeltas
                        .map((delta) => {
                          const teamLabel = state.teams.find((t) => t.id === delta.teamId)?.label ?? delta.teamId;
                          const reason = delta.reason === "INTERCEPT_CORRECT" ? "截获成功" : "对方内猜错误";
                          return `${teamLabel}+${delta.points}（${reason}）`;
                        })
                        .join("，");
                      return (
                        <p className="muted" style={{ margin: "0 0 6px" }}>
                          本轮加分：{summary}
                        </p>
                      );
                    })()}
                    <table className="record-table">
                      <thead>
                        <tr>
                          <th>1</th>
                          <th>2</th>
                          <th>3</th>
                          <th>4</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>{row.byNumber[1]}</td>
                          <td>{row.byNumber[2]}</td>
                          <td>{row.byNumber[3]}</td>
                          <td>{row.byNumber[4]}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ))}
                {state.deductionRows.length === 0 && <p className="muted">尚无记录。</p>}
              </div>
            </section>
          </div>
        </>
      )}

      {error && <p style={{ color: "#ff8f8f" }}>{error}</p>}
    </main>
  );
}
