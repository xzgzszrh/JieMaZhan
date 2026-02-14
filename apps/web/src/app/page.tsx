"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useGameSocket } from "@/hooks/useGameSocket";

const DIGITS = [1, 2, 3, 4] as const;
type GuessTuple = [1 | 2 | 3 | 4, 1 | 2 | 3 | 4, 1 | 2 | 3 | 4];

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
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [playerCount, setPlayerCount] = useState<4 | 6 | 8>(4);
  const [clues, setClues] = useState<[string, string, string]>(["", "", ""]);
  const [guessByTarget, setGuessByTarget] = useState<Record<string, GuessTuple>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);

  const myTeam = useMemo(() => state?.teams.find((t) => t.id === state.me.teamId), [state]);
  const myTeamId = state?.me.teamId;
  const myTeamLabel = myTeam?.label ?? "未分队";
  const winnerLabels = useMemo(() => {
    if (!state) {
      return [];
    }
    return (state.winnerTeamIds ?? []).map((id) => state.teams.find((t) => t.id === id)?.label ?? id);
  }, [state]);

  const mySpeakingAttempt = useMemo(() => {
    if (!state) {
      return undefined;
    }
    return state.currentAttempts.find((attempt) => attempt.speakerPlayerId === state.me.id);
  }, [state]);

  const myTeamAttempt = useMemo(() => {
    if (!state || !myTeamId) {
      return undefined;
    }
    return state.currentAttempts.find((attempt) => attempt.targetTeamId === myTeamId);
  }, [state, myTeamId]);

  const isHost = Boolean(state?.me.isHost);
  const canSubmitClues = Boolean(
    state?.status === "IN_GAME" &&
      state.phase === "SPEAKING" &&
      mySpeakingAttempt &&
      !mySpeakingAttempt.clues
  );

  const guessTargets = useMemo(() => {
    if (!state || state.status !== "IN_GAME" || state.phase !== "GUESSING" || !myTeamId) {
      return [];
    }

    return state.currentAttempts.filter((attempt) => {
      if (attempt.targetTeamId === myTeamId) {
        return attempt.internalGuesserPlayerId === state.me.id;
      }
      return true;
    });
  }, [state, myTeamId]);

  const getGuessForTarget = (targetTeamId: string): GuessTuple => {
    return guessByTarget[targetTeamId] ?? [1, 2, 3];
  };

  const isTargetSubmittedByMe = (targetTeamId: string): boolean => {
    if (!state) {
      return false;
    }
    const attempt = state.currentAttempts.find((item) => item.targetTeamId === targetTeamId);
    if (!attempt) {
      return false;
    }
    if (targetTeamId === state.me.teamId) {
      return attempt.internalGuessByMe;
    }
    return attempt.interceptPlayerIdsSubmitted.includes(state.me.id);
  };

  const submittedGuessCount = guessTargets.filter((attempt) => isTargetSubmittedByMe(attempt.targetTeamId)).length;
  const phaseSummary = state
    ? state.status === "LOBBY"
      ? "大厅准备阶段"
      : state.phase === "SPEAKING"
        ? "发言阶段 · 各队同步发言"
        : "猜测阶段 · 完成全部目标猜测"
    : "";

  const taskSummary = state
    ? state.status === "LOBBY"
      ? isHost
        ? "你的任务：等待人齐后开始游戏"
        : "你的任务：等待房主开始游戏"
      : state.phase === "SPEAKING"
        ? canSubmitClues
          ? "你的任务：提交 3 条线索"
          : myTeamAttempt && !myTeamAttempt.clues
            ? "你的任务：等待本队 speaker 发言"
            : "你的任务：等待其他队伍完成发言"
        : guessTargets.length === 0
          ? "你的任务：等待可猜测目标"
          : submittedGuessCount >= guessTargets.length
            ? "你的状态：已完成本轮全部猜测"
            : `你的任务：提交猜测（${submittedGuessCount}/${guessTargets.length}）`
    : "";

  const hasNickname = nickname.trim().length > 0;

  useEffect(() => {
    const storage = debugMultiPlayer ? window.sessionStorage : window.localStorage;
    const savedNickname = storage.getItem("decrypto_nickname");
    if (savedNickname?.trim()) {
      const trimmed = savedNickname.trim();
      setNickname(trimmed);
      setNicknameDraft(trimmed);
    }
  }, [debugMultiPlayer]);

  useEffect(() => {
    if (!state?.me.nickname) {
      return;
    }
    setNickname((prev) => prev || state.me.nickname);
    setNicknameDraft((prev) => prev || state.me.nickname);
  }, [state?.me.nickname]);

  useEffect(() => {
    if (!state || state.phase !== "GUESSING") {
      setGuessByTarget({});
      return;
    }

    setGuessByTarget((prev) => {
      const next: Record<string, GuessTuple> = {};
      for (const attempt of state.currentAttempts) {
        next[attempt.targetTeamId] = prev[attempt.targetTeamId] ?? [1, 2, 3];
      }
      return next;
    });
  }, [state?.phase, state?.round, state?.currentAttempts]);

  useEffect(() => {
    if (!state || state.phase !== "SPEAKING" || !mySpeakingAttempt) {
      setSecondsLeft(60);
      return;
    }

    const timer = window.setInterval(() => {
      const delta = Date.now() - mySpeakingAttempt.startedAt;
      const left = Math.max(0, 60 - Math.floor(delta / 1000));
      setSecondsLeft(left);
    }, 500);

    return () => window.clearInterval(timer);
  }, [state, mySpeakingAttempt]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!hasNickname) {
      return;
    }
    await createRoom(nickname, playerCount);
  };

  const handleJoinRoom = async (targetRoomId: string) => {
    if (!hasNickname) {
      return;
    }
    await joinRoom(nickname, targetRoomId.toUpperCase());
  };

  const handleConfirmNickname = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = nicknameDraft.trim();
    if (!trimmed) {
      return;
    }
    setNickname(trimmed);
    setNicknameDraft(trimmed);
    const storage = debugMultiPlayer ? window.sessionStorage : window.localStorage;
    storage.setItem("decrypto_nickname", trimmed);
  };

  const resetNickname = () => {
    setNickname("");
    setNicknameDraft("");
    const storage = debugMultiPlayer ? window.sessionStorage : window.localStorage;
    storage.removeItem("decrypto_nickname");
  };

  const fillByAI = async () => {
    if (!state?.me.teamId) {
      return;
    }
    const aiClues = await aiAction(state.me.teamId);
    setClues(aiClues);
  };

  const submitMyGuess = async (targetTeamId: string) => {
    const guess = getGuessForTarget(targetTeamId);
    if (new Set(guess).size !== 3) {
      return;
    }
    await submitGuess(targetTeamId, guess);
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

      {!state && (
        <>
          <p className="muted">Decrypto Online</p>
          <h1 className="big-title">截码战</h1>
          <p className="muted">移动端优先 · 极简黑白 · 实时对局</p>
        </>
      )}

      {!state && (
        <>
          <section className="card" style={{ marginTop: 12 }}>
            <h2 className="title">设定昵称</h2>
            {!hasNickname ? (
              <form onSubmit={handleConfirmNickname}>
                <div className="row wrap">
                  <input
                    className="input"
                    placeholder="你的昵称"
                    value={nicknameDraft}
                    onChange={(e) => setNicknameDraft(e.target.value)}
                  />
                  <button type="submit" className="btn">
                    确认昵称
                  </button>
                </div>
              </form>
            ) : (
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <p className="muted" style={{ margin: 0 }}>
                  当前昵称：{nickname}
                </p>
                <button className="btn secondary" style={{ width: "auto", minHeight: 34 }} onClick={resetNickname}>
                  修改昵称
                </button>
              </div>
            )}
          </section>

          {hasNickname && (
            <>
              <section className="card" style={{ marginTop: 12 }}>
                <h2 className="title">创建房间</h2>
                <form onSubmit={handleCreate}>
                  <div className="row wrap">
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
        </>
      )}

      {state && (
        <>
          <section className="card" style={{ marginTop: 12 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <strong>你在 {myTeamLabel}</strong>
              <span className="badge">Round {state.round}</span>
            </div>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              {phaseSummary}
            </p>
            <p className="muted" style={{ margin: "8px 0 0" }}>
              {taskSummary}
            </p>
            {myTeam && <p className="muted" style={{ margin: "8px 0 0" }}>胜利进度：{myTeam.score} / 2 分</p>}
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

          {canSubmitClues && mySpeakingAttempt && (
            <section className="card" style={{ marginTop: 10 }}>
              <h2 className="title">发言面板</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                当前编码：{mySpeakingAttempt.code?.join("-")} · 剩余 {secondsLeft}s
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

          {state.status === "IN_GAME" && state.phase === "GUESSING" && (
            <section className="card" style={{ marginTop: 10 }}>
              <h2 className="title">猜测面板</h2>
              {guessTargets.length === 0 && <p className="muted">本阶段暂无可提交目标。</p>}
              {guessTargets.map((attempt) => {
                const targetLabel = state.teams.find((team) => team.id === attempt.targetTeamId)?.label ?? attempt.targetTeamId;
                const isInternal = attempt.targetTeamId === state.me.teamId;
                const currentGuess = getGuessForTarget(attempt.targetTeamId);
                const submitted = isTargetSubmittedByMe(attempt.targetTeamId);

                return (
                  <div key={attempt.targetTeamId} style={{ borderTop: "1px solid #2a2a2a", paddingTop: 10, marginTop: 10 }}>
                    <p className="muted" style={{ marginTop: 0 }}>
                      目标：{targetLabel} · 类型：{isInternal ? "本队内猜" : "截获猜测"} · 线索：{(attempt.clues ?? []).join(" / ")}
                    </p>
                    <div className="grid-3">
                      {[0, 1, 2].map((idx) => (
                        <select
                          key={`${attempt.targetTeamId}-${idx}`}
                          className="select"
                          disabled={submitted}
                          value={currentGuess[idx]}
                          onChange={(e) => {
                            const next = [...currentGuess] as GuessTuple;
                            next[idx] = Number(e.target.value) as 1 | 2 | 3 | 4;
                            setGuessByTarget((prev) => ({
                              ...prev,
                              [attempt.targetTeamId]: next
                            }));
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
                    <button className="btn" style={{ marginTop: 8 }} disabled={submitted} onClick={() => submitMyGuess(attempt.targetTeamId)}>
                      {submitted ? "已提交" : "提交猜测"}
                    </button>
                  </div>
                );
              })}
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
                        return (
                          <p className="muted" style={{ margin: "0 0 6px" }}>
                            本轮加分：无
                          </p>
                        );
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
